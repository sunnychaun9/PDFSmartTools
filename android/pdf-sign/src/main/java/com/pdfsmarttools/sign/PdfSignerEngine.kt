package com.pdfsmarttools.sign

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Base64
import com.pdfsmarttools.pdfcore.DefaultFileResolver
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import java.io.File

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

class PdfSignerEngine {

    companion object {
        private const val TAG = "PdfSignerEngine"
    }

    fun signPdf(
        context: Context,
        options: SigningOptions,
        onProgress: (Int, String) -> Unit
    ): SigningResult {
        val startTime = System.currentTimeMillis()
        onProgress(0, "Opening PDF...")

        PdfBoxFacade.ensureInitialized(context)

        val fileResolver = DefaultFileResolver(context)
        val inputFile = fileResolver.resolveInputFile(options.inputPath, "sign")
        val isCacheFile = fileResolver.isCacheFile(options.inputPath)

        try {
            if (!inputFile.exists()) throw IllegalArgumentException("Input PDF file not found")

            val originalSize = inputFile.length()
            val outputFile = File(options.outputPath)
            outputFile.parentFile?.mkdirs()

            onProgress(10, "Decoding signature...")
            val signatureBytes = Base64.decode(options.signatureBase64, Base64.DEFAULT)
            val signatureBitmap = BitmapFactory.decodeByteArray(signatureBytes, 0, signatureBytes.size)
                ?: throw IllegalStateException("Failed to decode signature image")

            onProgress(20, "Loading PDF...")

            PdfBoxFacade.loadDocument(inputFile).use { document ->
                val pageCount = document.numberOfPages
                if (pageCount == 0) { signatureBitmap.recycle(); throw IllegalArgumentException("PDF has no pages") }
                if (options.pageNumber < 0 || options.pageNumber >= pageCount) {
                    signatureBitmap.recycle()
                    throw IllegalArgumentException("Page number ${options.pageNumber} is out of range (0-${pageCount - 1})")
                }

                onProgress(40, "Adding signature...")

                val page = document.getPage(options.pageNumber)
                val pageHeight = page.mediaBox.height

                val signatureImage = LosslessFactory.createFromImage(document, signatureBitmap)
                signatureBitmap.recycle()

                val pdfX = options.positionX
                val pdfY = pageHeight - options.positionY - options.signatureHeight

                PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
                    cs.drawImage(signatureImage, pdfX, pdfY, options.signatureWidth, options.signatureHeight)
                }

                onProgress(60, "Finalizing...")

                if (options.addWatermark) PdfBoxFacade.addWatermarkToPage(document, page)

                onProgress(80, "Saving signed PDF...")
                PdfBoxFacade.atomicSave(document, outputFile)

                onProgress(90, "Validating...")
                val validation = PdfBoxFacade.validateOutput(outputFile, pageCount)
                if (!validation.valid) throw IllegalStateException("Output validation failed: ${validation.errorMessage}")

                PdfBoxFacade.logMetrics(OperationMetrics("sign", 1, pageCount, originalSize, outputFile.length(), System.currentTimeMillis() - startTime))
                onProgress(100, "Complete!")

                return SigningResult(outputFile.absolutePath, pageCount, options.pageNumber + 1, outputFile.length())
            }
        } catch (e: Exception) {
            File(options.outputPath).delete(); throw e
        } finally {
            if (isCacheFile) inputFile.delete()
        }
    }

    fun getPageCount(context: Context, pdfPath: String): Int {
        PdfBoxFacade.ensureInitialized(context)
        val fileResolver = DefaultFileResolver(context)
        val inputFile = fileResolver.resolveInputFile(pdfPath, "count")
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found")
        val isCacheFile = fileResolver.isCacheFile(pdfPath)
        try {
            return PdfBoxFacade.loadDocumentTempFileOnly(inputFile).use { it.numberOfPages }
        } finally { if (isCacheFile) inputFile.delete() }
    }

    fun getPageDimensions(context: Context, pdfPath: String, pageNumber: Int): Pair<Int, Int> {
        PdfBoxFacade.ensureInitialized(context)
        val fileResolver = DefaultFileResolver(context)
        val inputFile = fileResolver.resolveInputFile(pdfPath, "dims")
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found")
        val isCacheFile = fileResolver.isCacheFile(pdfPath)
        try {
            return PdfBoxFacade.loadDocumentTempFileOnly(inputFile).use { doc ->
                if (pageNumber < 0 || pageNumber >= doc.numberOfPages) throw IllegalArgumentException("Page number out of range")
                val page = doc.getPage(pageNumber)
                Pair(page.mediaBox.width.toInt(), page.mediaBox.height.toInt())
            }
        } finally { if (isCacheFile) inputFile.delete() }
    }
}
