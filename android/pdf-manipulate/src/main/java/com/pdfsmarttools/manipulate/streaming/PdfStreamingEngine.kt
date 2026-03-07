package com.pdfsmarttools.manipulate.streaming

import android.content.Context
import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.manipulate.cache.PdfCacheManager
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import java.io.File
import kotlin.coroutines.coroutineContext

/**
 * PDF Streaming Engine — processes large PDF files page-by-page with minimal memory.
 *
 * Instead of loading the entire document into memory, this engine:
 * 1. Opens the source PDF in temp-file-only mode (near-zero heap)
 * 2. Processes one page (or a small chunk) at a time
 * 3. Releases memory immediately after each page
 * 4. Integrates with [MemoryBudget] to pause/GC when constrained
 *
 * Target file sizes: 50MB, 200MB, 500MB+ PDFs.
 *
 * Architecture:
 * ```
 * PdfStreamingEngine
 *     |
 *     v
 * PdfPageStreamReader (open → nextPage → process → release → repeat)
 *     |
 *     v
 * PageProcessor (compress/merge/transform per page)
 *     |
 *     v
 * OutputWriter (append to output document, flush periodically)
 * ```
 *
 * Integration:
 * - Used by [StreamingCompressEngine] and [StreamingMergeEngine]
 * - Compatible with [PdfEngineOrchestrator] via standard [PdfEngine] contract
 * - Integrates with [TurboBatchPdfEngine] via streaming-aware batch options
 */
class PdfStreamingEngine(private val context: Context) {

    companion object {
        private const val TAG = "PdfStreamingEngine"

        /** File size threshold (30 MB) above which streaming is recommended. */
        const val STREAMING_THRESHOLD_BYTES = 30L * 1024 * 1024

        /** Maximum pages to hold in memory before flushing to output. */
        private const val FLUSH_INTERVAL = 20

        /** Memory threshold (percentage) that triggers a pause + GC cycle. */
        private const val MEMORY_PRESSURE_THRESHOLD = 75

        /** Maximum delay (ms) when pausing for memory pressure relief. */
        private const val MAX_GC_PAUSE_MS = 2000L

        /** Number of GC retry attempts before giving up. */
        private const val MAX_GC_RETRIES = 3
    }

