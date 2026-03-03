package com.pdfsmarttools.pdfmerger

import android.content.Context
import android.util.Log
import com.pdfsmarttools.common.OperationMetrics
import com.pdfsmarttools.common.PdfBoxHelper
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
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

    /**
     * Merge multiple PDFs using PDFBox structural page import.
     * Preserves text layers, metadata, annotations, and form fields.
     * Supports coroutine cancellation at page boundaries.
     */
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
        PdfBoxHelper.ensureInitialized(context)

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()

        val fileCount = inputPaths.size
        var totalPageCount = 0
        var totalInputSize = 0L

        // Resolve all input files upfront (handles content:// URIs)
        val resolvedFiles = mutableListOf<File>()
        val cacheFiles = mutableListOf<File>()

        try {
            for (inputPath in inputPaths) {
                val resolved = PdfBoxHelper.resolveInputFile(context, inputPath, "merge")
                resolvedFiles.add(resolved)
                if (inputPath.startsWith("content://")) {
                    cacheFiles.add(resolved)
                }
                if (!resolved.exists()) {
                    throw IllegalArgumentException("Input file not found: $inputPath")
                }
                totalInputSize += resolved.length()
            }

            PDDocument().use { outputDoc ->
                for ((fileIndex, inputFile) in resolvedFiles.withIndex()) {
                    // Check for cancellation between files
                    if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) {
                        throw CancellationException("Merge cancelled")
                    }

                    // Use mixed memory: keep up to 50MB in RAM, spill rest to temp files
                    PDDocument.load(inputFile, MemoryUsageSetting.setupMixed(50L * 1024 * 1024)).use { sourceDoc ->
                        val pageCount = sourceDoc.numberOfPages

                        if (pageCount == 0) {
                            Log.w(TAG, "Skipping empty PDF: ${inputFile.name}")
                            return@use
                        }

                        for (pageIndex in 0 until pageCount) {
                            // Check for cancellation at each page boundary
                            if (!coroutineContext[kotlinx.coroutines.Job]!!.isActive) {
                                throw CancellationException("Merge cancelled")
                            }

                            val sourcePage = sourceDoc.getPage(pageIndex)
                            val importedPage = outputDoc.importPage(sourcePage)

                            if (!isPro) {
                                PdfBoxHelper.addWatermarkToPage(outputDoc, importedPage)
                            }

                            totalPageCount++
                        }
                    }

                    // Report progress per file
                    val progress = ((fileIndex + 1) * 100) / fileCount
                    onProgress(progress, fileIndex + 1, fileCount)
                }

                if (totalPageCount == 0) {
                    throw IllegalArgumentException("No pages found in the provided PDF files")
                }

                PdfBoxHelper.atomicSave(outputDoc, outputFile)
            }

            // Validate output
            val validation = PdfBoxHelper.validateOutput(outputFile, totalPageCount)
            if (!validation.valid) {
                throw IllegalStateException("Output validation failed: ${validation.errorMessage}")
            }

            // Log metrics
            PdfBoxHelper.logMetrics(OperationMetrics(
                operationName = "merge",
                fileCount = fileCount,
                pageCount = totalPageCount,
                inputSizeBytes = totalInputSize,
                outputSizeBytes = outputFile.length(),
                durationMs = System.currentTimeMillis() - startTime
            ))

            return MergeResult(
                outputPath = outputFile.absolutePath,
                totalPages = totalPageCount,
                fileCount = fileCount,
                outputSize = outputFile.length()
            )
        } catch (e: CancellationException) {
            outputFile.delete()
            throw e
        } catch (e: OutOfMemoryError) {
            outputFile.delete()
            throw IllegalStateException("Not enough memory to merge PDFs", e)
        } catch (e: SecurityException) {
            outputFile.delete()
            throw IllegalArgumentException("One or more PDF files are corrupted or password-protected", e)
        } catch (e: Exception) {
            outputFile.delete()
            throw e
        } finally {
            // Clean up cache files from content:// URIs
            cacheFiles.forEach { it.delete() }
        }
    }

    /**
     * Get page count using PDFBox with memory-efficient loading.
     * Uses temp-file-only mode to minimize heap usage for metadata reads.
     */
    fun getPageCount(context: Context, inputPath: String): Int {
        return try {
            PdfBoxHelper.ensureInitialized(context)
            val inputFile = PdfBoxHelper.resolveInputFile(context, inputPath, "count")
            if (!inputFile.exists()) return 0

            PDDocument.load(inputFile, MemoryUsageSetting.setupTempFileOnly()).use { doc ->
                doc.numberOfPages
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get page count for $inputPath", e)
            0
        }
    }
}
