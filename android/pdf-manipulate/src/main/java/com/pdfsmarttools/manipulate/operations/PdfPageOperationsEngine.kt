package com.pdfsmarttools.manipulate.operations

import android.content.Context
import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import kotlinx.coroutines.CancellationException
import java.io.File
import kotlin.coroutines.coroutineContext

/**
 * PDFBox-based page operations engine.
 *
 * Supports batch delete, extract, reorder, and rotate operations on PDF pages.
 * Uses [PdfBoxFacade] for all PDF manipulation — preserves original page quality
 * unlike PdfRenderer-based approaches.
 *
 * All operations:
 * - Support batch mode (multiple pages at once)
 * - Respect [MemoryBudget] constraints
 * - Work with large PDFs (1000+ pages)
 * - Use atomic saves via [PdfBoxFacade.atomicSave]
 */
class PdfPageOperationsEngine {

    companion object {
        private const val TAG = "PdfPageOpsEngine"
        private const val BATCH_SIZE = 50
    }

    data class OperationResult(
        val outputPath: String,
        val inputPageCount: Int,
        val outputPageCount: Int,
        val fileSize: Long
    )

    /**
     * Delete specified pages from a PDF.
     *
     * @param context Android context for PDFBox initialization.
     * @param inputPath Absolute path to the source PDF.
     * @param pagesToDelete 0-based page indices to delete.
     * @param outputPath Absolute path for the output PDF.
     * @param onProgress Progress callback (0-100, status message).
     */
    suspend fun deletePages(
        context: Context,
        inputPath: String,
        pagesToDelete: List<Int>,
        outputPath: String,
        onProgress: (Int, String) -> Unit
    ): OperationResult {
        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)

        val inputFile = File(inputPath)
        require(inputFile.exists()) { "Input PDF not found: $inputPath" }
        require(pagesToDelete.isNotEmpty()) { "No pages specified for deletion" }

        onProgress(5, "Opening PDF...")

