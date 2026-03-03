package com.pdfsmarttools.manipulate.unlock

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class UnlockPdfUseCase(
    private val engine: PdfUnlockEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context,
        inputPath: String,
        outputPath: String,
        password: String,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<UnlockResult> = withContext(dispatchers.io) {
        if (inputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Input path is empty"))
        if (password.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Password is empty"))

        PdfResult.runCatching {
            engine.unlockPdf(context, inputPath, outputPath, password) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
