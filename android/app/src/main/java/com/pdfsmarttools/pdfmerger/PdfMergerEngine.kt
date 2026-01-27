package com.pdfsmarttools.pdfmerger

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

data class MergeResult(
    val outputPath: String,
    val totalPages: Int,
    val fileCount: Int,
    val outputSize: Long
)

class PdfMergerEngine {

    fun merge(
        context: Context,
        inputPaths: List<String>,
        outputPath: String,
        isPro: Boolean = false,
        onProgress: (progress: Int, currentFile: Int, totalFiles: Int) -> Unit
    ): MergeResult {
        if (inputPaths.size < 2) {
            throw IllegalArgumentException("At least 2 PDF files are required for merging")
        }

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()

        val pdfDocument = PdfDocument()
        var totalPageCount = 0
        val fileCount = inputPaths.size

        try {
            for ((fileIndex, inputPath) in inputPaths.withIndex()) {
                val inputFile = resolveInputFile(context, inputPath)
                if (!inputFile.exists()) {
                    throw IllegalArgumentException("Input file not found: $inputPath")
                }

                val fileDescriptor = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
                val pdfRenderer = PdfRenderer(fileDescriptor)
                val pageCount = pdfRenderer.pageCount

                if (pageCount == 0) {
                    pdfRenderer.close()
                    fileDescriptor.close()
                    continue
                }

                for (pageIndex in 0 until pageCount) {
                    val page = pdfRenderer.openPage(pageIndex)

                    // Render at original size for quality
                    val width = page.width
                    val height = page.height

                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                    page.close()

                    // Draw watermark for free users
                    if (!isPro) {
                        drawWatermark(bitmap)
                    }

                    // Create PDF page
                    totalPageCount++
                    val pageInfo = PdfDocument.PageInfo.Builder(width, height, totalPageCount).create()
                    val pdfPage = pdfDocument.startPage(pageInfo)

                    val canvas = pdfPage.canvas
                    canvas.drawBitmap(bitmap, 0f, 0f, null)

                    pdfDocument.finishPage(pdfPage)
                    bitmap.recycle()
                }

                pdfRenderer.close()
                fileDescriptor.close()

                // Report progress per file
                val progress = ((fileIndex + 1) * 100) / fileCount
                onProgress(progress, fileIndex + 1, fileCount)
            }

            if (totalPageCount == 0) {
                throw IllegalArgumentException("No pages found in the provided PDF files")
            }

            // Write output PDF
            FileOutputStream(outputFile).use { output ->
                pdfDocument.writeTo(output)
            }

        } catch (e: Exception) {
            // Clean up partial file on failure
            if (outputFile.exists()) {
                outputFile.delete()
            }
            throw e
        } finally {
            pdfDocument.close()
        }

        return MergeResult(
            outputPath = outputFile.absolutePath,
            totalPages = totalPageCount,
            fileCount = fileCount,
            outputSize = outputFile.length()
        )
    }

    fun getPageCount(context: Context, inputPath: String): Int {
        return try {
            val inputFile = resolveInputFile(context, inputPath)
            if (!inputFile.exists()) return 0

            val fileDescriptor = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
            val pdfRenderer = PdfRenderer(fileDescriptor)
            val pageCount = pdfRenderer.pageCount
            pdfRenderer.close()
            fileDescriptor.close()
            pageCount
        } catch (e: Exception) {
            0
        }
    }

    private fun resolveInputFile(context: Context, inputPath: String): File {
        if (inputPath.startsWith("content://")) {
            val uri = android.net.Uri.parse(inputPath)
            val cacheFile = File(context.cacheDir, "merge_input_${System.currentTimeMillis()}_${inputPath.hashCode()}.pdf")

            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(cacheFile).use { output ->
                    input.copyTo(output)
                }
            } ?: throw IllegalArgumentException("Cannot open content URI: $inputPath")

            return cacheFile
        }

        val path = if (inputPath.startsWith("file://")) {
            inputPath.removePrefix("file://")
        } else {
            inputPath
        }

        return File(path)
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

        val watermarkText = "PDF Smart Tools - Free Version"

        canvas.save()
        val centerX = bitmap.width / 2f
        val centerY = bitmap.height / 2f
        canvas.translate(centerX, centerY)
        canvas.rotate(-30f)
        canvas.drawText(watermarkText, 0f, 0f, paint)
        canvas.restore()
    }
}
