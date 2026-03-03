package com.pdfsmarttools.manipulate.merge

import android.content.Context
import android.util.Log
import com.pdfsmarttools.pdfcore.DefaultFileResolver
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import kotlinx.coroutines.CancellationException
import java.io.File
import kotlin.coroutines.coroutineContext

data class MergeResult(
    val outputPath: String,
    val totalPages: Int,
    val fileCount: Int,
    val outputSize: Long
)

class PdfMergerEngine {

    companion object {
        private const val TAG = "PdfMergerEngine"
    }

    suspend fun merge(
        context: Context,
        inputPaths: List<String>,
        outputPath: String,
        isPro: Boolean = false,
        onProgress: (progress: Int, currentFile: Int, totalFiles: Int) -> Unit
    ): MergeResult {
        if (inputPaths.size < 2) {
            throw IllegalArgumentException("At least 2 PDF files are required for merging")
        }

        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()

        val fileCount = inputPaths.size
        var totalPageCount = 0
        var totalInputSize = 0L

        val fileResolver = DefaultFileResolver(context)
        val resolvedFiles = mutableListOf<File>()
        val cacheFiles = mutableListOf<File>()

        try {
            for (inputPath in inputPaths) {
                val resolved = fileResolver.resolveInputFile(inputPath, "merge")
                resolvedFiles.add(resolved)
                if (fileResolver.isCacheFile(inputPath)) cacheFiles.add(resolved)
                if (!resolved.exists()) throw IllegalArgumentException("Input file not found: $inputPath")
                totalInputSize += resolved.length()
            }

            PdfBoxFacade.createDocument().use { outputDoc ->
                for ((fileIndex, inputFile) in resolvedFiles.withIndex()) {
                    if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) throw CancellationException("Merge cancelled")

                    PdfBoxFacade.loadDocument(inputFile).use { sourceDoc ->
                        val pageCount = sourceDoc.numberOfPages
                        if (pageCount == 0) { Log.w(TAG, "Skipping empty PDF: ${inputFile.name}"); return@use }
                        for (pageIndex in 0 until pageCount) {
                            if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) throw CancellationException("Merge cancelled")
                            val importedPage = outputDoc.importPage(sourceDoc.getPage(pageIndex))
                            if (!isPro) PdfBoxFacade.addWatermarkToPage(outputDoc, importedPage)
                            totalPageCount++
                        }
                    }
                    onProgress(((fileIndex + 1) * 100) / fileCount, fileIndex + 1, fileCount)
                }

                if (totalPageCount == 0) throw IllegalArgumentException("No pages found in the provided PDF files")
                PdfBoxFacade.atomicSave(outputDoc, outputFile)
            }

            val validation = PdfBoxFacade.validateOutput(outputFile, totalPageCount)
            if (!validation.valid) throw IllegalStateException("Output validation failed: ${validation.errorMessage}")

            PdfBoxFacade.logMetrics(OperationMetrics("merge", fileCount, totalPageCount, totalInputSize, outputFile.length(), System.currentTimeMillis() - startTime))
            return MergeResult(outputFile.absolutePath, totalPageCount, fileCount, outputFile.length())
        } catch (e: CancellationException) { outputFile.delete(); throw e }
        catch (e: OutOfMemoryError) { outputFile.delete(); throw IllegalStateException("Not enough memory to merge PDFs", e) }
        catch (e: SecurityException) { outputFile.delete(); throw IllegalArgumentException("One or more PDF files are corrupted or password-protected", e) }
        catch (e: Exception) { outputFile.delete(); throw e }
        finally { cacheFiles.forEach { it.delete() } }
    }

    fun getPageCount(context: Context, inputPath: String): Int {
        return try {
            PdfBoxFacade.ensureInitialized(context)
            val fileResolver = DefaultFileResolver(context)
            val inputFile = fileResolver.resolveInputFile(inputPath, "count")
            if (!inputFile.exists()) return 0
            PdfBoxFacade.loadDocumentTempFileOnly(inputFile).use { it.numberOfPages }
        } catch (e: Exception) { Log.w(TAG, "Failed to get page count for $inputPath", e); 0 }
    }
}
