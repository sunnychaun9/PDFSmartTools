package com.pdfsmarttools.sign.di

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.pdfcore.api.PdfSigningService
import com.pdfsmarttools.sign.GetPageCountUseCase
import com.pdfsmarttools.sign.GetPageDimensionsUseCase
import com.pdfsmarttools.sign.PdfSignerEngine
import com.pdfsmarttools.sign.SignPdfUseCase
import com.pdfsmarttools.sign.SigningOptions

class SigningServiceImpl(
    private val context: Context,
    private val dispatchers: DispatcherProvider
) : PdfSigningService {

    private val engine = PdfSignerEngine()
    private val signPdfUseCase = SignPdfUseCase(engine, dispatchers)
    private val getPageCountUseCase = GetPageCountUseCase(engine, dispatchers)
    private val getPageDimensionsUseCase = GetPageDimensionsUseCase(engine, dispatchers)

    override suspend fun signPdf(
        options: PdfSigningService.SigningOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfSigningService.SigningResult> {
        val engineOptions = SigningOptions(
            inputPath = options.inputPath,
            outputPath = options.outputPath,
            signatureBase64 = options.signatureBase64,
            pageNumber = options.pageNumber,
            positionX = options.positionX,
            positionY = options.positionY,
            signatureWidth = options.signatureWidth,
            signatureHeight = options.signatureHeight,
            addWatermark = options.addWatermark
        )
        return signPdfUseCase(context, engineOptions, progressReporter)
            .map { PdfSigningService.SigningResult(it.outputPath, it.pageCount, it.signedPage, it.fileSize) }
    }

    override suspend fun getPageCount(pdfPath: String): PdfResult<Int> =
        getPageCountUseCase(context, pdfPath)

    override suspend fun getPageDimensions(pdfPath: String, pageNumber: Int): PdfResult<Pair<Int, Int>> =
        getPageDimensionsUseCase(context, pdfPath, pageNumber)
}
