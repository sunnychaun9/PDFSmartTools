package com.pdfsmarttools.pdfcompressor

import android.graphics.Bitmap
import android.content.Context
import android.util.Log
import com.pdfsmarttools.common.MemoryBudget
import com.pdfsmarttools.common.OperationMetrics
import com.pdfsmarttools.common.ParallelPageProcessor
import com.pdfsmarttools.common.PdfBoxHelper
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.coroutineContext

/**
 * Work unit for extraction phase: one image extracted from a page.
 */
private data class ImageWorkUnit(
    val pageIndex: Int,
    val imageName: COSName,
    val bitmap: Bitmap,
    val quality: Float
)

/**
 * Result of parallel compression phase: JPEG bytes ready to apply.
 */
private data class CompressedImage(
    val pageIndex: Int,
    val imageName: COSName,
    val jpegBytes: ByteArray
)

class PdfCompressorEngine {

    companion object {
        private const val TAG = "PdfCompressorEngine"
        // Maximum recommended file size for processing (100MB)
        private const val MAX_RECOMMENDED_FILE_SIZE = 100L * 1024 * 1024
        // Threshold for chunked compression (100MB)
        private const val CHUNKED_THRESHOLD = 100L * 1024 * 1024
        // Pages per chunk for chunked compression
        private const val CHUNK_SIZE = 50
        // Skip images smaller than this (likely icons/logos)
        private const val MIN_IMAGE_DIMENSION = 64
        // Batch size for parallel processing (pages per batch)
        private const val DEFAULT_BATCH_SIZE = 10
        // Minimum available memory before stopping extraction (50MB)
        private const val MIN_MEMORY_FOR_EXTRACTION = 50L * 1024 * 1024
        // Threshold for using parallel path (minimum images)
        private const val PARALLEL_THRESHOLD = 3
    }

