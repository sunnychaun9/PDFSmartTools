package com.pdfsmarttools.manipulate.streaming

import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.manipulate.cache.PdfCacheManager
import com.pdfsmarttools.pdfcore.DefaultFileResolver
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.pdfsmarttools.pdfcore.engine.MergeEngine
import com.pdfsmarttools.pdfcore.engine.MergeParams
import com.pdfsmarttools.pdfcore.engine.MergeResult
import com.pdfsmarttools.pdfcore.engine.MemoryPolicy
import com.pdfsmarttools.pdfcore.engine.SavePolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import java.io.File
import kotlin.coroutines.coroutineContext

/**
 * Streaming PDF merge engine for large file sets.
 *
 * Instead of loading all source PDFs simultaneously, this engine processes
 * one source file at a time using streaming reads:
 * ```
 * For each source PDF:
 *     open source (temp-file mode)
 *         |
 *         v
 *     stream pages into output document
 *         |
 *         v
 *     close source (release memory)
 *         |
 *         v
 *     GC if needed
 *         |
 *         v
 *     move to next source
 * ```
 *
 * Memory improvements:
 * - Only one source document open at a time (vs. all simultaneously)
 * - Temp-file-only reading: near-zero heap per source document
 * - Memory pressure checks between files and at page boundaries
 * - Stable on low-RAM devices even with many large input files
 *
 * Implements [MergeEngine] = `PdfEngine<MergeParams, MergeResult>`.
 */
class StreamingMergeEngine : MergeEngine {

    companion object {
        private const val TAG = "StreamingMergeEngine"
    }

    override val tag: String = "StreamingMergeEngine"
    override val memoryPolicy: MemoryPolicy = MemoryPolicy.TEMP_FILE_ONLY
    override val savePolicy: SavePolicy = SavePolicy.ATOMIC_VALIDATED

    override suspend fun execute(
        params: MergeParams,
        reporter: ProgressReporter
    ): PdfResult<MergeResult> {
        if (params.inputPaths.size < 2) {
            return PdfResult.failure(
                PdfError.InvalidInput("At least 2 PDF files are required for merging")
            )
        }
        if (params.outputPath.isBlank()) {
            return PdfResult.failure(
                PdfError.InvalidInput("Output path must not be blank")
            )
        }

        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(params.context)

        val outputFile = File(params.outputPath)
        outputFile.parentFile?.mkdirs()

        val fileResolver = DefaultFileResolver(params.context)
        val resolvedFiles = mutableListOf<File>()
        val cacheFiles = mutableListOf<File>()

        for (path in params.inputPaths) {
            val resolved = fileResolver.resolveInputFile(path, "streaming_merge")
            if (!resolved.exists()) {
                return PdfResult.failure(PdfError.FileNotFound(path))
            }
            resolvedFiles.add(resolved)
            if (fileResolver.isCacheFile(path)) {
                cacheFiles.add(resolved)
            }
        }

        val result = PdfResult.runCatching {
            doStreamingMerge(params, resolvedFiles, outputFile, reporter, startTime)
        }

        cacheFiles.forEach { it.delete() }

        if (result is PdfResult.Failure) {
            outputFile.delete()
        }

        return result
    }

