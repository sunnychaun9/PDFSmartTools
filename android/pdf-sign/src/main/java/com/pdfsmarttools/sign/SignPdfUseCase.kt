package com.pdfsmarttools.sign

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class SignPdfUseCase(
    private val engine: PdfSignerEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context,
        options: SigningOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<SigningResult> = withContext(dispatchers.io) {
        if (options.signatureBase64.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Signature data is empty"))
        if (options.pageNumber < 0) return@withContext PdfResult.failure(PdfError.InvalidInput("Page number must be >= 0"))
        if (options.signatureWidth <= 0 || options.signatureHeight <= 0) return@withContext PdfResult.failure(PdfError.InvalidInput("Signature dimensions must be positive"))

        PdfResult.runCatching {
            engine.signPdf(context, options) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
