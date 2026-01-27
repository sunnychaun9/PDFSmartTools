package com.pdfsmarttools.pdfcompressor

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream

class PdfCompressorEngine {

    fun compress(
        context: Context,
        inputPath: String,
        outputPath: String,
        level: CompressionLevel,
        isPro: Boolean = false,
        onProgress: (progress: Int, currentPage: Int, totalPages: Int) -> Unit
    ): CompressionResult {
        val inputFile = resolveInputFile(context, inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input file not found: $inputPath")
        }

        val originalSize = inputFile.length()
        val outputFile = File(outputPath)

        // Ensure output directory exists
        outputFile.parentFile?.mkdirs()

        // Open the PDF for rendering
        val fileDescriptor = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val pdfRenderer = PdfRenderer(fileDescriptor)
        val pageCount = pdfRenderer.pageCount

        if (pageCount == 0) {
            pdfRenderer.close()
            fileDescriptor.close()
            throw IllegalArgumentException("PDF has no pages")
        }

        // Create new PDF document
        val pdfDocument = PdfDocument()

        try {
            for (i in 0 until pageCount) {
                val page = pdfRenderer.openPage(i)

                // Calculate dimensions at target DPI
                // Default PDF DPI is 72, so we scale accordingly
                val scale = level.dpi / 72f
                val width = (page.width * scale).toInt()
                val height = (page.height * scale).toInt()

                // Create bitmap and render page
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)

                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                page.close()

                // Draw watermark for free users
                if (!isPro) {
                    drawWatermark(bitmap)
                }

                // Compress bitmap to JPEG in memory
                val compressedBitmap = compressBitmap(bitmap, level.quality)
                bitmap.recycle()

                // Create PDF page with original dimensions (points)
                val pageInfo = PdfDocument.PageInfo.Builder(page.width, page.height, i + 1).create()
                val pdfPage = pdfDocument.startPage(pageInfo)

                // Draw compressed bitmap onto PDF page, scaled to fit
                val canvas = pdfPage.canvas
                val destRect = android.graphics.Rect(0, 0, page.width, page.height)
                canvas.drawBitmap(compressedBitmap, null, destRect, null)

                pdfDocument.finishPage(pdfPage)
                compressedBitmap.recycle()

                // Report progress
                val progress = ((i + 1) * 100) / pageCount
                onProgress(progress, i + 1, pageCount)
            }

            // Write output PDF
            FileOutputStream(outputFile).use { output ->
                pdfDocument.writeTo(output)
            }

        } finally {
            pdfDocument.close()
            pdfRenderer.close()
            fileDescriptor.close()
        }

        val compressedSize = outputFile.length()
        val compressionRatio = if (originalSize > 0) {
            1.0 - (compressedSize.toDouble() / originalSize.toDouble())
        } else {
            0.0
        }

        return CompressionResult(
            outputPath = outputFile.absolutePath,
            originalSize = originalSize,
            compressedSize = compressedSize,
            compressionRatio = compressionRatio,
            pageCount = pageCount
        )
    }

    private fun resolveInputFile(context: Context, inputPath: String): File {
        // Handle content:// URIs by copying to cache
        if (inputPath.startsWith("content://")) {
            val uri = android.net.Uri.parse(inputPath)
            val cacheFile = File(context.cacheDir, "input_${System.currentTimeMillis()}.pdf")

            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(cacheFile).use { output ->
                    input.copyTo(output)
                }
            } ?: throw IllegalArgumentException("Cannot open content URI: $inputPath")

            return cacheFile
        }

        // Handle file:// URIs
        val path = if (inputPath.startsWith("file://")) {
            inputPath.removePrefix("file://")
        } else {
            inputPath
        }

        return File(path)
    }

    private fun compressBitmap(bitmap: Bitmap, quality: Int): Bitmap {
        // Compress to JPEG and decode back to get compressed bitmap
        val outputStream = java.io.ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)

        val byteArray = outputStream.toByteArray()
        return android.graphics.BitmapFactory.decodeByteArray(byteArray, 0, byteArray.size)
    }

    private fun drawWatermark(bitmap: Bitmap) {
        val canvas = Canvas(bitmap)
        val paint = Paint().apply {
            color = Color.GRAY
            alpha = 40
            textSize = bitmap.width / 12f
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }

        val watermarkText = "PDF Smart Tools – Free Version"

        // Save canvas state
        canvas.save()

        // Move to center and rotate
        val centerX = bitmap.width / 2f
        val centerY = bitmap.height / 2f
        canvas.translate(centerX, centerY)
        canvas.rotate(-30f)

        // Draw text at center (now at origin after translation)
        canvas.drawText(watermarkText, 0f, 0f, paint)

        // Restore canvas state
        canvas.restore()
    }
}
