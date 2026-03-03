package com.pdfsmarttools.pdfcore.api

import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult

/**
 * Service interface for PDF signing operations.
 */
interface PdfSigningService {

    data class SigningOptions(
        val inputPath: String,
        val outputPath: String,
        val signatureBase64: String,
        val pageNumber: Int,
        val positionX: Float,
        val positionY: Float,
        val signatureWidth: Float,
        val signatureHeight: Float,
        val addWatermark: Boolean
    )

    data class SigningResult(
        val outputPath: String,
        val pageCount: Int,
        val signedPage: Int,
        val fileSize: Long
    )

    suspend fun signPdf(
        options: SigningOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<SigningResult>

    suspend fun getPageCount(pdfPath: String): PdfResult<Int>

    suspend fun getPageDimensions(pdfPath: String, pageNumber: Int): PdfResult<Pair<Int, Int>>
}