    /**
     * Process a PDF file page-by-page using streaming.
     *
     * @param inputFile Source PDF file.
     * @param outputFile Destination file for processed output.
     * @param isPro Whether user has pro subscription (controls watermarking).
     * @param reporter Progress callback.
     * @param pageProcessor Called for each page with (sourceDoc, pageIndex, outputDoc).
     *        The processor should import/transform the page into the outputDoc.
     * @return [StreamingResult] with processing metrics.
     */
    suspend fun processStreaming(
        inputFile: File,
        outputFile: File,
        isPro: Boolean,
        reporter: ProgressReporter,
        pageProcessor: suspend (reader: PdfPageStreamReader, pageIndex: Int, outputDoc: com.tom_roush.pdfbox.pdmodel.PDDocument) -> Unit
    ): StreamingResult {
        val startTime = System.currentTimeMillis()

        PdfBoxFacade.ensureInitialized(context)
        outputFile.parentFile?.mkdirs()

        val inputSize = inputFile.length()
        var processedPages = 0

        // Phase 1: Get total page count (uses cache if available)
        val cachedPageCount = PdfCacheManager.getPageCount(inputFile)
        val totalPages: Int = if (cachedPageCount > 0) {
            cachedPageCount
        } else {
            PdfBoxFacade.loadDocumentTempFileOnly(inputFile).use { doc ->
                doc.numberOfPages
            }
        }

        if (totalPages == 0) {
            throw IllegalArgumentException("PDF has no pages")
        }

        Log.i(TAG, "Streaming: ${inputSize / (1024 * 1024)}MB, $totalPages pages")

        // Phase 2: Process page-by-page using stream reader
        val reader = PdfPageStreamReader(inputFile)
        val tempFile = File(outputFile.parentFile, ".${outputFile.name}.streaming.tmp")

        try {
            reader.open()

            PdfBoxFacade.createDocument().use { outputDoc ->
                var pagesInCurrentBatch = 0

                for (pageIndex in 0 until totalPages) {
                    coroutineContext.ensureActive()

                    // Memory pressure check before processing each page
                    ensureMemoryAvailable()

                    // Process this page
                    pageProcessor(reader, pageIndex, outputDoc)

                    if (!isPro) {
                        val lastPage = outputDoc.getPage(outputDoc.numberOfPages - 1)
                        PdfBoxFacade.addWatermarkToPage(outputDoc, lastPage)
                    }

                    processedPages++
                    pagesInCurrentBatch++

                    // Report progress (0-90 range, reserve 90-100 for save)
                    val progress = ((processedPages * 90) / totalPages).coerceIn(0, 90)
                    reporter.onProgress(progress, processedPages, totalPages,
                        "Streaming page $processedPages of $totalPages")

                    // Periodic memory cleanup
                    if (pagesInCurrentBatch >= FLUSH_INTERVAL) {
                        MemoryBudget.reset()
                        if (MemoryBudget.heapUsagePercent() > 60) {
                            System.gc()
                            delay(100)
                        }
                        pagesInCurrentBatch = 0
                        Log.d(TAG, "Flushed after $processedPages pages, " +
                                "heap: ${MemoryBudget.heapUsagePercent()}%")
                    }
                }

                // Phase 3: Save output atomically
                reporter.onStage(92, "Saving streamed output...")
                PdfBoxFacade.atomicSave(outputDoc, outputFile)
            }

            // Phase 4: Validate
            reporter.onStage(96, "Validating output...")
            val validation = PdfBoxFacade.validateOutput(outputFile, processedPages)
            if (!validation.valid) {
                outputFile.delete()
                throw IllegalStateException("Streaming output validation failed: ${validation.errorMessage}")
            }

            reporter.onComplete("Streamed $processedPages pages")

            val durationMs = System.currentTimeMillis() - startTime
            val outputSize = outputFile.length()

            Log.i(TAG, "Streaming complete: $processedPages pages in ${durationMs}ms, " +
                    "${outputSize / (1024 * 1024)}MB output")

            return StreamingResult(
                outputPath = outputFile.absolutePath,
                outputSize = outputSize,
                inputSize = inputSize,
                pageCount = processedPages,
                durationMs = durationMs,
                peakHeapPercent = MemoryBudget.heapUsagePercent()
            )

        } catch (e: kotlinx.coroutines.CancellationException) {
            outputFile.delete()
            tempFile.delete()
            throw e
        } catch (e: Exception) {
            outputFile.delete()
            tempFile.delete()
            throw e
        } finally {
            reader.close()
            tempFile.delete()
        }
    }

    /**
     * Check if streaming should be used for a file based on its size.
     */
    fun shouldUseStreaming(file: File): Boolean {
        return file.length() > STREAMING_THRESHOLD_BYTES
    }

    /**
     * Ensure sufficient memory is available before processing the next page.
     * If memory is constrained, pause and trigger GC.
     */
    private suspend fun ensureMemoryAvailable() {
        if (MemoryBudget.heapUsagePercent() <= MEMORY_PRESSURE_THRESHOLD) return

        Log.w(TAG, "Memory pressure: heap at ${MemoryBudget.heapUsagePercent()}%, " +
                "${MemoryBudget.availableMemoryMb()}MB available")

        // Trim cache first to free memory before GC
        PdfCacheManager.trimForMemoryPressure()

        for (attempt in 1..MAX_GC_RETRIES) {
            MemoryBudget.reset()
            System.gc()
            delay((attempt * 200L).coerceAtMost(MAX_GC_PAUSE_MS))

            if (MemoryBudget.heapUsagePercent() <= MEMORY_PRESSURE_THRESHOLD) {
                Log.d(TAG, "Memory recovered after $attempt GC cycles: " +
                        "heap at ${MemoryBudget.heapUsagePercent()}%")
                return
            }
        }

        Log.w(TAG, "Memory still constrained after $MAX_GC_RETRIES GC cycles, " +
                "continuing cautiously at ${MemoryBudget.heapUsagePercent()}%")
    }
}

/**
 * Result of a streaming PDF operation.
 */
data class StreamingResult(
    val outputPath: String,
    val outputSize: Long,
    val inputSize: Long,
    val pageCount: Int,
    val durationMs: Long,
    val peakHeapPercent: Int
)
