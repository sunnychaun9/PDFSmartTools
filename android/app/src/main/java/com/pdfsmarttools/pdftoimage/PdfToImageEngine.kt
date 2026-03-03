package com.pdfsmarttools.pdftoimage

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.pdfsmarttools.common.BitmapPool
import com.pdfsmarttools.common.MemoryBudget
import com.pdfsmarttools.common.PdfBoxHelper
import java.io.File
import java.io.FileOutputStream

/**
 * Pure engine for PDF-to-image conversion.
 * No React Native dependencies — all bridge logic stays in PdfToImageModule.
 */
class PdfToImageEngine {

    companion object {
        private const val TAG = "PdfToImageEngine"
        const val MAX_BITMAP_PIXELS = 50_000_000L
        const val PAGE_BATCH_SIZE = 3
    }

    data class ConversionOptions(
        val inputPath: String,
        val outputDir: String,
        val format: String,
        val pageIndices: List<Int>,
        val quality: Int,
        val maxResolution: Int,
        val isPro: Boolean
    )

    data class ConversionResult(
        val outputPaths: List<String>,
        val pageCount: Int,
        val totalPdfPages: Int,
        val format: String,
        val resolution: Int,
        val wasLimited: Boolean
    )

    /**
     * Get page count from a PDF file.
     * Accepts Context to support content:// URIs without file copy.
     */
    fun getPageCount(inputPath: String, context: Context? = null): Int {
        val fd = if (context != null && inputPath.startsWith("content://")) {
            PdfBoxHelper.resolveToFileDescriptor(context, inputPath)
        } else {
            val file = File(inputPath)
            if (!file.exists()) throw IllegalArgumentException("PDF file not found: $inputPath")
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }

        val renderer = PdfRenderer(fd)
        val count = renderer.pageCount
        renderer.close()
        fd.close()
        return count
    }

    /**
     * Convert PDF pages to images.
     *
     * @param options Conversion parameters
     * @param context Optional context for streaming content:// URI resolution
     * @param onProgress Callback: (currentPage 1-indexed, totalPages, pageIndex 0-indexed)
     * @return ConversionResult with output paths and metadata
     */
    fun convertToImages(
        options: ConversionOptions,
        context: Context? = null,
        onProgress: (Int, Int, Int) -> Unit
    ): ConversionResult {
        val outputDirectory = File(options.outputDir)
        if (!outputDirectory.exists()) outputDirectory.mkdirs()

        val inputFile = File(options.inputPath)

        // Use streaming file descriptor for content:// URIs (avoids full file copy)
        val fd = if (context != null && options.inputPath.startsWith("content://")) {
            PdfBoxHelper.resolveToFileDescriptor(context, options.inputPath)
        } else {
            if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found: ${options.inputPath}")
            ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
        }

        val pdfRenderer = PdfRenderer(fd)

        try {
            val totalPages = pdfRenderer.pageCount
            val baseName = inputFile.nameWithoutExtension

            // Determine which pages to convert
            val pagesToConvert = if (options.pageIndices.isEmpty()) {
                (0 until totalPages).toList()
            } else {
                options.pageIndices.filter { it in 0 until totalPages }
            }

            // Pro gating
            val actualPages = if (!options.isPro && pagesToConvert.size > 1) {
                listOf(pagesToConvert.first())
            } else {
                pagesToConvert
            }

            // Resolution limits
            val effectiveMaxRes = if (!options.isPro) {
                minOf(options.maxResolution, 1024)
            } else {
                options.maxResolution
            }

            val imageFormat = options.format.lowercase()
            val compressFormat = if (imageFormat == "png") Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
            val extension = if (imageFormat == "png") "png" else "jpg"
            val effectiveQuality = if (imageFormat == "png") 100 else options.quality

            val outputPaths = mutableListOf<String>()
            val bitmapConfig = if (imageFormat == "png") Bitmap.Config.ARGB_8888 else Bitmap.Config.RGB_565
            val bitmapPool = BitmapPool(maxPoolSize = 2)

            try {
                for ((index, pageIndex) in actualPages.withIndex()) {
                    onProgress(index + 1, actualPages.size, pageIndex)

                    val page = pdfRenderer.openPage(pageIndex)

                    var scale = calculateScale(page.width, page.height, effectiveMaxRes)
                    var scaledWidth = (page.width * scale).toInt()
                    var scaledHeight = (page.height * scale).toInt()

                    // Reduce if exceeding memory limits
                    val pixelCount = scaledWidth.toLong() * scaledHeight.toLong()
                    if (pixelCount > MAX_BITMAP_PIXELS) {
                        val reduction = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                        scaledWidth = (scaledWidth * reduction).toInt()
                        scaledHeight = (scaledHeight * reduction).toInt()
                        Log.d(TAG, "Page ${pageIndex + 1}: Reduced to ${scaledWidth}x${scaledHeight}")
                    }

                    // Check memory budget before allocating bitmap
                    val bytesPerPixel = if (bitmapConfig == Bitmap.Config.ARGB_8888) 4 else 2
                    if (!MemoryBudget.canAllocateBitmap(scaledWidth, scaledHeight, bytesPerPixel)) {
                        // Reduce dimensions by 50% and retry
                        scaledWidth /= 2
                        scaledHeight /= 2
                        Log.w(TAG, "Memory budget exceeded, reducing to ${scaledWidth}x${scaledHeight}")
                        if (!MemoryBudget.canAllocateBitmap(scaledWidth, scaledHeight, bytesPerPixel)) {
                            throw OutOfMemoryError("Not enough memory for page ${pageIndex + 1} bitmap")
                        }
                    }

                    // Reuse bitmap from pool when dimensions match (common for same-size pages)
                    val bitmap = bitmapPool.acquire(scaledWidth, scaledHeight, bitmapConfig)

                    if (imageFormat != "png") {
                        bitmap.eraseColor(android.graphics.Color.WHITE)
                    }

                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    val outputFile = File(outputDirectory, "${baseName}_page_${pageIndex + 1}.$extension")
                    FileOutputStream(outputFile).use { out ->
                        bitmap.compress(compressFormat, effectiveQuality, out)
                    }

                    // Return bitmap to pool instead of recycling
                    bitmapPool.release(bitmap)
                    outputPaths.add(outputFile.absolutePath)

                    // Memory pressure check every batch — only GC at 80% of maxMemory
                    if ((index + 1) % PAGE_BATCH_SIZE == 0) {
                        val runtime = Runtime.getRuntime()
                        val usedBytes = runtime.totalMemory() - runtime.freeMemory()
                        if (usedBytes > (runtime.maxMemory() * 0.80).toLong()) {
                            bitmapPool.clear()
                            System.gc()
                        }
                    }
                }
            } finally {
                bitmapPool.clear()
            }

            return ConversionResult(
                outputPaths = outputPaths,
                pageCount = actualPages.size,
                totalPdfPages = totalPages,
                format = extension,
                resolution = effectiveMaxRes,
                wasLimited = !options.isPro && pagesToConvert.size > 1
            )
        } finally {
            pdfRenderer.close()
            fd.close()
        }
    }

    /**
     * Calculate scale factor to fit within max resolution while maintaining aspect ratio.
     */
    private fun calculateScale(width: Int, height: Int, maxResolution: Int): Float {
        val maxDimension = maxOf(width, height)
        return if (maxDimension > maxResolution) {
            maxResolution.toFloat() / maxDimension.toFloat()
        } else {
            val scaleFactor = maxResolution.toFloat() / maxDimension.toFloat()
            minOf(scaleFactor, 3.0f)
        }
    }
}
