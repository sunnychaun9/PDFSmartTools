package com.pdfsmarttools.manipulate.batch

import android.content.Context
import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.manipulate.compress.CompressPdfUseCase
import com.pdfsmarttools.manipulate.merge.MergePdfsUseCase
import com.pdfsmarttools.manipulate.split.SplitPdfUseCase
import com.pdfsmarttools.pdfcore.model.CompressionLevel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import java.io.File
import java.util.UUID
import kotlin.coroutines.coroutineContext

/**
 * Executes individual file operations within a batch.
 * Each worker processes one file at a time through the existing use cases.
 */
class BatchWorker(
    private val context: Context,
    private val compressUseCase: CompressPdfUseCase,
    private val mergeUseCase: MergePdfsUseCase,
    private val splitUseCase: SplitPdfUseCase
) {
    companion object {
        private const val TAG = "BatchWorker"
        private const val MEMORY_REQUIRED_MB = 30L
        private const val GC_RETRY_DELAY_MS = 500L
        private const val MAX_GC_RETRIES = 3
    }

    /**
     * Process a single file for compression.
     * Includes memory safety check before processing.
     */
    suspend fun compressFile(
        inputPath: String,
        outputDir: String,
        level: CompressionLevel,
        isPro: Boolean
    ): BatchFileResult {
        coroutineContext.ensureActive()

        if (!ensureMemoryAvailable()) {
            return BatchFileResult(
                inputPath = inputPath,
                outputPath = "",
                success = false,
                errorCode = "OUT_OF_MEMORY",
                errorMessage = "Insufficient memory to process file"
            )
        }

        val fileName = File(inputPath).nameWithoutExtension
        val outputPath = File(outputDir, "${fileName}_compressed_${UUID.randomUUID().toString().take(6)}.pdf")
            .absolutePath

        return try {
            val result = compressUseCase(
                context = context,
                inputPath = inputPath,
                outputPath = outputPath,
                level = level,
                isPro = isPro
            )

            when (result) {
                is PdfResult.Success -> BatchFileResult(
                    inputPath = inputPath,
                    outputPath = result.data.outputPath,
                    success = true,
                    outputSize = result.data.compressedSize
                )
                is PdfResult.Failure -> BatchFileResult(
                    inputPath = inputPath,
                    outputPath = outputPath,
                    success = false,
                    errorCode = result.error.code,
                    errorMessage = result.error.message
                )
            }
        } catch (e: CancellationException) {
            File(outputPath).let { if (it.exists()) it.delete() }
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Failed to compress $inputPath", e)
            BatchFileResult(
                inputPath = inputPath,
                outputPath = outputPath,
                success = false,
                errorCode = "PROCESSING_FAILED",
                errorMessage = e.message ?: "Unknown error"
            )
        }
    }

    /**
     * Merge a group of files into a single output.
     */
    suspend fun mergeFiles(
        inputPaths: List<String>,
        outputDir: String,
        groupIndex: Int,
        isPro: Boolean
    ): BatchFileResult {
        coroutineContext.ensureActive()

        if (!ensureMemoryAvailable()) {
            return BatchFileResult(
                inputPath = inputPaths.firstOrNull() ?: "",
                outputPath = "",
                success = false,
                errorCode = "OUT_OF_MEMORY",
                errorMessage = "Insufficient memory to merge files"
            )
        }

        val outputPath = File(outputDir, "merged_group${groupIndex}_${UUID.randomUUID().toString().take(6)}.pdf")
            .absolutePath

        return try {
            val result = mergeUseCase(
                context = context,
                inputPaths = inputPaths,
                outputPath = outputPath,
                isPro = isPro
            )

            when (result) {
                is PdfResult.Success -> BatchFileResult(
                    inputPath = inputPaths.joinToString(","),
                    outputPath = result.data.outputPath,
                    success = true,
                    outputSize = result.data.outputSize
                )
                is PdfResult.Failure -> BatchFileResult(
                    inputPath = inputPaths.joinToString(","),
                    outputPath = outputPath,
                    success = false,
                    errorCode = result.error.code,
                    errorMessage = result.error.message
                )
            }
        } catch (e: CancellationException) {
            File(outputPath).let { if (it.exists()) it.delete() }
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Failed to merge group $groupIndex", e)
            BatchFileResult(
                inputPath = inputPaths.firstOrNull() ?: "",
                outputPath = outputPath,
                success = false,
                errorCode = "PROCESSING_FAILED",
                errorMessage = e.message ?: "Unknown error"
            )
        }
    }

    /**
     * Split a single PDF into multiple outputs.
     * @param ranges Page ranges as pairs (startPage, endPage), 1-indexed.
     */
    suspend fun splitFile(
        inputPath: String,
        outputDir: String,
        ranges: List<Pair<Int, Int>>,
        isPro: Boolean
    ): BatchFileResult {
        coroutineContext.ensureActive()

        if (!ensureMemoryAvailable()) {
            return BatchFileResult(
                inputPath = inputPath,
                outputPath = "",
                success = false,
                errorCode = "OUT_OF_MEMORY",
                errorMessage = "Insufficient memory to split file"
            )
        }

        val baseName = File(inputPath).nameWithoutExtension

        return try {
            val result = splitUseCase(
                context = context,
                inputPath = inputPath,
                outputDir = outputDir,
                baseName = baseName,
                pageRanges = ranges,
                isPro = isPro
            )

            when (result) {
                is PdfResult.Success -> {
                    val totalSize = result.data.outputFiles.sumOf { it.fileSize }
                    val firstOutput = result.data.outputFiles.firstOrNull()?.path ?: outputDir
                    BatchFileResult(
                        inputPath = inputPath,
                        outputPath = firstOutput,
                        success = true,
                        outputSize = totalSize
                    )
                }
                is PdfResult.Failure -> BatchFileResult(
                    inputPath = inputPath,
                    outputPath = "",
                    success = false,
                    errorCode = result.error.code,
                    errorMessage = result.error.message
                )
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Failed to split $inputPath", e)
            BatchFileResult(
                inputPath = inputPath,
                outputPath = "",
                success = false,
                errorCode = "PROCESSING_FAILED",
                errorMessage = e.message ?: "Unknown error"
            )
        }
    }

    /**
     * Memory safety gate. Retries with GC up to MAX_GC_RETRIES times.
     */
    private suspend fun ensureMemoryAvailable(): Boolean {
        for (attempt in 1..MAX_GC_RETRIES) {
            if (MemoryBudget.availableMemoryMb() >= MEMORY_REQUIRED_MB) {
                return true
            }
            Log.w(TAG, "Memory low (${MemoryBudget.availableMemoryMb()}MB), GC attempt $attempt/$MAX_GC_RETRIES")
            System.gc()
            kotlinx.coroutines.delay(GC_RETRY_DELAY_MS)
        }
        Log.e(TAG, "Memory still insufficient after $MAX_GC_RETRIES GC attempts: ${MemoryBudget.availableMemoryMb()}MB")
        return false
    }
}
