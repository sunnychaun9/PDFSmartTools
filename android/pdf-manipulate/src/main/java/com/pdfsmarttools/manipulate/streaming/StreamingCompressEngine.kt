package com.pdfsmarttools.manipulate.streaming

import android.graphics.Bitmap
import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.manipulate.cache.PdfCacheManager
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.pdfsmarttools.pdfcore.engine.CompressEngine
import com.pdfsmarttools.pdfcore.engine.CompressParams
import com.pdfsmarttools.pdfcore.engine.CompressResult
import com.pdfsmarttools.pdfcore.engine.MemoryPolicy
import com.pdfsmarttools.pdfcore.engine.SavePolicy
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.coroutines.coroutineContext

/**
 * Streaming PDF compression engine for large files.
 *
 * Compresses PDFs page-by-page using the streaming pipeline:
 * ```
 * PdfStreamingEngine
 *     |
 *     v
 * PdfPageStreamReader (reads source page-by-page, temp-file mode)
 *     |
 *     v
 * Page Image Recompressor (extracts images, recompresses to JPEG)
 *     |
 *     v
 * Output Document (imports compressed page, flushes periodically)
 * ```
 *
 * Memory improvements over non-streaming:
 * - 40-60% less RAM for large files (200MB+)
 * - No full-document load; only current page images in heap
 * - MemoryBudget integration pauses on pressure
 *
 * Implements [CompressEngine] = `PdfEngine<CompressParams, CompressResult>`.
 */
class StreamingCompressEngine : CompressEngine {

    companion object {
        private const val TAG = "StreamingCompressEngine"
        private const val MIN_IMAGE_DIMENSION = 64
    }

    override val tag: String = "StreamingCompressEngine"
    override val memoryPolicy: MemoryPolicy = MemoryPolicy.TEMP_FILE_ONLY
    override val savePolicy: SavePolicy = SavePolicy.ATOMIC_VALIDATED

    override suspend fun execute(
        params: CompressParams,
        reporter: ProgressReporter
    ): PdfResult<CompressResult> {
        val startTime = System.currentTimeMillis()

        PdfBoxFacade.ensureInitialized(params.context)

        val inputFile = File(params.inputPath)
        if (!inputFile.exists()) {
            return PdfResult.failure(
                com.pdfsmarttools.core.result.PdfError.FileNotFound(params.inputPath)
            )
        }

        val outputFile = File(params.outputPath)
        outputFile.parentFile?.mkdirs()
        val originalSize = inputFile.length()
        val jpegQuality = params.level.quality / 100f

        return PdfResult.runCatching {
            doStreamingCompress(
                params, inputFile, outputFile, jpegQuality, originalSize, startTime, reporter
            )
        }.also {
            if (it is PdfResult.Failure) {
                outputFile.delete()
            }
        }
    }

