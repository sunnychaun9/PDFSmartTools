package com.pdfsmarttools.pdfcore.api

import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult

/**
 * Service interface for PDF conversion operations:
 * PDF-to-image, PDF-to-word, Word-to-PDF, OCR, and scan.
 */
interface PdfConversionService {

    // --- PDF to Image ---

    data class PdfToImageOptions(
        val inputPath: String,
        val outputDir: String,
        val format: String = "jpeg",
        val quality: Int = 90,
        val maxResolution: Int = 2048,
        val isPro: Boolean = false
    )

    data class PdfToImageResult(
        val outputPaths: List<String>,
        val pageCount: Int,
        val format: String
    )

    suspend fun convertPdfToImages(
        options: PdfToImageOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfToImageResult>

    // --- PDF to Word ---

    data class PdfToWordOptions(
        val inputPath: String,
        val outputPath: String,
        val extractImages: Boolean = true,
        val isPro: Boolean = false
    )

    data class PdfToWordResult(
        val outputPath: String,
        val pageCount: Int,
        val wordCount: Int,
        val fileSize: Long
    )

    suspend fun convertPdfToWord(
        options: PdfToWordOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<PdfToWordResult>

    // --- Word to PDF ---

    data class WordToPdfOptions(
        val inputPath: String,
        val outputPath: String,
        val isPro: Boolean = false
    )

    data class WordToPdfResult(
        val outputPath: String,
        val pageCount: Int,
        val fileSize: Long
    )

    suspend fun convertWordToPdf(
        options: WordToPdfOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<WordToPdfResult>

    // --- OCR ---

    data class OcrOptions(
        val inputPath: String,
        val outputPath: String,
        val isPro: Boolean = false
    )

    data class OcrResult(
        val outputPath: String,
        val pageCount: Int,
        val characterCount: Int,
        val wordCount: Int,
        val averageConfidence: Float,
        val processingTimeMs: Long
    )

    suspend fun ocrPdf(
        options: OcrOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<OcrResult>

    // --- Scan ---

    data class ScanOptions(
        val imagePaths: List<String>,
        val outputPath: String,
        val isPro: Boolean = false
    )

    data class ScanResult(
        val outputPath: String,
        val pageCount: Int,
        val fileSize: Long
    )

    suspend fun scanToPdf(
        options: ScanOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<ScanResult>

    // --- Helpers ---

    suspend fun getPdfPageCount(inputPath: String): PdfResult<Int>
}
