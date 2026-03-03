package com.pdfsmarttools.manipulate.merge

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class MergePdfsUseCase(
    private val engine: PdfMergerEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context,
        inputPaths: List<String>,
        outputPath: String,
        isPro: Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<MergeResult> = withContext(dispatchers.io) {
        if (inputPaths.size < 2) return@withContext PdfResult.failure(PdfError.InvalidInput("At least 2 PDF files are required"))
        if (outputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Output path is empty"))

        PdfResult.runCatching {
            engine.merge(context, inputPaths, outputPath, isPro) { progress, currentFile, totalFiles ->
                progressReporter.onProgress(progress, currentFile, totalFiles, "Merging file $currentFile of $totalFiles")
            }
        }
    }
}
