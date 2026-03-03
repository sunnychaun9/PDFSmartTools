package com.pdfsmarttools.manipulate.compress

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.pdfcore.model.CompressionLevel
import kotlinx.coroutines.withContext

class CompressPdfUseCase(
    private val engine: PdfCompressorEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context,
        inputPath: String,
        outputPath: String,
        level: CompressionLevel,
        isPro: Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<CompressionResult> = withContext(dispatchers.io) {
        if (inputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Input path is empty"))
        if (outputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Output path is empty"))

        PdfResult.runCatching {
            engine.compress(context, inputPath, outputPath, level, isPro) { progress, currentPage, totalPages ->
                progressReporter.onProgress(progress, currentPage, totalPages, "Compressing page $currentPage of $totalPages")
            }
        }
    }
}