    private suspend fun doStreamingCompress(
        params: CompressParams,
        inputFile: File,
        outputFile: File,
        jpegQuality: Float,
        originalSize: Long,
        startTime: Long,
        reporter: ProgressReporter
    ): CompressResult {

        val reader = PdfPageStreamReader(inputFile)
        var processedPages = 0

        try {
            // Use cache for fast page count lookup
            val cachedPageCount = PdfCacheManager.getPageCount(inputFile)

            reader.open()
            val totalPages = if (cachedPageCount > 0) cachedPageCount else reader.pageCount

            if (totalPages == 0) {
                throw IllegalArgumentException("PDF has no pages")
            }

            Log.i(TAG, "Streaming compress: ${originalSize / (1024 * 1024)}MB, " +
                    "$totalPages pages, quality=${jpegQuality}" +
                    if (cachedPageCount > 0) " (page count from cache)" else "")

            PdfBoxFacade.createDocument().use { outputDoc ->

                for (pageIndex in 0 until totalPages) {
                    coroutineContext.ensureActive()

                    // Memory pressure check
                    ensureMemoryForPage()

                    // Read source page via stream reader
                    val sourcePage = reader.getPage(pageIndex)

                    // Import page into output document
                    val importedPage = outputDoc.importPage(sourcePage)

                    // Recompress images on this page
                    recompressPageImages(outputDoc, importedPage, jpegQuality)

                    // Apply watermark for free users
                    if (!params.isPro) {
                        PdfBoxFacade.addWatermarkToPage(outputDoc, importedPage)
                    }

                    // Release page memory
                    reader.releaseCurrentPage()
                    processedPages++

                    // Progress: 0-85 for processing, 85-100 for save+validate
                    val progress = ((processedPages * 85) / totalPages).coerceIn(0, 85)
                    reporter.onProgress(progress, processedPages, totalPages,
                        "Compressing page $processedPages of $totalPages")

                    // Periodic GC for large documents
                    if (processedPages % 20 == 0) {
                        MemoryBudget.reset()
                        if (MemoryBudget.heapUsagePercent() > 65) {
                            System.gc()
                            Log.d(TAG, "GC at page $processedPages: " +
                                    "heap=${MemoryBudget.heapUsagePercent()}%")
                        }
                    }
                }

                // Save atomically
                reporter.onStage(88, "Saving compressed document...")
                PdfBoxFacade.atomicSave(outputDoc, outputFile)
            }

            // Validate output
            reporter.onStage(95, "Validating output...")
            val validation = PdfBoxFacade.validateOutput(outputFile, processedPages)
            if (!validation.valid) {
                outputFile.delete()
                throw IllegalStateException(
                    "Output validation failed: ${validation.errorMessage}"
                )
            }

            // Invalidate output file from cache (it's a new file)
            PdfCacheManager.invalidateByPath(outputFile.absolutePath)

            val compressedSize = outputFile.length()
            val durationMs = System.currentTimeMillis() - startTime

            PdfBoxFacade.logMetrics(OperationMetrics(
                operationName = "streaming_compress_${params.level.name}",
                fileCount = 1,
                pageCount = processedPages,
                inputSizeBytes = originalSize,
                outputSizeBytes = compressedSize,
                durationMs = durationMs
            ))

            reporter.onComplete("Streaming compressed $processedPages pages")

            return CompressResult(
                outputPath = outputFile.absolutePath,
                outputSize = compressedSize,
                originalSize = originalSize,
                compressionRatio = if (originalSize > 0) {
                    1.0 - (compressedSize.toDouble() / originalSize.toDouble())
                } else 0.0,
                pageCount = processedPages
            )

        } catch (e: CancellationException) {
            outputFile.delete()
            throw e
        } finally {
            reader.close()
        }
    }

    /**
     * Recompress images on a single page. Extracts each image, compresses
     * to JPEG at the specified quality, and replaces in the page resources.
     * Bitmaps are recycled immediately in try/finally.
     */
    private fun recompressPageImages(
        document: PDDocument,
        page: PDPage,
        jpegQuality: Float
    ) {
        val resources = page.resources ?: return

        try {
            for (name in resources.xObjectNames) {
                try {
                    val xObj = resources.getXObject(name)
                    if (xObj is PDImageXObject &&
                        xObj.width >= MIN_IMAGE_DIMENSION &&
                        xObj.height >= MIN_IMAGE_DIMENSION
                    ) {
                        // Check memory before extracting bitmap
                        if (!MemoryBudget.canAllocateBitmap(xObj.width, xObj.height)) {
                            Log.w(TAG, "Skipping image ${xObj.width}x${xObj.height}: " +
                                    "insufficient memory")
                            continue
                        }

                        val bitmap = xObj.image ?: continue
                        try {
                            val baos = ByteArrayOutputStream()
                            bitmap.compress(
                                Bitmap.CompressFormat.JPEG,
                                (jpegQuality * 100).toInt(),
                                baos
                            )
                            val newImage = JPEGFactory.createFromStream(
                                document,
                                ByteArrayInputStream(baos.toByteArray())
                            )
                            resources.put(name, newImage)
                        } finally {
                            bitmap.recycle()
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Skipping image $name: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Skipping page image recompression: ${e.message}")
        }
    }

    private suspend fun ensureMemoryForPage() {
        if (MemoryBudget.heapUsagePercent() <= 75) return

        // Trim cache to free memory before GC
        PdfCacheManager.trimForMemoryPressure()

        for (attempt in 1..3) {
            MemoryBudget.reset()
            System.gc()
            kotlinx.coroutines.delay((attempt * 150L).coerceAtMost(500L))
            if (MemoryBudget.heapUsagePercent() <= 75) return
        }

        Log.w(TAG, "Memory constrained: heap=${MemoryBudget.heapUsagePercent()}%, " +
                "continuing cautiously")
    }
}