    /**
     * Compress a PDF using non-destructive PDFBox techniques.
     *
     * LOW (Light): Re-save only. COSWriter optimizes xref, removes unused objects. No image touching.
     * MEDIUM (Balanced): + Recompress embedded images as JPEG quality 75%.
     * HIGH (Strong): + Aggressive image recompression JPEG quality 50%.
     */
    suspend fun compress(
        context: Context,
        inputPath: String,
        outputPath: String,
        level: CompressionLevel,
        isPro: Boolean = false,
        onProgress: (progress: Int, currentPage: Int, totalPages: Int) -> Unit
    ): CompressionResult {
        val startTime = System.currentTimeMillis()
        PdfBoxHelper.ensureInitialized(context)

        val inputFile = PdfBoxHelper.resolveInputFile(context, inputPath, "compress")
        val isCacheFile = inputPath.startsWith("content://")

        try {
            if (!inputFile.exists()) {
                throw IllegalArgumentException("Input file not found: $inputPath")
            }

            val originalSize = inputFile.length()

            if (originalSize > MAX_RECOMMENDED_FILE_SIZE) {
                Log.w(TAG, "Processing large file: ${originalSize / (1024 * 1024)}MB - may take longer")
            }

            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()

            // For large files at MEDIUM/HIGH: use chunked compression to limit peak memory
            if (originalSize > CHUNKED_THRESHOLD && level != CompressionLevel.LOW) {
                return compressChunked(context, inputFile, outputFile, level, isPro, originalSize, startTime, onProgress)
            }

            // Use mixed memory: keep up to 50MB in RAM, spill rest to temp files
            PDDocument.load(inputFile, MemoryUsageSetting.setupMixed(50L * 1024 * 1024)).use { document ->
                val pageCount = document.numberOfPages

                if (pageCount == 0) {
                    throw IllegalArgumentException("PDF has no pages")
                }

                // For MEDIUM and HIGH: recompress embedded images
                if (level != CompressionLevel.LOW) {
                    val jpegQuality = level.quality / 100f

                    // Count total images to decide sequential vs parallel
                    val totalImages = countTotalImages(document, pageCount)

                    if (totalImages <= PARALLEL_THRESHOLD) {
                        // Few images: use simple sequential path
                        compressSequential(document, pageCount, jpegQuality, onProgress)
                    } else {
                        // Many images: use batched parallel compression
                        compressParallel(document, pageCount, jpegQuality, onProgress)
                    }
                } else {
                    // For LOW level, just report steady progress
                    for (i in 0 until pageCount) {
                        val progress = ((i + 1) * 80) / pageCount
                        onProgress(progress, i + 1, pageCount)
                    }
                }

                // Add watermark for free users
                if (!isPro) {
                    for (i in 0 until pageCount) {
                        coroutineContext.ensureActive()
                        PdfBoxHelper.addWatermarkToPage(document, document.getPage(i))
                    }
                }

                onProgress(90, pageCount, pageCount)

                // Save - COSWriter automatically optimizes xref tables and removes unused objects
                PdfBoxHelper.atomicSave(document, outputFile)

                onProgress(100, pageCount, pageCount)

                // Validate
                val validation = PdfBoxHelper.validateOutput(outputFile, pageCount)
                if (!validation.valid) {
                    throw IllegalStateException("Output validation failed: ${validation.errorMessage}")
                }

                val compressedSize = outputFile.length()
                val compressionRatio = if (originalSize > 0) {
                    1.0 - (compressedSize.toDouble() / originalSize.toDouble())
                } else {
                    0.0
                }

                // Log metrics
                PdfBoxHelper.logMetrics(OperationMetrics(
                    operationName = "compress_${level.name}",
                    fileCount = 1,
                    pageCount = pageCount,
                    inputSizeBytes = originalSize,
                    outputSizeBytes = compressedSize,
                    durationMs = System.currentTimeMillis() - startTime
                ))

                return CompressionResult(
                    outputPath = outputFile.absolutePath,
                    originalSize = originalSize,
                    compressedSize = compressedSize,
                    compressionRatio = compressionRatio,
                    pageCount = pageCount
                )
            }
        } catch (e: CancellationException) {
            File(outputPath).delete()
            throw e
        } catch (e: OutOfMemoryError) {
            File(outputPath).delete()
            throw IllegalStateException("Not enough memory to compress PDF", e)
        } catch (e: SecurityException) {
            File(outputPath).delete()
            throw IllegalArgumentException("PDF file is corrupted or password-protected", e)
        } catch (e: Exception) {
            File(outputPath).delete()
            throw e
        } finally {
            // Clean up cache file from content:// URI
            if (isCacheFile) {
                inputFile.delete()
            }
        }
    }

    /**
     * Count total compressible images across all pages (for parallel/sequential decision).
     */
    private fun countTotalImages(document: PDDocument, pageCount: Int): Int {
        var count = 0
        for (i in 0 until pageCount) {
            val resources = document.getPage(i).resources ?: continue
            try {
                for (name in resources.xObjectNames) {
                    try {
                        val xObj = resources.getXObject(name)
                        if (xObj is PDImageXObject &&
                            xObj.width >= MIN_IMAGE_DIMENSION &&
                            xObj.height >= MIN_IMAGE_DIMENSION) {
                            count++
                        }
                    } catch (_: Exception) { /* skip unreadable */ }
                }
            } catch (_: Exception) { /* skip page */ }
        }
        return count
    }

    /**
     * Sequential compression path for PDFs with few images.
     * Original simple loop — no parallel overhead.
     */
    private suspend fun compressSequential(
        document: PDDocument,
        pageCount: Int,
        jpegQuality: Float,
        onProgress: (Int, Int, Int) -> Unit
    ) {
        for (i in 0 until pageCount) {
            coroutineContext.ensureActive()

            val page = document.getPage(i)
            recompressPageImages(document, page, jpegQuality)

            if ((i + 1) % 5 == 0) {
                ParallelPageProcessor.checkMemoryAndGc(0.80, "CompressSeq")
            }

            val progress = ((i + 1) * 80) / pageCount
            onProgress(progress, i + 1, pageCount)
        }
    }

