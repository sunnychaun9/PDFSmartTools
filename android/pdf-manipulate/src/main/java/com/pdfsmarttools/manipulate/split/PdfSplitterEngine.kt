package com.pdfsmarttools.manipulate.split

import android.content.Context
import android.util.Log
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import kotlinx.coroutines.CancellationException
import java.io.File
import kotlin.coroutines.coroutineContext

data class SplitOutputFile(val path: String, val fileName: String, val range: String, val pageCount: Int, val fileSize: Long)
data class SplitResult(val outputFiles: List<SplitOutputFile>, val totalFilesCreated: Int, val sourcePageCount: Int)
data class ExtractResult(val outputPath: String, val pageNumber: Int, val fileSize: Long)

class PdfSplitterEngine {

    companion object { private const val TAG = "PdfSplitterEngine" }

    suspend fun split(
        context: Context, inputPath: String, outputDir: String, baseName: String,
        pageRanges: List<Pair<Int, Int>>, isPro: Boolean,
        onProgress: (progress: Int, status: String) -> Unit
    ): SplitResult {
        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)
        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("Input PDF file not found: $inputPath")
        val inputSize = inputFile.length()
        File(outputDir).mkdirs()
        val outputFiles = mutableListOf<SplitOutputFile>()

        PdfBoxFacade.loadDocument(inputFile).use { sourceDoc ->
            val totalPages = sourceDoc.numberOfPages
            if (pageRanges.isEmpty()) throw IllegalArgumentException("No valid page ranges specified")
            for ((start, end) in pageRanges) {
                if (start < 1 || end > totalPages || start > end) throw IllegalArgumentException("Invalid page range $start-$end for PDF with $totalPages pages")
            }
            if (!isPro) {
                for ((start, end) in pageRanges) {
                    if (start > 2 || end > 2) throw IllegalArgumentException("Free users can only split the first 2 pages. Upgrade to Pro for unlimited access.")
                }
            }
            for ((rangeIndex, range) in pageRanges.withIndex()) {
                val (start, end) = range
                if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) throw CancellationException("Split cancelled")
                val rangeStr = if (start == end) "$start" else "$start-$end"
                val outputFileName = "${baseName}_pages_$rangeStr.pdf"
                val outputFile = File("$outputDir/$outputFileName")
                val expectedPages = end - start + 1
                PdfBoxFacade.createDocument().use { rangeDoc ->
                    for (pageNum in start..end) {
                        if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) throw CancellationException("Split cancelled")
                        val importedPage = rangeDoc.importPage(sourceDoc.getPage(pageNum - 1))
                        if (!isPro) PdfBoxFacade.addWatermarkToPage(rangeDoc, importedPage)
                    }
                    PdfBoxFacade.atomicSave(rangeDoc, outputFile)
                }
                val validation = PdfBoxFacade.validateOutput(outputFile, expectedPages)
                if (!validation.valid) Log.w(TAG, "Range $rangeStr validation warning: ${validation.errorMessage}")
                outputFiles.add(SplitOutputFile(outputFile.absolutePath, outputFileName, rangeStr, expectedPages, outputFile.length()))
                onProgress((20 + ((rangeIndex + 1) * 70 / pageRanges.size)).coerceAtMost(90), "Processing pages $rangeStr...")
            }
            PdfBoxFacade.logMetrics(OperationMetrics("split", outputFiles.size, totalPages, inputSize, outputFiles.sumOf { it.fileSize }, System.currentTimeMillis() - startTime))
            return SplitResult(outputFiles, outputFiles.size, totalPages)
        }
    }

    suspend fun extractPage(context: Context, inputPath: String, outputPath: String, pageNumber: Int, isPro: Boolean, onProgress: (Int, String) -> Unit): ExtractResult {
        PdfBoxFacade.ensureInitialized(context)
        if (!isPro && pageNumber > 2) throw IllegalArgumentException("Free users can only extract the first 2 pages. Upgrade to Pro for unlimited access.")
        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("Input PDF file not found: $inputPath")
        onProgress(30, "Extracting page $pageNumber...")
        PdfBoxFacade.loadDocument(inputFile).use { sourceDoc ->
            if (pageNumber < 1 || pageNumber > sourceDoc.numberOfPages) throw IllegalArgumentException("Page number $pageNumber is out of range (1-${sourceDoc.numberOfPages})")
            val outputFile = File(outputPath)
            PdfBoxFacade.createDocument().use { extractDoc ->
                val importedPage = extractDoc.importPage(sourceDoc.getPage(pageNumber - 1))
                if (!isPro) PdfBoxFacade.addWatermarkToPage(extractDoc, importedPage)
                onProgress(60, "Saving...")
                PdfBoxFacade.atomicSave(extractDoc, outputFile)
            }
            PdfBoxFacade.validateOutput(outputFile, 1)
            return ExtractResult(outputPath, pageNumber, outputFile.length())
        }
    }

    fun getPageCount(context: Context, inputPath: String): Int {
        PdfBoxFacade.ensureInitialized(context)
        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found: $inputPath")
        return PdfBoxFacade.loadDocumentTempFileOnly(inputFile).use { it.numberOfPages }
    }
}
