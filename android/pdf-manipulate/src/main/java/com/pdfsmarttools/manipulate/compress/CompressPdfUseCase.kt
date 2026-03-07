package com.pdfsmarttools.manipulate.compress

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.manipulate.streaming.PdfStreamingEngine
import com.pdfsmarttools.manipulate.streaming.StreamingCompressEngine
import com.pdfsmarttools.pdfcore.engine.CompressParams
import com.pdfsmarttools.pdfcore.model.CompressionLevel
import kotlinx.coroutines.withContext
import java.io.File

class CompressPdfUseCase(
    private val engine: PdfCompressorEngine,
    private val dispatchers: DispatcherProvider
) {
    private val streamingEngine by lazy { StreamingCompressEngine() }

    suspend operator fun invoke(
        context: Context,
        inputPath: String,
        outputPath: String,
        level: CompressionLevel,
        isPro: Boolean,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<CompressionResult> = withContext(dispatchers.io) {
        if (inputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Input path is empty"))
        if (outputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Output path is empty"))

        // Auto-enable streaming for large files (>30MB)
        val inputFile = File(inputPath)
        if (inputFile.exists() && inputFile.length() > PdfStreamingEngine.STREAMING_THRESHOLD_BYTES) {
            val params = CompressParams(
                context = context,
                inputPath = inputPath,
                outputPath = outputPath,
                isPro = isPro,
                level = level
            )
            return@withContext streamingEngine.execute(params, progressReporter).map { result ->
                CompressionResult(
                    outputPath = result.outputPath,
                    originalSize = result.originalSize,
                    compressedSize = result.outputSize,
                    compressionRatio = result.compressionRatio,
                    pageCount = result.pageCount
                )
            }
        }

        PdfResult.runCatching {
            engine.compress(context, inputPath, outputPath, level, isPro) { progress, currentPage, totalPages ->
                progressReporter.onProgress(progress, currentPage, totalPages, "Compressing page $currentPage of $totalPages")
            }
        }
    }
}