    /**
     * Batched parallel compression: Extract → Parallel Compress → Apply.
     *
     * PDDocument is NOT thread-safe for mutation, so extraction and application
     * are sequential. Only the CPU-bound JPEG encoding runs in parallel.
     */
    private suspend fun compressParallel(
        document: PDDocument,
        pageCount: Int,
        jpegQuality: Float,
        onProgress: (Int, Int, Int) -> Unit
    ) {
        val concurrency = ParallelPageProcessor.defaultConcurrency()
        var processedPages = 0

        // Process pages in batches
        var batchStart = 0
        while (batchStart < pageCount) {
            coroutineContext.ensureActive()

            // Determine batch end based on memory availability
            val batchEnd = calculateBatchEnd(batchStart, pageCount)

            // Phase 1 - Extract (sequential): decode image XObjects to Bitmaps
            val workUnits = mutableListOf<ImageWorkUnit>()
            for (i in batchStart until batchEnd) {
                coroutineContext.ensureActive()
                workUnits.addAll(extractPageImages(document.getPage(i), i, jpegQuality))
            }

            if (workUnits.isNotEmpty()) {
                // Phase 2 - Compress (parallel): JPEG encode bitmaps
                val compressed = parallelCompress(workUnits, concurrency) { completedInBatch ->
                    // Progress: 0-20% extraction, 20-70% compression
                    val extractionDone = (batchEnd.toFloat() / pageCount) * 20
                    val compressionProgress = (completedInBatch.toFloat() / workUnits.size) * 50 *
                        ((batchEnd - batchStart).toFloat() / pageCount)
                    val totalProgress = (extractionDone + compressionProgress).toInt().coerceAtMost(70)
                    onProgress(totalProgress, batchEnd, pageCount)
                }

                // Phase 3 - Apply (sequential): write JPEG bytes back into PDDocument
                applyCompressedImages(document, compressed)
            }

            processedPages = batchEnd

            // Report batch progress: map to 0-70% range
            val progress = ((processedPages * 70) / pageCount).coerceAtMost(70)
            onProgress(progress, processedPages, pageCount)

            // Memory check between batches
            ParallelPageProcessor.checkMemoryAndGc(0.80, "CompressBatch")

            batchStart = batchEnd
        }

        // Report 80% after all image processing complete
        onProgress(80, pageCount, pageCount)
    }

    /**
     * Calculate the end index of the current batch based on memory availability.
     */
    private fun calculateBatchEnd(batchStart: Int, pageCount: Int): Int {
        val defaultEnd = (batchStart + DEFAULT_BATCH_SIZE).coerceAtMost(pageCount)

        // If memory is tight, use smaller batch
        if (MemoryBudget.availableBytes() < MIN_MEMORY_FOR_EXTRACTION) {
            return (batchStart + 3).coerceAtMost(pageCount)
        }

        return defaultEnd
    }

