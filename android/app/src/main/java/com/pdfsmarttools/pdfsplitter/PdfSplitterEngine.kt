package com.pdfsmarttools.pdfsplitter

import android.content.Context
import android.util.Log
import com.pdfsmarttools.common.OperationMetrics
import com.pdfsmarttools.common.PdfBoxHelper
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import kotlinx.coroutines.CancellationException
import java.io.File
import kotlin.coroutines.coroutineContext

data class SplitOutputFile(
    val path: String,
    val fileName: String,
    val range: String,
    val pageCount: Int,
    val fileSize: Long
)

data class SplitResult(
    val outputFiles: List<SplitOutputFile>,
    val totalFilesCreated: Int,
    val sourcePageCount: Int
)

data class ExtractResult(
    val outputPath: String,
    val pageNumber: Int,
    val fileSize: Long
)

class PdfSplitterEngine {

    companion object {
        private const val TAG = "PdfSplitterEngine"
    }

    /**
     * Split a PDF by page ranges using PDFBox structural page import.
     * Preserves text layers, annotations, and form fields.
     */
    suspend fun split(
        context: Context,
        inputPath: String,
        outputDir: String,
        baseName: String,
        pageRanges: List<Pair<Int, Int>>,
        isPro: Boolean,
        onProgress: (progress: Int, status: String) -> Unit
    ): SplitResult {
        val startTime = System.currentTimeMillis()
        PdfBoxHelper.ensureInitialized(context)

        val inputFile = File(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input PDF file not found: $inputPath")
        }

        val inputSize = inputFile.length()

        // Ensure output directory exists
        val outputDirFile = File(outputDir)
        outputDirFile.mkdirs()

        val outputFiles = mutableListOf<SplitOutputFile>()

        // Use mixed memory: keep up to 50MB in RAM, spill rest to temp files
        PDDocument.load(inputFile, MemoryUsageSetting.setupMixed(50L * 1024 * 1024)).use { sourceDoc ->
            val totalPages = sourceDoc.numberOfPages

            if (pageRanges.isEmpty()) {
                throw IllegalArgumentException("No valid page ranges specified")
            }

            // Validate all ranges against actual page count
            for ((start, end) in pageRanges) {
                if (start < 1 || end > totalPages || start > end) {
                    throw IllegalArgumentException(
                        "Invalid page range $start-$end for PDF with $totalPages pages"
                    )
                }
            }

            // For free users, validate that only first 2 pages are being split
            if (!isPro) {
                for ((start, end) in pageRanges) {
                    if (start > 2 || end > 2) {
                        throw IllegalArgumentException(
                            "Free users can only split the first 2 pages. Upgrade to Pro for unlimited access."
                        )
                    }
                }
            }

            val totalRanges = pageRanges.size

            for ((rangeIndex, range) in pageRanges.withIndex()) {
                val (start, end) = range

                // Check for cancellation between ranges
                if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) {
                    throw CancellationException("Split cancelled")
                }

                val rangeStr = if (start == end) "$start" else "$start-$end"
                val outputFileName = "${baseName}_pages_$rangeStr.pdf"
                val outputFilePath = "$outputDir/$outputFileName"
                val outputFile = File(outputFilePath)
                val expectedPages = end - start + 1

                PDDocument().use { rangeDoc ->
                    for (pageNum in start..end) {
                        // Check for cancellation at each page boundary
                        if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) {
                            throw CancellationException("Split cancelled")
                        }

                        val sourcePage = sourceDoc.getPage(pageNum - 1) // 0-indexed
                        val importedPage = rangeDoc.importPage(sourcePage)

                        if (!isPro) {
                            PdfBoxHelper.addWatermarkToPage(rangeDoc, importedPage)
                        }
                    }

                    PdfBoxHelper.atomicSave(rangeDoc, outputFile)
                }

                // Validate output
                val validation = PdfBoxHelper.validateOutput(outputFile, expectedPages)
                if (!validation.valid) {
                    Log.w(TAG, "Range $rangeStr validation warning: ${validation.errorMessage}")
                }

                outputFiles.add(SplitOutputFile(
                    path = outputFilePath,
                    fileName = outputFileName,
                    range = rangeStr,
                    pageCount = expectedPages,
                    fileSize = outputFile.length()
                ))

                // Report progress
                val progress = 20 + ((rangeIndex + 1) * 70 / totalRanges)
                onProgress(progress.coerceAtMost(90), "Processing pages $rangeStr...")
            }

            val result = SplitResult(
                outputFiles = outputFiles,
                totalFilesCreated = outputFiles.size,
                sourcePageCount = totalPages
            )

            // Log metrics
            val totalOutputSize = outputFiles.sumOf { it.fileSize }
            PdfBoxHelper.logMetrics(OperationMetrics(
                operationName = "split",
                fileCount = outputFiles.size,
                pageCount = totalPages,
                inputSizeBytes = inputSize,
                outputSizeBytes = totalOutputSize,
                durationMs = System.currentTimeMillis() - startTime
            ))

            return result
        }
    }

    /**
     * Extract a single page from a PDF.
     */
    suspend fun extractPage(
        context: Context,
        inputPath: String,
        outputPath: String,
        pageNumber: Int,
        isPro: Boolean,
        onProgress: (progress: Int, status: String) -> Unit
    ): ExtractResult {
        PdfBoxHelper.ensureInitialized(context)

        // For free users, only allow first 2 pages
        if (!isPro && pageNumber > 2) {
            throw IllegalArgumentException(
                "Free users can only extract the first 2 pages. Upgrade to Pro for unlimited access."
            )
        }

        val inputFile = File(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input PDF file not found: $inputPath")
        }

        onProgress(30, "Extracting page $pageNumber...")

        PDDocument.load(inputFile, MemoryUsageSetting.setupMixed(50L * 1024 * 1024)).use { sourceDoc ->
            if (pageNumber < 1 || pageNumber > sourceDoc.numberOfPages) {
                throw IllegalArgumentException(
                    "Page number $pageNumber is out of range (1-${sourceDoc.numberOfPages})"
                )
            }

            val outputFile = File(outputPath)

            PDDocument().use { extractDoc ->
                val sourcePage = sourceDoc.getPage(pageNumber - 1)
                val importedPage = extractDoc.importPage(sourcePage)

                if (!isPro) {
                    PdfBoxHelper.addWatermarkToPage(extractDoc, importedPage)
                }

                onProgress(60, "Saving...")
                PdfBoxHelper.atomicSave(extractDoc, outputFile)
            }

            PdfBoxHelper.validateOutput(outputFile, 1)

            return ExtractResult(
                outputPath = outputPath,
                pageNumber = pageNumber,
                fileSize = outputFile.length()
            )
        }
    }

    /**
     * Get page count using PDFBox with memory-efficient loading.
     */
    fun getPageCount(context: Context, inputPath: String): Int {
        PdfBoxHelper.ensureInitialized(context)
        val inputFile = File(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("PDF file not found: $inputPath")
        }

        return PDDocument.load(inputFile, MemoryUsageSetting.setupTempFileOnly()).use { doc ->
            doc.numberOfPages
        }
    }
}