        PdfBoxFacade.loadDocument(inputFile).use { doc ->
            val totalPages = doc.numberOfPages
            val sortedIndices = pagesToDelete.distinct().sortedDescending()

            for (index in sortedIndices) {
                require(index in 0 until totalPages) {
                    "Page index $index out of range (0-${totalPages - 1})"
                }
            }

            require(sortedIndices.size < totalPages) { "Cannot delete all pages" }

            checkCoroutineActive()

            onProgress(20, "Deleting ${sortedIndices.size} pages...")

            for ((i, pageIndex) in sortedIndices.withIndex()) {
                checkCoroutineActive()
                doc.removePage(pageIndex)

                if ((i + 1) % BATCH_SIZE == 0) {
                    checkMemoryPressure()
                    val pct = 20 + ((i + 1) * 60 / sortedIndices.size)
                    onProgress(pct, "Deleting pages (${i + 1}/${sortedIndices.size})...")
                }
            }

            onProgress(85, "Saving PDF...")
            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()
            PdfBoxFacade.atomicSave(doc, outputFile)

            val resultPageCount = totalPages - sortedIndices.size
            val duration = System.currentTimeMillis() - startTime
            PdfBoxFacade.logMetrics(
                OperationMetrics("deletePages", 1, resultPageCount, inputFile.length(), outputFile.length(), duration)
            )

            onProgress(100, "Complete!")
            Log.d(TAG, "Deleted ${sortedIndices.size} pages in ${duration}ms")

            return OperationResult(outputPath, totalPages, resultPageCount, outputFile.length())
        }
    }

    /**
     * Extract specified pages into a new PDF.
     *
     * @param context Android context for PDFBox initialization.
     * @param inputPath Absolute path to the source PDF.
     * @param pagesToExtract 0-based page indices to extract, in desired output order.
     * @param outputPath Absolute path for the output PDF.
     * @param onProgress Progress callback (0-100, status message).
     */
    suspend fun extractPages(
        context: Context,
        inputPath: String,
        pagesToExtract: List<Int>,
        outputPath: String,
        onProgress: (Int, String) -> Unit
    ): OperationResult {
        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)

        val inputFile = File(inputPath)
        require(inputFile.exists()) { "Input PDF not found: $inputPath" }
        require(pagesToExtract.isNotEmpty()) { "No pages specified for extraction" }

        onProgress(5, "Opening PDF...")

        PdfBoxFacade.loadDocument(inputFile).use { sourceDoc ->
            val totalPages = sourceDoc.numberOfPages

            for (index in pagesToExtract) {
                require(index in 0 until totalPages) {
                    "Page index $index out of range (0-${totalPages - 1})"
                }
            }

            checkCoroutineActive()

            PdfBoxFacade.createDocument().use { extractDoc ->
                onProgress(20, "Extracting ${pagesToExtract.size} pages...")

                for ((i, pageIndex) in pagesToExtract.withIndex()) {
                    checkCoroutineActive()
                    extractDoc.importPage(sourceDoc.getPage(pageIndex))

                    if ((i + 1) % BATCH_SIZE == 0) {
                        checkMemoryPressure()
                    }

                    val pct = 20 + ((i + 1) * 60 / pagesToExtract.size)
                    onProgress(pct, "Extracting page ${i + 1}/${pagesToExtract.size}...")
                }

                onProgress(85, "Saving PDF...")
                val outputFile = File(outputPath)
                outputFile.parentFile?.mkdirs()
                PdfBoxFacade.atomicSave(extractDoc, outputFile)

                val duration = System.currentTimeMillis() - startTime
                PdfBoxFacade.logMetrics(
                    OperationMetrics("extractPages", 1, pagesToExtract.size, inputFile.length(), outputFile.length(), duration)
                )

                onProgress(100, "Complete!")
                Log.d(TAG, "Extracted ${pagesToExtract.size} pages in ${duration}ms")

                return OperationResult(outputPath, totalPages, pagesToExtract.size, outputFile.length())
            }
        }
    }

    /**
     * Reorder pages in a PDF.
     *
     * @param context Android context for PDFBox initialization.
     * @param inputPath Absolute path to the source PDF.
     * @param newPageOrder 0-based page indices in the desired new order.
     *                     Must contain every page index exactly once.
     * @param outputPath Absolute path for the output PDF.
     * @param onProgress Progress callback (0-100, status message).
     */
    suspend fun reorderPages(
        context: Context,
        inputPath: String,
        newPageOrder: List<Int>,
        outputPath: String,
        onProgress: (Int, String) -> Unit
    ): OperationResult {
        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)

        val inputFile = File(inputPath)
        require(inputFile.exists()) { "Input PDF not found: $inputPath" }
        require(newPageOrder.isNotEmpty()) { "Page order list is empty" }

        onProgress(5, "Opening PDF...")

        PdfBoxFacade.loadDocument(inputFile).use { sourceDoc ->
            val totalPages = sourceDoc.numberOfPages

            require(newPageOrder.size == totalPages) {
                "Page order must contain exactly $totalPages entries, got ${newPageOrder.size}"
            }
            val sorted = newPageOrder.sorted()
            for (i in 0 until totalPages) {
                require(sorted[i] == i) {
                    "Page order must contain each page index exactly once (0-${totalPages - 1})"
                }
            }

            checkCoroutineActive()

            PdfBoxFacade.createDocument().use { reorderedDoc ->
                onProgress(20, "Reordering ${totalPages} pages...")

                for ((i, pageIndex) in newPageOrder.withIndex()) {
                    checkCoroutineActive()
                    reorderedDoc.importPage(sourceDoc.getPage(pageIndex))

                    if ((i + 1) % BATCH_SIZE == 0) {
                        checkMemoryPressure()
                    }

                    val pct = 20 + ((i + 1) * 60 / totalPages)
                    onProgress(pct, "Reordering page ${i + 1}/$totalPages...")
                }

                onProgress(85, "Saving PDF...")
                val outputFile = File(outputPath)
                outputFile.parentFile?.mkdirs()
                PdfBoxFacade.atomicSave(reorderedDoc, outputFile)

                val duration = System.currentTimeMillis() - startTime
                PdfBoxFacade.logMetrics(
                    OperationMetrics("reorderPages", 1, totalPages, inputFile.length(), outputFile.length(), duration)
                )

                onProgress(100, "Complete!")
                Log.d(TAG, "Reordered $totalPages pages in ${duration}ms")

                return OperationResult(outputPath, totalPages, totalPages, outputFile.length())
            }
        }
    }

    /**
     * Rotate specified pages by a given angle.
     *
     * @param context Android context for PDFBox initialization.
     * @param inputPath Absolute path to the source PDF.
     * @param pageRotations Map of 0-based page index to rotation degrees (90, 180, 270).
     * @param outputPath Absolute path for the output PDF.
     * @param onProgress Progress callback (0-100, status message).
     */
    suspend fun rotatePages(
        context: Context,
        inputPath: String,
        pageRotations: Map<Int, Int>,
        outputPath: String,
        onProgress: (Int, String) -> Unit
    ): OperationResult {
        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)

        val inputFile = File(inputPath)
        require(inputFile.exists()) { "Input PDF not found: $inputPath" }
        require(pageRotations.isNotEmpty()) { "No page rotations specified" }

        for ((_, degrees) in pageRotations) {
            require(degrees in listOf(90, 180, 270)) {
                "Rotation must be 90, 180, or 270 degrees, got $degrees"
            }
        }

        onProgress(5, "Opening PDF...")

        PdfBoxFacade.loadDocument(inputFile).use { doc ->
            val totalPages = doc.numberOfPages

            for (pageIndex in pageRotations.keys) {
                require(pageIndex in 0 until totalPages) {
                    "Page index $pageIndex out of range (0-${totalPages - 1})"
                }
            }

            checkCoroutineActive()

            onProgress(20, "Rotating ${pageRotations.size} pages...")

            var processed = 0
            for ((pageIndex, degrees) in pageRotations) {
                checkCoroutineActive()

                val page = doc.getPage(pageIndex)
                val currentRotation = page.rotation
                page.rotation = (currentRotation + degrees) % 360

                processed++
                if (processed % BATCH_SIZE == 0) {
                    checkMemoryPressure()
                }

                val pct = 20 + (processed * 60 / pageRotations.size)
                onProgress(pct, "Rotating page ${processed}/${pageRotations.size}...")
            }

            onProgress(85, "Saving PDF...")
            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()
            PdfBoxFacade.atomicSave(doc, outputFile)

            val duration = System.currentTimeMillis() - startTime
            PdfBoxFacade.logMetrics(
                OperationMetrics("rotatePages", 1, totalPages, inputFile.length(), outputFile.length(), duration)
            )

            onProgress(100, "Complete!")
            Log.d(TAG, "Rotated ${pageRotations.size} pages in ${duration}ms")

            return OperationResult(outputPath, totalPages, totalPages, outputFile.length())
        }
    }

    private suspend fun checkCoroutineActive() {
        if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) {
            throw CancellationException("Operation cancelled")
        }
    }

    private fun checkMemoryPressure() {
        val rt = Runtime.getRuntime()
        if (rt.totalMemory() - rt.freeMemory() > (rt.maxMemory() * 0.80).toLong()) {
            System.gc()
            Log.d(TAG, "Memory pressure detected, triggered GC")
        }
    }
}
