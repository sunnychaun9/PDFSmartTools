package com.pdfsmarttools.pdfsigner

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.Log
import com.pdfsmarttools.common.OperationMetrics
import com.pdfsmarttools.common.PdfBoxHelper
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import java.io.File

/**
 * Structural PDF signing engine using PDFBox content streams.
 *
 * Unlike the previous bitmap-overlay approach, this engine:
 * - Preserves text layers, searchability, and accessibility
 * - Only modifies the signed page (non-signed pages pass through untouched)
 * - File size increase is proportional to signature image size only (~50-200KB)
 * - Uses LosslessFactory (PNG) to preserve signature transparency
 */
class PdfSignerEngine {

    companion object {
        private const val TAG = "PdfSignerEngine"
    }

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

    /**
     * Sign a PDF using structural PDFBox content stream overlay.
     *
     * The signature is drawn on top of the existing page content using APPEND mode,
     * preserving all text layers, annotations, and form fields. Non-signed pages
     * are not modified at all.
     *
     * Coordinate translation: The caller passes Android-space coordinates (origin
     * at top-left, Y increases downward). This method translates to PDF-space
     * (origin at bottom-left, Y increases upward) using:
     *   pdfY = pageHeight - androidY - signatureHeight
     *
     * @param context Android context for PDFBox initialization and URI resolution
     * @param options Signing parameters including position and signature data
     * @param onProgress Progress callback (0-100, status message)
     * @return SigningResult with output metadata
     */
    fun signPdf(
        context: Context,
        options: SigningOptions,
        onProgress: (Int, String) -> Unit
    ): SigningResult {
        val startTime = System.currentTimeMillis()
        onProgress(0, "Opening PDF...")

        PdfBoxHelper.ensureInitialized(context)

        val inputFile = PdfBoxHelper.resolveInputFile(context, options.inputPath, "sign")
        val isCacheFile = options.inputPath.startsWith("content://")

        try {
            if (!inputFile.exists()) {
                throw IllegalArgumentException("Input PDF file not found")
            }

            val originalSize = inputFile.length()
            val outputFile = File(options.outputPath)
            outputFile.parentFile?.mkdirs()

            // Decode signature from Base64 to Bitmap
            onProgress(10, "Decoding signature...")
            val signatureBytes = Base64.decode(options.signatureBase64, Base64.DEFAULT)
            val signatureBitmap = BitmapFactory.decodeByteArray(signatureBytes, 0, signatureBytes.size)
                ?: throw IllegalStateException("Failed to decode signature image")

            onProgress(20, "Loading PDF...")

            PDDocument.load(inputFile, MemoryUsageSetting.setupMixed(50L * 1024 * 1024)).use { document ->
                val pageCount = document.numberOfPages

                if (pageCount == 0) {
                    signatureBitmap.recycle()
                    throw IllegalArgumentException("PDF has no pages")
                }

                if (options.pageNumber < 0 || options.pageNumber >= pageCount) {
                    signatureBitmap.recycle()
                    throw IllegalArgumentException(
                        "Page number ${options.pageNumber} is out of range (0-${pageCount - 1})"
                    )
                }

                onProgress(40, "Adding signature...")

                val page = document.getPage(options.pageNumber)
                val mediaBox = page.mediaBox
                val pageHeight = mediaBox.height

                // Convert signature Bitmap to PDImageXObject
                // LosslessFactory preserves transparency (PNG-based) for signature overlay
                val signatureImage = LosslessFactory.createFromImage(document, signatureBitmap)
                signatureBitmap.recycle()

                // Coordinate translation: Android Y (top-down) → PDF Y (bottom-up)
                val pdfX = options.positionX
                val pdfY = pageHeight - options.positionY - options.signatureHeight

                // Draw signature using content stream APPEND mode
                // This preserves all existing page content (text, images, annotations)
                PDPageContentStream(
                    document, page,
                    PDPageContentStream.AppendMode.APPEND,
                    true,  // compress
                    true   // reset context
                ).use { cs ->
                    cs.drawImage(
                        signatureImage,
                        pdfX,
                        pdfY,
                        options.signatureWidth,
                        options.signatureHeight
                    )
                }

                onProgress(60, "Finalizing...")

                // Add watermark for free users (only on signed page)
                if (options.addWatermark) {
                    PdfBoxHelper.addWatermarkToPage(document, page)
                }

                onProgress(80, "Saving signed PDF...")

                // Atomic save: write to temp file then rename
                PdfBoxHelper.atomicSave(document, outputFile)

                onProgress(90, "Validating...")

                // Validate output
                val validation = PdfBoxHelper.validateOutput(outputFile, pageCount)
                if (!validation.valid) {
                    throw IllegalStateException("Output validation failed: ${validation.errorMessage}")
                }

                // Log metrics
                PdfBoxHelper.logMetrics(OperationMetrics(
                    operationName = "sign",
                    fileCount = 1,
                    pageCount = pageCount,
                    inputSizeBytes = originalSize,
                    outputSizeBytes = outputFile.length(),
                    durationMs = System.currentTimeMillis() - startTime
                ))

                onProgress(100, "Complete!")

                return SigningResult(
                    outputPath = outputFile.absolutePath,
                    pageCount = pageCount,
                    signedPage = options.pageNumber + 1,
                    fileSize = outputFile.length()
                )
            }
        } catch (e: Exception) {
            // Clean up partial output on failure
            File(options.outputPath).delete()
            throw e
        } finally {
            // Clean up cache file from content:// URI
            if (isCacheFile) {
                inputFile.delete()
            }
        }
    }

    /**
     * Get page count using PDFBox with memory-efficient loading.
     */
    fun getPageCount(context: Context, pdfPath: String): Int {
        PdfBoxHelper.ensureInitialized(context)
        val inputFile = PdfBoxHelper.resolveInputFile(context, pdfPath, "count")
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found")

        val isCacheFile = pdfPath.startsWith("content://")
        try {
            return PDDocument.load(inputFile, MemoryUsageSetting.setupTempFileOnly()).use { doc ->
                doc.numberOfPages
            }
        } finally {
            if (isCacheFile) inputFile.delete()
        }
    }

    /**
     * Get page dimensions using PDFBox.
     * Returns dimensions in PDF points (1/72 inch) as integers for API compatibility.
     */
    fun getPageDimensions(context: Context, pdfPath: String, pageNumber: Int): Pair<Int, Int> {
        PdfBoxHelper.ensureInitialized(context)
        val inputFile = PdfBoxHelper.resolveInputFile(context, pdfPath, "dims")
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found")

        val isCacheFile = pdfPath.startsWith("content://")
        try {
            return PDDocument.load(inputFile, MemoryUsageSetting.setupTempFileOnly()).use { doc ->
                if (pageNumber < 0 || pageNumber >= doc.numberOfPages) {
                    throw IllegalArgumentException("Page number out of range")
                }
                val page = doc.getPage(pageNumber)
                val mediaBox = page.mediaBox
                Pair(mediaBox.width.toInt(), mediaBox.height.toInt())
            }
        } finally {
            if (isCacheFile) inputFile.delete()
        }
    }
}
