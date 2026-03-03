package com.pdfsmarttools.convert.frompoi

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class ConvertWordToPdfUseCase(
    private val engine: WordToPdfEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context, inputPath: String, outputPath: String, isPro: Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<WordToPdfResult> = withContext(dispatchers.io) {
        PdfResult.runCatching {
            engine.convertToPdf(context, inputPath, outputPath, isPro) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
