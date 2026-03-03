package com.pdfsmarttools.manipulate.split

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class SplitPdfUseCase(
    private val engine: PdfSplitterEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        context: Context,
        inputPath: String,
        outputDir: String,
        baseName: String,
        pageRanges: List<Pair<Int, Int>>,
        isPro: Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<SplitResult> = withContext(dispatchers.io) {
        if (inputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Input path is empty"))
        if (pageRanges.isEmpty()) return@withContext PdfResult.failure(PdfError.InvalidInput("No page ranges specified"))

        PdfResult.runCatching {
            engine.split(context, inputPath, outputDir, baseName, pageRanges, isPro) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
