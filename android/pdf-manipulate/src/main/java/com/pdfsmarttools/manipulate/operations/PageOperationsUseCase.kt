package com.pdfsmarttools.manipulate.operations

import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import android.content.Context
import kotlinx.coroutines.withContext

class PageOperationsUseCase(
    private val engine: PdfPageOperationsEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend fun deletePages(
        context: Context,
        inputPath: String,
        pagesToDelete: List<Int>,
        outputPath: String,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfPageOperationsEngine.OperationResult> = withContext(dispatchers.io) {
        if (pagesToDelete.isEmpty()) return@withContext PdfResult.failure(PdfError.InvalidInput("No pages specified"))
        PdfResult.runCatching {
            engine.deletePages(context, inputPath, pagesToDelete, outputPath) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }

    suspend fun extractPages(
        context: Context,
        inputPath: String,
        pagesToExtract: List<Int>,
        outputPath: String,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfPageOperationsEngine.OperationResult> = withContext(dispatchers.io) {
        if (pagesToExtract.isEmpty()) return@withContext PdfResult.failure(PdfError.InvalidInput("No pages specified"))
        PdfResult.runCatching {
            engine.extractPages(context, inputPath, pagesToExtract, outputPath) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }

    suspend fun reorderPages(
        context: Context,
        inputPath: String,
        newPageOrder: List<Int>,
        outputPath: String,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfPageOperationsEngine.OperationResult> = withContext(dispatchers.io) {
        if (newPageOrder.isEmpty()) return@withContext PdfResult.failure(PdfError.InvalidInput("Page order is empty"))
        PdfResult.runCatching {
            engine.reorderPages(context, inputPath, newPageOrder, outputPath) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }

    suspend fun rotatePages(
        context: Context,
        inputPath: String,
        pageRotations: Map<Int, Int>,
        outputPath: String,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfPageOperationsEngine.OperationResult> = withContext(dispatchers.io) {
        if (pageRotations.isEmpty()) return@withContext PdfResult.failure(PdfError.InvalidInput("No rotations specified"))
        PdfResult.runCatching {
            engine.rotatePages(context, inputPath, pageRotations, outputPath) { progress, status ->
                progressReporter.onStage(progress, status)
            }
        }
    }
}
