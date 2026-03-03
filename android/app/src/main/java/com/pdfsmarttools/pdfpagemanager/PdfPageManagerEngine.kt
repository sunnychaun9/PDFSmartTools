package com.pdfsmarttools.pdfpagemanager

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream

/**
 * Pure engine for PDF page management operations (thumbnails, rotation, reorder, delete).
 * No React Native dependencies — all bridge logic stays in PdfPageManagerModule.
 */
class PdfPageManagerEngine {

    companion object {
        private const val TAG = "PdfPageManagerEngine"
        const val DEFAULT_THUMBNAIL_WIDTH = 200
        const val MAX_THUMBNAIL_WIDTH = 400
        const val MAX_BITMAP_PIXELS = 50_000_000L
        const val PAGE_BATCH_SIZE = 5
    }

    data class PageOperation(
        val originalIndex: Int,
        val rotation: Int = 0
    )

    data class PageInfo(
        val index: Int,
        val width: Int,
        val height: Int
    )

    data class ThumbnailInfo(
        val index: Int,
        val path: String,
        val width: Int,
        val height: Int,
        val originalWidth: Int,
        val originalHeight: Int
    )

    data class PdfInfo(
        val pageCount: Int,
        val pages: List<PageInfo>,
        val fileSize: Long
    )

    data class ThumbnailResult(
        val pageCount: Int,
        val thumbnails: List<ThumbnailInfo>
    )

    data class ApplyChangesResult(
        val outputPath: String,
        val pageCount: Int,
        val fileSize: Long
    )

    /**
     * Get PDF page count and dimension info for all pages.
     */
    fun getPageInfo(inputPath: String): PdfInfo {
        val file = File(inputPath)
        if (!file.exists()) throw IllegalArgumentException("PDF file not found")

        val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(fd)

        try {
            val pages = mutableListOf<PageInfo>()
            for (i in 0 until renderer.pageCount) {
                renderer.openPage(i).use { page ->
                    pages.add(PageInfo(i, page.width, page.height))
                }
            }
            return PdfInfo(renderer.pageCount, pages, file.length())
        } finally {
            renderer.close()
            fd.close()
        }
    }

