package com.pdfsmarttools.convert.toword

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class ConvertPdfToWordUseCase(
    private val engine: PdfToWordEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context, inputPath: String, outputPath: String,
        extractImages: Boolean, isPro: Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfToWordResult> = withContext(dispatchers.io) {
        PdfResult.runCatching {
            engine.convertToDocx(context, inputPath, outputPath, extractImages, isPro) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
