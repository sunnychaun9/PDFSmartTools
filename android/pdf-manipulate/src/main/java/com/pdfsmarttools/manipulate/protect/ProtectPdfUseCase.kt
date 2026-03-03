package com.pdfsmarttools.manipulate.protect

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class ProtectPdfUseCase(
    private val engine: PdfProtectorEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context,
        inputPath: String,
        outputPath: String,
        password: String,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<ProtectResult> = withContext(dispatchers.io) {
        if (inputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Input path is empty"))
        if (password.length < 6) return@withContext PdfResult.failure(PdfError.InvalidInput("Password must be at least 6 characters"))

        PdfResult.runCatching {
            engine.protectPdf(context, inputPath, outputPath, password) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