    /**
     * Generate thumbnails for all pages.
     *
     * @param inputPath Path to the PDF file
     * @param outputDir Directory to save thumbnails
     * @param maxWidth Maximum width for thumbnails
     * @param isCancelled Lambda to check if operation was cancelled
     * @param onProgress Callback: (progressPercent 0-100, statusMessage)
     * @return ThumbnailResult with paths and metadata
     */
    fun generateThumbnails(
        inputPath: String,
        outputDir: String,
        maxWidth: Int,
        isCancelled: () -> Boolean,
        onProgress: (Int, String) -> Unit
    ): ThumbnailResult {
        val file = File(inputPath)
        if (!file.exists()) throw IllegalArgumentException("PDF file not found")

        val outputDirFile = File(outputDir)
        if (!outputDirFile.exists()) outputDirFile.mkdirs()

        val thumbnailWidth = maxWidth.coerceIn(100, MAX_THUMBNAIL_WIDTH)
        onProgress(0, "Opening PDF...")

        val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(fd)

        try {
            val pageCount = renderer.pageCount
            val thumbnails = mutableListOf<ThumbnailInfo>()

            for (i in 0 until pageCount) {
                if (isCancelled()) throw CancellationException("Operation cancelled")

                renderer.openPage(i).use { page ->
                    val scale = thumbnailWidth.toFloat() / page.width.toFloat()
                    val thumbnailHeight = (page.height * scale).toInt()

                    val bitmap = Bitmap.createBitmap(thumbnailWidth, thumbnailHeight, Bitmap.Config.RGB_565)
                    try {
                        bitmap.eraseColor(Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                        val thumbnailPath = File(outputDirFile, "page_${i}.jpg").absolutePath
                        FileOutputStream(thumbnailPath).use { out ->
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
                        }

                        thumbnails.add(ThumbnailInfo(i, thumbnailPath, thumbnailWidth, thumbnailHeight, page.width, page.height))
                    } finally {
                        bitmap.recycle()
                    }

                    val progress = ((i + 1) * 100) / pageCount
                    onProgress(progress, "Generating thumbnails (${i + 1}/$pageCount)...")

                    if ((i + 1) % PAGE_BATCH_SIZE == 0) {
                        val rt = Runtime.getRuntime()
                        if (rt.totalMemory() - rt.freeMemory() > (rt.maxMemory() * 0.80).toLong()) System.gc()
                    }
                }
            }

            return ThumbnailResult(pageCount, thumbnails)
        } finally {
            renderer.close()
            fd.close()
        }
    }

    /**
     * Apply page changes (rotate, delete, reorder) and save to new PDF.
     * Uses atomic writes (temp file + rename) for safety.
     *
     * @param inputPath Source PDF path
     * @param outputPath Output PDF path
     * @param operations List of page operations (order determines new page order; absent pages are deleted)
     * @param isPro Whether user has Pro subscription
     * @param isCancelled Lambda to check if operation was cancelled
     * @param onProgress Callback: (progressPercent 0-100, statusMessage)
     * @return ApplyChangesResult with output metadata
     */
    fun applyPageChanges(
        inputPath: String,
        outputPath: String,
        operations: List<PageOperation>,
        isPro: Boolean,
        isCancelled: () -> Boolean,
        onProgress: (Int, String) -> Unit
    ): ApplyChangesResult {
        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found")
        if (operations.isEmpty()) throw IllegalArgumentException("No page operations specified")

        // Free tier limit
        if (!isPro && operations.size > 5) {
            throw SecurityException("Free users can process up to 5 pages. Upgrade to Pro for unlimited pages.")
        }

        onProgress(0, "Opening PDF...")

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        val tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")

        val fd = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(fd)

        try {
            val totalPages = renderer.pageCount

            // Validate page indices
            for (op in operations) {
                if (op.originalIndex < 0 || op.originalIndex >= totalPages) {
                    throw IllegalArgumentException("Page index ${op.originalIndex} is out of range (0-${totalPages - 1})")
                }
            }

            onProgress(10, "Processing pages...")

            val pdfDocument = PdfDocument()

            try {
                var newPageNumber = 1
                for ((index, op) in operations.withIndex()) {
                    if (isCancelled()) {
                        pdfDocument.close()
                        tempFile.delete()
                        throw CancellationException("Operation cancelled")
                    }

                    renderer.openPage(op.originalIndex).use { page ->
                        var width = page.width
                        var height = page.height
                        val originalWidth = width
                        val originalHeight = height

                        val pixelCount = width.toLong() * height.toLong()
                        if (pixelCount > MAX_BITMAP_PIXELS) {
                            val reduction = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                            width = (width * reduction).toInt()
                            height = (height * reduction).toInt()
                        }

                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                        try {
                            bitmap.eraseColor(Color.WHITE)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                            val finalBitmap = if (op.rotation != 0) rotateBitmap(bitmap, op.rotation) else bitmap

                            val (outWidth, outHeight) = if (op.rotation == 90 || op.rotation == 270) {
                                Pair(originalHeight, originalWidth)
                            } else {
                                Pair(originalWidth, originalHeight)
                            }

                            val pageInfo = PdfDocument.PageInfo.Builder(outWidth, outHeight, newPageNumber).create()
                            val pdfPage = pdfDocument.startPage(pageInfo)
                            val destRect = android.graphics.Rect(0, 0, outWidth, outHeight)
                            val paint = Paint().apply { isFilterBitmap = true; isDither = true }
                            pdfPage.canvas.drawBitmap(finalBitmap, null, destRect, paint)
                            pdfDocument.finishPage(pdfPage)

                            if (finalBitmap !== bitmap) finalBitmap.recycle()
                        } finally {
                            bitmap.recycle()
                        }

                        newPageNumber++

                        val progress = 10 + ((index + 1) * 80) / operations.size
                        onProgress(progress, "Processing page ${index + 1}/${operations.size}...")

                        if ((index + 1) % PAGE_BATCH_SIZE == 0) {
                            val rt = Runtime.getRuntime()
                            if (rt.totalMemory() - rt.freeMemory() > (rt.maxMemory() * 0.80).toLong()) System.gc()
                        }
                    }
                }

                onProgress(90, "Saving PDF...")
                FileOutputStream(tempFile).use { out ->
                    pdfDocument.writeTo(out)
                }
            } finally {
                pdfDocument.close()
            }

            // Atomic rename
            if (tempFile.exists()) {
                if (outputFile.exists()) outputFile.delete()
                val renamed = tempFile.renameTo(outputFile)
                if (!renamed) {
                    tempFile.copyTo(outputFile, overwrite = true)
                    tempFile.delete()
                }
            }

            onProgress(100, "Complete!")

            return ApplyChangesResult(
                outputPath = outputPath,
                pageCount = operations.size,
                fileSize = outputFile.length()
            )
        } finally {
            renderer.close()
            fd.close()
            // Clean up temp file if still exists (error path)
            if (tempFile.exists()) tempFile.delete()
        }
    }

    private fun rotateBitmap(source: Bitmap, degrees: Int): Bitmap {
        val matrix = Matrix()
        matrix.postRotate(degrees.toFloat())
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    class CancellationException(message: String) : Exception(message)
}
