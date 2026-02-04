package com.pdfsmarttools.pdfcompressor

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

class PdfCompressorEngine {

    companion object {
        private const val TAG = "PdfCompressorEngine"
        // Maximum bitmap size in pixels to prevent OOM (approximately 100MB for RGB_565)
        private const val MAX_BITMAP_PIXELS = 50_000_000L
        // Maximum recommended file size for processing (100MB)
        private const val MAX_RECOMMENDED_FILE_SIZE = 100L * 1024 * 1024
        // Batch size for processing to allow GC
        private const val PAGE_BATCH_SIZE = 10
    }

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

        // Warn about large files but still process them
        if (originalSize > MAX_RECOMMENDED_FILE_SIZE) {
            Log.w(TAG, "Processing large file: ${originalSize / (1024 * 1024)}MB - may take longer")
        }

        val outputFile = File(outputPath)

        // Ensure output directory exists
        outputFile.parentFile?.mkdirs()

        // Use atomic write: write to temp file first, then rename
        val tempFile = File(outputFile.parentFile, ".${outputFile.name}.tmp")

        // Create new PDF document
        val pdfDocument = PdfDocument()
        var pageCount = 0

        try {
            // Use use() extension for automatic resource cleanup
            ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY).use { fileDescriptor ->
                PdfRenderer(fileDescriptor).use { pdfRenderer ->
                    pageCount = pdfRenderer.pageCount

                    if (pageCount == 0) {
                        throw IllegalArgumentException("PDF has no pages")
                    }

                    for (i in 0 until pageCount) {
                        pdfRenderer.openPage(i).use { page ->
                            // Calculate dimensions at target DPI with memory limits
                            val scale = level.dpi / 72f
                            var width = (page.width * scale).toInt()
                            var height = (page.height * scale).toInt()
                            val originalWidth = page.width
                            val originalHeight = page.height

                            // Check if bitmap would be too large and reduce if necessary
                            val pixelCount = width.toLong() * height.toLong()
                            if (pixelCount > MAX_BITMAP_PIXELS) {
                                val reductionFactor = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                                width = (width * reductionFactor).toInt()
                                height = (height * reductionFactor).toInt()
                                Log.d(TAG, "Page $i: Reduced dimensions to ${width}x${height} to fit memory limits")
                            }

                            // Use RGB_565 (2 bytes/pixel) instead of ARGB_8888 (4 bytes/pixel)
                            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                            try {
                                bitmap.eraseColor(Color.WHITE)
                                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)

                                // Draw watermark for free users
                                if (!isPro) {
                                    drawWatermark(bitmap)
                                }

                                // Create PDF page with original dimensions (points)
                                val pageInfo = PdfDocument.PageInfo.Builder(originalWidth, originalHeight, i + 1).create()
                                val pdfPage = pdfDocument.startPage(pageInfo)

                                // Draw to PDF canvas
                                val canvas = pdfPage.canvas
                                val destRect = android.graphics.Rect(0, 0, originalWidth, originalHeight)

                                val paint = Paint().apply {
                                    isFilterBitmap = true
                                    isDither = true
                                }
                                canvas.drawBitmap(bitmap, null, destRect, paint)

                                pdfDocument.finishPage(pdfPage)
                            } finally {
                                bitmap.recycle()
                            }

                            // Report progress
                            val progress = ((i + 1) * 100) / pageCount
                            onProgress(progress, i + 1, pageCount)

                            // Trigger GC periodically to prevent memory buildup
                            if ((i + 1) % PAGE_BATCH_SIZE == 0) {
                                System.gc()
                            }
                        }
                    }
                }
            }

            // Atomic write: write to temp file first
            FileOutputStream(tempFile).use { output ->
                pdfDocument.writeTo(output)
            }

            // Atomic rename: only rename if write succeeded
            if (!tempFile.renameTo(outputFile)) {
                tempFile.copyTo(outputFile, overwrite = true)
                tempFile.delete()
            }

        } catch (e: SecurityException) {
            // PDF is corrupted or encrypted
            pdfDocument.close()
            tempFile.delete()
            outputFile.delete()
            throw IllegalArgumentException("PDF file is corrupted or password-protected", e)
        } catch (e: IllegalStateException) {
            // PdfRenderer may throw this for malformed PDFs
            pdfDocument.close()
            tempFile.delete()
            outputFile.delete()
            throw IllegalArgumentException("PDF file is malformed or cannot be read", e)
        } finally {
            pdfDocument.close()
            if (tempFile.exists()) tempFile.delete()
            System.gc()
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
        // Handle content:// URIs by copying to cache with buffered streaming
        if (inputPath.startsWith("content://")) {
            val uri = android.net.Uri.parse(inputPath)
            val cacheFile = File(context.cacheDir, "input_${System.currentTimeMillis()}.pdf")

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

        // Handle file:// URIs
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