    private suspend fun doStreamingMerge(
        params: MergeParams,
        resolvedFiles: List<File>,
        outputFile: File,
        reporter: ProgressReporter,
        startTime: Long
    ): MergeResult {

        val fileCount = resolvedFiles.size
        var totalPageCount = 0
        var totalInputSize = 0L

        resolvedFiles.forEach { totalInputSize += it.length() }

        // Estimate total pages for progress reporting
        val totalPageEstimate = estimateTotalPages(resolvedFiles)

        Log.i(TAG, "Streaming merge: $fileCount files, " +
                "${totalInputSize / (1024 * 1024)}MB total, ~$totalPageEstimate pages")

        PdfBoxFacade.createDocument().use { outputDoc ->

            for ((fileIndex, inputFile) in resolvedFiles.withIndex()) {
                coroutineContext.ensureActive()

                // Memory pressure check between files
                ensureMemoryForNextFile()

                Log.d(TAG, "Processing file ${fileIndex + 1}/$fileCount: " +
                        "${inputFile.name} (${inputFile.length() / 1024}KB)")

                // Open each source in streaming mode — one at a time
                val reader = PdfPageStreamReader(inputFile)
                try {
                    reader.open()

                    for (pageIndex in 0 until reader.pageCount) {
                        coroutineContext.ensureActive()

                        val sourcePage = reader.getPage(pageIndex)
                        val importedPage = outputDoc.importPage(sourcePage)

                        if (!params.isPro) {
                            PdfBoxFacade.addWatermarkToPage(outputDoc, importedPage)
                        }

                        totalPageCount++
                        reader.releaseCurrentPage()

                        // Progress: 0-85 for merging, 85-100 for save+validate
                        val progress = ((totalPageCount * 85) / totalPageEstimate)
                            .coerceIn(0, 85)
                        reporter.onProgress(progress, fileIndex + 1, fileCount,
                            "Merging file ${fileIndex + 1} of $fileCount")
                    }

                } finally {
                    reader.close()
                }

                // Memory cleanup after each file
                MemoryBudget.reset()
                if (MemoryBudget.heapUsagePercent() > 70) {
                    Log.d(TAG, "GC after file ${fileIndex + 1}: " +
                            "heap=${MemoryBudget.heapUsagePercent()}%")
                    System.gc()
                }
            }

            // Save atomically
            reporter.onStage(88, "Saving merged document...")
            PdfBoxFacade.atomicSave(outputDoc, outputFile)
        }

        // Validate
        reporter.onStage(95, "Validating output...")
        val validation = PdfBoxFacade.validateOutput(outputFile, totalPageCount)
        if (!validation.valid) {
            outputFile.delete()
            throw IllegalStateException(
                "Output validation failed: ${validation.errorMessage}"
            )
        }

        // Invalidate output file from cache (new file)
        PdfCacheManager.invalidateByPath(outputFile.absolutePath)

        val outputSize = outputFile.length()
        val durationMs = System.currentTimeMillis() - startTime

        PdfBoxFacade.logMetrics(OperationMetrics(
            operationName = "streaming_merge",
            fileCount = fileCount,
            pageCount = totalPageCount,
            inputSizeBytes = totalInputSize,
            outputSizeBytes = outputSize,
            durationMs = durationMs
        ))

        reporter.onComplete("Streaming merged $fileCount files ($totalPageCount pages)")

        Log.i(TAG, "Streaming merge complete: $totalPageCount pages from $fileCount files " +
                "in ${durationMs}ms, ${outputSize / (1024 * 1024)}MB output")

        return MergeResult(
            outputPath = outputFile.absolutePath,
            outputSize = outputSize,
            totalPages = totalPageCount,
            fileCount = fileCount
        )
    }

    private suspend fun estimateTotalPages(files: List<File>): Int {
        var estimate = 0
        for (file in files) {
            // Use cache for fast page count lookup
            val cached = PdfCacheManager.getPageCount(file)
            estimate += if (cached > 0) {
                cached
            } else {
                try {
                    PdfBoxFacade.loadDocumentTempFileOnly(file).use { it.numberOfPages }
                } catch (_: Exception) {
                    10
                }
            }
        }
        return estimate.coerceAtLeast(1)
    }

    private suspend fun ensureMemoryForNextFile() {
        if (MemoryBudget.heapUsagePercent() <= 75) return

        Log.w(TAG, "Memory pressure before next file: " +
                "heap=${MemoryBudget.heapUsagePercent()}%")

        // Trim cache to free memory before GC
        PdfCacheManager.trimForMemoryPressure()

        for (attempt in 1..3) {
            MemoryBudget.reset()
            System.gc()
            kotlinx.coroutines.delay((attempt * 200L).coerceAtMost(500L))
            if (MemoryBudget.heapUsagePercent() <= 75) {
                Log.d(TAG, "Memory recovered after $attempt GC cycles")
                return
            }
        }

        Log.w(TAG, "Memory still constrained, continuing cautiously")
    }
}
