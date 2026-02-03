package com.pdfsmarttools.pdfmerger

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.File
import java.io.FileOutputStream

data class MergeResult(
    val outputPath: String,
    val totalPages: Int,
    val fileCount: Int,
    val outputSize: Long
)

class PdfMergerEngine {

    companion object {
        private const val TAG = "PdfMergerEngine"
        // Maximum bitmap size in pixels to prevent OOM
        private const val MAX_BITMAP_PIXELS = 50_000_000L
        // Batch size for processing to allow GC
        private const val PAGE_BATCH_SIZE = 5
    }

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

                    // Calculate dimensions with memory limits
                    var width = page.width
                    var height = page.height

                    // Check if bitmap would be too large and reduce if necessary
                    val pixelCount = width.toLong() * height.toLong()
                    if (pixelCount > MAX_BITMAP_PIXELS) {
                        val reductionFactor = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                        width = (width * reductionFactor).toInt()
                        height = (height * reductionFactor).toInt()
                        Log.d(TAG, "File $fileIndex, Page $pageIndex: Reduced dimensions to ${width}x${height}")
                    }

                    // Use RGB_565 (2 bytes/pixel) instead of ARGB_8888 (4 bytes/pixel)
                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)

                    val originalWidth = page.width
                    val originalHeight = page.height
                    page.close()

                    // Draw watermark for free users
                    if (!isPro) {
                        drawWatermark(bitmap)
                    }

                    // Create PDF page with original dimensions
                    totalPageCount++
                    val pageInfo = PdfDocument.PageInfo.Builder(originalWidth, originalHeight, totalPageCount).create()
                    val pdfPage = pdfDocument.startPage(pageInfo)

                    val canvas = pdfPage.canvas
                    // Scale bitmap to original page dimensions if reduced
                    if (width != originalWidth || height != originalHeight) {
                        val destRect = android.graphics.Rect(0, 0, originalWidth, originalHeight)
                        val paint = Paint().apply {
                            isFilterBitmap = true
                            isDither = true
                        }
                        canvas.drawBitmap(bitmap, null, destRect, paint)
                    } else {
                        canvas.drawBitmap(bitmap, 0f, 0f, null)
                    }

                    pdfDocument.finishPage(pdfPage)

                    // Immediately recycle bitmap to free memory
                    bitmap.recycle()

                    // Trigger GC periodically to prevent memory buildup
                    if (totalPageCount % PAGE_BATCH_SIZE == 0) {
                        System.gc()
                    }
                }

                pdfRenderer.close()
                fileDescriptor.close()

                // Force GC after each file to free resources
                System.gc()

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
            // Final cleanup
            System.gc()
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
                    // Use buffered copy for better memory efficiency with large files
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                    output.flush()
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
