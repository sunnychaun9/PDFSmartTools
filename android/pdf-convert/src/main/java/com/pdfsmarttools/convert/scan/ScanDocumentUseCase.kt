package com.pdfsmarttools.convert.scan

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class ScanDocumentUseCase(
    private val engine: ScanEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context, imagePaths: List<String>, outputPath: String, isPro: Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<ScanToPdfResult> = withContext(dispatchers.io) {
        PdfResult.runCatching {
            engine.generatePdf(context, imagePaths, outputPath, isPro) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
