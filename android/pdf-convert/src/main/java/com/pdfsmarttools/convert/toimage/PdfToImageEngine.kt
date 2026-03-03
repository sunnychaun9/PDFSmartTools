package com.pdfsmarttools.convert.toimage

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.pdfsmarttools.core.io.FileResolver
import com.pdfsmarttools.core.memory.BitmapPool
import com.pdfsmarttools.core.memory.MemoryBudget
import java.io.File
import java.io.FileOutputStream

data class ImageConversionResult(
    val outputPaths: List<String>,
    val pageCount: Int,
    val totalPdfPages: Int,
    val format: String,
    val resolution: Int,
    val wasLimited: Boolean
)

class PdfToImageEngine {

    companion object {
        private const val TAG = "PdfToImageEngine"
        const val MAX_BITMAP_PIXELS = 50_000_000L
        const val PAGE_BATCH_SIZE = 3
    }

    fun getPageCount(inputPath: String, fileResolver: FileResolver? = null): Int {
        val fd = if (fileResolver != null && inputPath.startsWith("content://")) {
            fileResolver.resolveToFileDescriptor(inputPath)
        } else {
            val file = File(inputPath)
            if (!file.exists()) throw IllegalArgumentException("PDF file not found: $inputPath")
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }
        val renderer = PdfRenderer(fd)
        val count = renderer.pageCount
        renderer.close(); fd.close()
        return count
    }

    fun convertToImages(
        inputPath: String,
        outputDir: String,
        format: String,
        pageIndices: List<Int>,
        quality: Int,
        maxResolution: Int,
        isPro: Boolean,
        fileResolver: FileResolver? = null,
        onProgress: (Int, Int, Int) -> Unit
    ): ImageConversionResult {
        val outputDirectory = File(outputDir)
        if (!outputDirectory.exists()) outputDirectory.mkdirs()

        val fd = if (fileResolver != null && inputPath.startsWith("content://")) {
            fileResolver.resolveToFileDescriptor(inputPath)
        } else {
            val file = File(inputPath)
            if (!file.exists()) throw IllegalArgumentException("PDF file not found: $inputPath")
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }

        val pdfRenderer = PdfRenderer(fd)
        try {
            val totalPages = pdfRenderer.pageCount
            val baseName = File(inputPath).nameWithoutExtension

            val pagesToConvert = if (pageIndices.isEmpty()) (0 until totalPages).toList()
            else pageIndices.filter { it in 0 until totalPages }

            val actualPages = if (!isPro && pagesToConvert.size > 1) listOf(pagesToConvert.first()) else pagesToConvert
            val effectiveMaxRes = if (!isPro) minOf(maxResolution, 1024) else maxResolution

            val imageFormat = format.lowercase()
            val compressFormat = if (imageFormat == "png") Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
            val extension = if (imageFormat == "png") "png" else "jpg"
            val effectiveQuality = if (imageFormat == "png") 100 else quality
            val bitmapConfig = if (imageFormat == "png") Bitmap.Config.ARGB_8888 else Bitmap.Config.RGB_565

            val outputPaths = mutableListOf<String>()
            val bitmapPool = BitmapPool(maxPoolSize = 2)

            try {
                for ((index, pageIndex) in actualPages.withIndex()) {
                    onProgress(index + 1, actualPages.size, pageIndex)
                    val page = pdfRenderer.openPage(pageIndex)
                    var scale = calculateScale(page.width, page.height, effectiveMaxRes)
                    var scaledWidth = (page.width * scale).toInt()
                    var scaledHeight = (page.height * scale).toInt()

                    val pixelCount = scaledWidth.toLong() * scaledHeight.toLong()
                    if (pixelCount > MAX_BITMAP_PIXELS) {
                        val reduction = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                        scaledWidth = (scaledWidth * reduction).toInt()
                        scaledHeight = (scaledHeight * reduction).toInt()
                    }

                    val bytesPerPixel = if (bitmapConfig == Bitmap.Config.ARGB_8888) 4 else 2
                    if (!MemoryBudget.canAllocateBitmap(scaledWidth, scaledHeight, bytesPerPixel)) {
                        scaledWidth /= 2; scaledHeight /= 2
                        if (!MemoryBudget.canAllocateBitmap(scaledWidth, scaledHeight, bytesPerPixel)) {
                            throw OutOfMemoryError("Not enough memory for page ${pageIndex + 1} bitmap")
                        }
                    }

                    val bitmap = bitmapPool.acquire(scaledWidth, scaledHeight, bitmapConfig)
                    if (imageFormat != "png") bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    val outputFile = File(outputDirectory, "${baseName}_page_${pageIndex + 1}.$extension")
                    FileOutputStream(outputFile).use { out -> bitmap.compress(compressFormat, effectiveQuality, out) }
                    bitmapPool.release(bitmap)
                    outputPaths.add(outputFile.absolutePath)

                    if ((index + 1) % PAGE_BATCH_SIZE == 0) {
                        val runtime = Runtime.getRuntime()
                        if (runtime.totalMemory() - runtime.freeMemory() > (runtime.maxMemory() * 0.80).toLong()) {
                            bitmapPool.clear(); System.gc()
                        }
                    }
                }
            } finally { bitmapPool.clear() }

            return ImageConversionResult(outputPaths, actualPages.size, totalPages, extension, effectiveMaxRes, !isPro && pagesToConvert.size > 1)
        } finally { pdfRenderer.close(); fd.close() }
    }

    private fun calculateScale(width: Int, height: Int, maxResolution: Int): Float {
        val maxDimension = maxOf(width, height)
        return if (maxDimension > maxResolution) maxResolution.toFloat() / maxDimension.toFloat()
        else minOf(maxResolution.toFloat() / maxDimension.toFloat(), 3.0f)
    }
}
