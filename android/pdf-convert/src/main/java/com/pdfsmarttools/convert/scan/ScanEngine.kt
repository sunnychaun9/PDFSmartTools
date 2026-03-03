package com.pdfsmarttools.convert.scan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.media.ExifInterface
import java.io.File
import java.io.FileOutputStream

data class ScanToPdfResult(
    val outputPath: String,
    val pageCount: Int,
    val fileSize: Long
)

/**
 * Engine extracted from ScanPdfModule.
 * Converts scanned images to PDF.
 */
class ScanEngine {

    companion object {
        private const val TAG = "ScanEngine"
        private const val A4_WIDTH = 595
        private const val A4_HEIGHT = 842
    }

    fun generatePdf(
        context: Context,
        imagePaths: List<String>,
        outputPath: String,
        isPro: Boolean,
        onProgress: (Int, String) -> Unit
    ): ScanToPdfResult {
        if (imagePaths.isEmpty()) throw IllegalArgumentException("No images provided")

        onProgress(0, "Starting PDF generation...")

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        val tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")

        val pdfDocument = PdfDocument()
        try {
            for ((index, imagePath) in imagePaths.withIndex()) {
                val bitmap = loadAndRotateBitmap(imagePath)
                    ?: throw IllegalArgumentException("Failed to load image: $imagePath")

                try {
                    val pageWidth: Int
                    val pageHeight: Int

                    if (bitmap.width > bitmap.height) {
                        pageWidth = A4_HEIGHT
                        pageHeight = A4_WIDTH
                    } else {
                        pageWidth = A4_WIDTH
                        pageHeight = A4_HEIGHT
                    }

                    val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, index + 1).create()
                    val page = pdfDocument.startPage(pageInfo)

                    val scale = minOf(
                        pageWidth.toFloat() / bitmap.width,
                        pageHeight.toFloat() / bitmap.height
                    )
                    val scaledWidth = (bitmap.width * scale).toInt()
                    val scaledHeight = (bitmap.height * scale).toInt()
                    val offsetX = (pageWidth - scaledWidth) / 2f
                    val offsetY = (pageHeight - scaledHeight) / 2f

                    val paint = Paint().apply { isFilterBitmap = true; isAntiAlias = true }
                    page.canvas.drawBitmap(
                        bitmap, null,
                        android.graphics.RectF(offsetX, offsetY, offsetX + scaledWidth, offsetY + scaledHeight),
                        paint
                    )

                    pdfDocument.finishPage(page)
                } finally {
                    bitmap.recycle()
                }

                onProgress(((index + 1) * 90) / imagePaths.size, "Processing image ${index + 1} of ${imagePaths.size}...")
            }

            onProgress(90, "Saving PDF...")
            FileOutputStream(tempFile).use { out -> pdfDocument.writeTo(out) }
        } finally {
            pdfDocument.close()
        }

        if (tempFile.exists()) {
            if (outputFile.exists()) outputFile.delete()
            if (!tempFile.renameTo(outputFile)) {
                tempFile.copyTo(outputFile, overwrite = true)
                tempFile.delete()
            }
        }

        onProgress(100, "Complete!")
        return ScanToPdfResult(outputPath, imagePaths.size, outputFile.length())
    }

    private fun loadAndRotateBitmap(imagePath: String): Bitmap? {
        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
        val bitmap = BitmapFactory.decodeFile(imagePath, options) ?: return null

        val rotation = try {
            val exif = ExifInterface(imagePath)
            when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } catch (e: Exception) { 0f }

        if (rotation == 0f) return bitmap

        val matrix = Matrix().apply { postRotate(rotation) }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }
}
