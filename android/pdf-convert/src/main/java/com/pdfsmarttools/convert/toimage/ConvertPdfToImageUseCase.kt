package com.pdfsmarttools.convert.toimage

import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.io.FileResolver
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class ConvertPdfToImageUseCase(
    private val engine: PdfToImageEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(
        inputPath: String, outputDir: String, format: String, pageIndices: List<Int>,
        quality: Int, maxResolution: Int, isPro: Boolean,
        fileResolver: FileResolver? = null,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<ImageConversionResult> = withContext(dispatchers.io) {
        if (inputPath.isBlank()) return@withContext PdfResult.failure(PdfError.InvalidInput("Input path is empty"))
        PdfResult.runCatching {
            engine.convertToImages(inputPath, outputDir, format, pageIndices, quality, maxResolution, isPro, fileResolver) { current, total, pageIndex ->
                progressReporter.onProgress(((current * 100) / total), current, total, "Converting page ${pageIndex + 1}")
            }
        }
    }
}
