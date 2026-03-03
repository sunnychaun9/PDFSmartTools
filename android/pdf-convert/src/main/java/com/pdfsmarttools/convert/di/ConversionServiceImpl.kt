package com.pdfsmarttools.convert.di

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.convert.frompoi.ConvertWordToPdfUseCase
import com.pdfsmarttools.convert.frompoi.WordToPdfEngine
import com.pdfsmarttools.convert.ocr.OcrPdfUseCase
import com.pdfsmarttools.convert.ocr.PdfOcrEngine
import com.pdfsmarttools.convert.scan.ScanDocumentUseCase
import com.pdfsmarttools.convert.scan.ScanEngine
import com.pdfsmarttools.convert.toimage.ConvertPdfToImageUseCase
import com.pdfsmarttools.convert.toimage.PdfToImageEngine
import com.pdfsmarttools.convert.toword.ConvertPdfToWordUseCase
import com.pdfsmarttools.convert.toword.PdfToWordEngine
import com.pdfsmarttools.pdfcore.api.PdfConversionService

class ConversionServiceImpl(
    private val context: Context,
    private val dispatchers: DispatcherProvider
) : PdfConversionService {

    private val toImageUseCase = ConvertPdfToImageUseCase(PdfToImageEngine(), dispatchers)
    private val toWordUseCase = ConvertPdfToWordUseCase(PdfToWordEngine(), dispatchers)
    private val wordToPdfUseCase = ConvertWordToPdfUseCase(WordToPdfEngine(), dispatchers)
    private val ocrUseCase = OcrPdfUseCase(PdfOcrEngine(context), dispatchers)
    private val scanUseCase = ScanDocumentUseCase(ScanEngine(), dispatchers)

    override suspend fun convertPdfToImages(
        options: PdfConversionService.PdfToImageOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfConversionService.PdfToImageResult> {
        return toImageUseCase(options.inputPath, options.outputDir, options.format, emptyList(), options.quality, options.maxResolution, options.isPro, progressReporter = progressReporter)
            .map { PdfConversionService.PdfToImageResult(it.outputPaths, it.pageCount, it.format) }
    }

    override suspend fun convertPdfToWord(
        options: PdfConversionService.PdfToWordOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfConversionService.PdfToWordResult> {
        return toWordUseCase(context, options.inputPath, options.outputPath, options.extractImages, options.isPro, progressReporter)
            .map { PdfConversionService.PdfToWordResult(it.outputPath, it.pageCount, it.wordCount, it.fileSize) }
    }

    override suspend fun convertWordToPdf(
        options: PdfConversionService.WordToPdfOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfConversionService.WordToPdfResult> {
        return wordToPdfUseCase(context, options.inputPath, options.outputPath, options.isPro, progressReporter)
            .map { PdfConversionService.WordToPdfResult(it.outputPath, it.pageCount, it.fileSize) }
    }

    override suspend fun ocrPdf(
        options: PdfConversionService.OcrOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfConversionService.OcrResult> {
        return ocrUseCase(options.inputPath, options.outputPath, options.isPro, progressReporter = progressReporter)
            .map { PdfConversionService.OcrResult(it.outputPath, it.pageCount, it.characterCount, it.wordCount, it.averageConfidence, it.processingTimeMs) }
    }

    override suspend fun scanToPdf(
        options: PdfConversionService.ScanOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfConversionService.ScanResult> {
        return scanUseCase(context, options.imagePaths, options.outputPath, options.isPro, progressReporter)
            .map { PdfConversionService.ScanResult(it.outputPath, it.pageCount, it.fileSize) }
    }

    override suspend fun getPdfPageCount(inputPath: String): PdfResult<Int> {
        return PdfResult.runCatching { PdfToImageEngine().getPageCount(inputPath) }
    }
}