    /**
     * Extract compressible images from a single page as ImageWorkUnits.
     * Sequential — requires PDDocument access.
     */
    private fun extractPageImages(page: PDPage, pageIndex: Int, quality: Float): List<ImageWorkUnit> {
        val resources = page.resources ?: return emptyList()
        val units = mutableListOf<ImageWorkUnit>()

        try {
            for (name in resources.xObjectNames) {
                try {
                    val xObj = resources.getXObject(name)
                    if (xObj is PDImageXObject) {
                        if (xObj.width < MIN_IMAGE_DIMENSION || xObj.height < MIN_IMAGE_DIMENSION) {
                            continue
                        }

                        val bitmap = xObj.image
                        if (bitmap != null) {
                            units.add(ImageWorkUnit(pageIndex, name, bitmap, quality))
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Skipping image $name during extraction: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Skipping page $pageIndex during extraction: ${e.message}")
        }

        return units
    }

    /**
     * Compress image bitmaps to JPEG byte arrays in parallel.
     * No PDDocument access — pure CPU-bound work, safe for parallel execution.
     * Bitmaps are recycled immediately after compression.
     */
    private suspend fun parallelCompress(
        units: List<ImageWorkUnit>,
        concurrency: Int,
        onProgress: (Int) -> Unit
    ): List<CompressedImage> = coroutineScope {
        val semaphore = Semaphore(concurrency)
        val completed = AtomicInteger(0)

        val deferred = units.map { unit ->
            async(Dispatchers.Default) {
                semaphore.withPermit {
                    try {
                        val baos = ByteArrayOutputStream()
                        unit.bitmap.compress(
                            Bitmap.CompressFormat.JPEG,
                            (unit.quality * 100).toInt(),
                            baos
                        )
                        unit.bitmap.recycle()

                        val count = completed.incrementAndGet()
                        onProgress(count)

                        CompressedImage(unit.pageIndex, unit.imageName, baos.toByteArray())
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to compress image ${unit.imageName}: ${e.message}")
                        unit.bitmap.recycle()
                        null
                    }
                }
            }
        }

        deferred.awaitAll().filterNotNull()
    }

    /**
     * Apply compressed JPEG bytes back into the PDDocument.
     * Sequential — requires PDDocument mutation access.
     */
    private fun applyCompressedImages(document: PDDocument, results: List<CompressedImage>) {
        // Group by page index for efficient page access
        val byPage = results.groupBy { it.pageIndex }

        for ((pageIndex, images) in byPage) {
            val page = document.getPage(pageIndex)
            val resources = page.resources ?: continue

            for (compressed in images) {
                try {
                    val inputStream = ByteArrayInputStream(compressed.jpegBytes)
                    val newImage = JPEGFactory.createFromStream(document, inputStream)
                    resources.put(compressed.imageName, newImage)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to apply compressed image ${compressed.imageName}: ${e.message}")
                }
            }
        }
    }

    /**
     * Recompress embedded images on a page as JPEG at the given quality.
     * Used by the sequential fallback path.
     * Skips small images (< 64px, likely icons/logos).
     */
    private fun recompressPageImages(document: PDDocument, page: PDPage, jpegQuality: Float) {
        val resources = page.resources ?: return

        try {
            for (name in resources.xObjectNames) {
                try {
                    val xObj = resources.getXObject(name)
                    if (xObj is PDImageXObject) {
                        // Skip small images (icons, logos)
                        if (xObj.width < MIN_IMAGE_DIMENSION || xObj.height < MIN_IMAGE_DIMENSION) {
                            continue
                        }

                        val bitmap = xObj.image // returns android.graphics.Bitmap
                        if (bitmap != null) {
                            try {
                                val newImage = JPEGFactory.createFromImage(document, bitmap, jpegQuality)
                                resources.put(name, newImage)
                            } finally {
                                bitmap.recycle()
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Skip individual image errors - don't fail the whole compression
                    Log.w(TAG, "Skipping image $name: ${e.message}")
                }
            }
        } catch (e: Exception) {
            // Skip page-level resource errors
            Log.w(TAG, "Skipping image recompression for page: ${e.message}")
        }
    }

    /**
     * Chunked compression for large files (>100MB).
     * Splits the PDF into CHUNK_SIZE-page chunks, compresses each independently,
     * then merges the compressed chunks. This reduces peak memory from the full
     * document to ~CHUNK_SIZE pages at a time.
     */
    private suspend fun compressChunked(
        context: Context,
        inputFile: File,
        outputFile: File,
        level: CompressionLevel,
        isPro: Boolean,
        originalSize: Long,
        startTime: Long,
        onProgress: (progress: Int, currentPage: Int, totalPages: Int) -> Unit
    ): CompressionResult {
        val cacheDir = File(context.cacheDir, "compress_chunks_${System.currentTimeMillis()}")
        cacheDir.mkdirs()
        val chunkFiles = mutableListOf<File>()

        try {
            // Step 1: Determine total page count using temp-file-only mode
            val totalPages: Int
            PDDocument.load(inputFile, MemoryUsageSetting.setupTempFileOnly()).use { doc ->
                totalPages = doc.numberOfPages
            }

            if (totalPages == 0) {
                throw IllegalArgumentException("PDF has no pages")
            }

            val jpegQuality = level.quality / 100f
            val totalChunks = (totalPages + CHUNK_SIZE - 1) / CHUNK_SIZE
            var processedPages = 0

            // Step 2: Process each chunk independently
            for (chunkIndex in 0 until totalChunks) {
                coroutineContext.ensureActive()

                val chunkStart = chunkIndex * CHUNK_SIZE
                val chunkEnd = minOf(chunkStart + CHUNK_SIZE, totalPages)
                val chunkFile = File(cacheDir, "chunk_$chunkIndex.pdf")
                chunkFiles.add(chunkFile)

                // Extract chunk pages into a new document
                PDDocument.load(inputFile, MemoryUsageSetting.setupMixed(50L * 1024 * 1024)).use { sourceDoc ->
                    PDDocument().use { chunkDoc ->
                        for (pageIndex in chunkStart until chunkEnd) {
                            coroutineContext.ensureActive()
                            val sourcePage = sourceDoc.getPage(pageIndex)
                            val imported = chunkDoc.importPage(sourcePage)

                            // Compress images on this page
                            recompressPageImages(chunkDoc, imported, jpegQuality)

                            // Add watermark for free users
                            if (!isPro) {
                                PdfBoxHelper.addWatermarkToPage(chunkDoc, imported)
                            }

                            processedPages++
                            val progress = ((processedPages * 80) / totalPages).coerceAtMost(80)
                            onProgress(progress, processedPages, totalPages)
                        }

                        chunkDoc.save(chunkFile)
                    }
                }

                // Force GC between chunks to reclaim memory
                System.gc()
                Log.d(TAG, "Chunk $chunkIndex compressed: ${chunkFile.length() / 1024}KB, heap: ${MemoryBudget.heapUsagePercent()}%")
            }

            onProgress(85, totalPages, totalPages)

            // Step 3: Merge compressed chunks into final output
            PDDocument().use { mergedDoc ->
                for (chunkFile in chunkFiles) {
                    coroutineContext.ensureActive()
                    PDDocument.load(chunkFile, MemoryUsageSetting.setupMixed(50L * 1024 * 1024)).use { chunkDoc ->
                        for (i in 0 until chunkDoc.numberOfPages) {
                            mergedDoc.importPage(chunkDoc.getPage(i))
                        }
                    }
                }

                onProgress(95, totalPages, totalPages)
                PdfBoxHelper.atomicSave(mergedDoc, outputFile)
            }

            onProgress(100, totalPages, totalPages)

            // Validate
            val validation = PdfBoxHelper.validateOutput(outputFile, totalPages)
            if (!validation.valid) {
                throw IllegalStateException("Output validation failed: ${validation.errorMessage}")
            }

            val compressedSize = outputFile.length()
            val compressionRatio = if (originalSize > 0) {
                1.0 - (compressedSize.toDouble() / originalSize.toDouble())
            } else 0.0

            PdfBoxHelper.logMetrics(OperationMetrics(
                operationName = "compress_chunked_${level.name}",
                fileCount = 1,
                pageCount = totalPages,
                inputSizeBytes = originalSize,
                outputSizeBytes = compressedSize,
                durationMs = System.currentTimeMillis() - startTime
            ))

            return CompressionResult(
                outputPath = outputFile.absolutePath,
                originalSize = originalSize,
                compressedSize = compressedSize,
                compressionRatio = compressionRatio,
                pageCount = totalPages
            )
        } finally {
            // Clean up chunk files
            chunkFiles.forEach { it.delete() }
            cacheDir.delete()
        }
    }
}
