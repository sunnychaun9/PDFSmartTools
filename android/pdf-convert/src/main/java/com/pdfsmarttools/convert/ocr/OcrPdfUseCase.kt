package com.pdfsmarttools.convert.ocr

import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.io.FileResolver
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class OcrPdfUseCase(
    private val engine: PdfOcrEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        inputPath: String, outputPath: String, isPro: Boolean,
        fileResolver: FileResolver? = null,
        isCancelled: () -> Boolean = { false },
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<OcrResult> = withContext(dispatchers.io) {
        PdfResult.runCatching {
            engine.processToSearchablePdf(inputPath, outputPath, isPro, fileResolver, isCancelled) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
