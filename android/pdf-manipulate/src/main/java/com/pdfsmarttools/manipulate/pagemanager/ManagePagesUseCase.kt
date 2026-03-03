package com.pdfsmarttools.manipulate.pagemanager

import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class ManagePagesUseCase(
    private val engine: PdfPageManagerEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend fun getPageInfo(inputPath: String): PdfResult<PdfPageManagerEngine.PdfInfo> =
        PdfResult.runCatching { engine.getPageInfo(inputPath) }

    suspend fun generateThumbnails(
        inputPath: String,
        outputDir: String,
        maxWidth: Int,
        isCancelled: () -> Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfPageManagerEngine.ThumbnailResult> = withContext(dispatchers.io) {
        PdfResult.runCatching {
            engine.generateThumbnails(inputPath, outputDir, maxWidth, isCancelled) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }

    suspend fun applyPageChanges(
        inputPath: String,
        outputPath: String,
        operations: List<PdfPageManagerEngine.PageOperation>,
        isPro: Boolean,
        isCancelled: () -> Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfPageManagerEngine.ApplyChangesResult> = withContext(dispatchers.io) {
        if (operations.isEmpty()) return@withContext PdfResult.failure(PdfError.InvalidInput("No page operations specified"))

        PdfResult.runCatching {
            engine.applyPageChanges(inputPath, outputPath, operations, isPro, isCancelled) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
