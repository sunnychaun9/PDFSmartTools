package com.pdfsmarttools.pdfsplitter

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream

class PdfSplitterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PdfSplitterModule"
        // Maximum bitmap size in pixels to prevent OOM
        private const val MAX_BITMAP_PIXELS = 50_000_000L
        // Batch size for GC
        private const val PAGE_BATCH_SIZE = 5
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "PdfSplitter"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Split PDF by extracting specified page ranges
     * @param inputPath Path to the source PDF
     * @param outputDir Directory to save split PDFs
     * @param baseName Base name for output files
     * @param ranges Array of page ranges, e.g., ["1-3", "5", "7-10"]
     * @param isPro Whether user is Pro (unlimited) or Free (first 2 pages only)
     */
    @ReactMethod
    fun splitPdf(
        inputPath: String,
        outputDir: String,
        baseName: String,
        ranges: ReadableArray,
        isPro: Boolean,
        promise: Promise
    ) {
        scope.launch {
            try {
                sendProgressEvent(0, "Opening PDF...")

                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Input PDF file not found")
                    return@launch
                }

                // Use use() extension for automatic resource cleanup
                ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY).use { fileDescriptor ->
                    PdfRenderer(fileDescriptor).use { pdfRenderer ->
                        val totalPages = pdfRenderer.pageCount

                        sendProgressEvent(10, "Validating page ranges...")

                        // Parse and validate page ranges
                        val pageRanges = mutableListOf<Pair<Int, Int>>()
                        for (i in 0 until ranges.size()) {
                            val range = ranges.getString(i) ?: continue
                            val parsed = parsePageRange(range, totalPages)
                            if (parsed != null) {
                                pageRanges.add(parsed)
                            }
                        }

                        if (pageRanges.isEmpty()) {
                            promise.reject("INVALID_RANGES", "No valid page ranges specified")
                            return@launch
                        }

                        // For free users, validate that only first 2 pages are being split
                        if (!isPro) {
                            for ((start, end) in pageRanges) {
                                if (start > 2 || end > 2) {
                                    promise.reject(
                                        "PRO_REQUIRED",
                                        "Free users can only split the first 2 pages. Upgrade to Pro for unlimited access."
                                    )
                                    return@launch
                                }
                            }
                        }

                        // Ensure output directory exists
                        val outputDirFile = File(outputDir)
                        if (!outputDirFile.exists()) {
                            outputDirFile.mkdirs()
                        }

                        sendProgressEvent(20, "Splitting PDF...")

                        val outputFiles = Arguments.createArray()
                        val totalRanges = pageRanges.size
                        var completedRanges = 0

                        for ((start, end) in pageRanges) {
                            val rangeStr = if (start == end) "$start" else "$start-$end"
                            val outputFileName = "${baseName}_pages_$rangeStr.pdf"
                            val outputFilePath = "$outputDir/$outputFileName"

                            // Create new PDF for this range
                            val pdfDocument = PdfDocument()
                            var pagesProcessed = 0

                            try {
                                for (pageNum in start..end) {
                                    pdfRenderer.openPage(pageNum - 1).use { page ->
                                        // Calculate dimensions with memory limits
                                        var width = page.width
                                        var height = page.height
                                        val originalWidth = width
                                        val originalHeight = height

                                        // Check if bitmap would be too large and reduce if necessary
                                        val pixelCount = width.toLong() * height.toLong()
                                        if (pixelCount > MAX_BITMAP_PIXELS) {
                                            val reductionFactor = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                                            width = (width * reductionFactor).toInt()
                                            height = (height * reductionFactor).toInt()
                                            Log.d(TAG, "Page $pageNum: Reduced dimensions to ${width}x${height}")
                                        }

                                        // Use RGB_565 (2 bytes/pixel) instead of ARGB_8888 (4 bytes/pixel)
                                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                                        try {
                                            bitmap.eraseColor(Color.WHITE)
                                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                                            // Create page in output document with original dimensions
                                            val pageInfo = PdfDocument.PageInfo.Builder(originalWidth, originalHeight, pageNum).create()
                                            val pdfPage = pdfDocument.startPage(pageInfo)

                                            // Scale bitmap to original dimensions if it was reduced
                                            if (width != originalWidth || height != originalHeight) {
                                                val destRect = android.graphics.Rect(0, 0, originalWidth, originalHeight)
                                                val paint = Paint().apply {
                                                    isFilterBitmap = true
                                                    isDither = true
                                                }
                                                pdfPage.canvas.drawBitmap(bitmap, null, destRect, paint)
                                            } else {
                                                pdfPage.canvas.drawBitmap(bitmap, 0f, 0f, null)
                                            }

                                            pdfDocument.finishPage(pdfPage)
                                        } finally {
                                            // Immediately recycle bitmap to free memory
                                            bitmap.recycle()
                                        }

                                        pagesProcessed++

                                        // Trigger GC periodically
                                        if (pagesProcessed % PAGE_BATCH_SIZE == 0) {
                                            System.gc()
                                        }

                                        // Update progress
                                        val pageProgress = 20 + ((completedRanges * 70 / totalRanges) +
                                                ((pageNum - start + 1) * 70 / (totalRanges * (end - start + 1))))
                                        sendProgressEvent(pageProgress.coerceAtMost(90), "Processing pages $rangeStr...")
                                    }
                                }

                                // Write output file
                                FileOutputStream(outputFilePath).use { outputStream ->
                                    pdfDocument.writeTo(outputStream)
                                }
                            } finally {
                                pdfDocument.close()
                            }

                            // Force GC after each range
                            System.gc()

                            // Add to results
                            val outputFile = File(outputFilePath)
                            val fileInfo = Arguments.createMap().apply {
                                putString("path", outputFilePath)
                                putString("fileName", outputFileName)
                                putString("range", rangeStr)
                                putInt("pageCount", end - start + 1)
                                putDouble("fileSize", outputFile.length().toDouble())
                            }
                            outputFiles.pushMap(fileInfo)

                            completedRanges++
                        }

                        sendProgressEvent(100, "Complete!")

                        val response = Arguments.createMap().apply {
                            putArray("outputFiles", outputFiles)
                            putInt("totalFilesCreated", outputFiles.size())
                            putInt("sourcePageCount", totalPages)
                        }

                        promise.resolve(response)
                    }
                }

            } catch (e: SecurityException) {
                promise.reject("PDF_CORRUPTED", "PDF file is corrupted or password-protected", e)
            } catch (e: IllegalStateException) {
                promise.reject("PDF_MALFORMED", "PDF file is malformed or cannot be read", e)
            } catch (e: Exception) {
                promise.reject("SPLIT_ERROR", e.message ?: "Unknown error during PDF splitting", e)
            } finally {
                System.gc()
            }
        }
    }

    /**
     * Extract a single page from PDF
     */
    @ReactMethod
    fun extractPage(
        inputPath: String,
        outputPath: String,
        pageNumber: Int,
        isPro: Boolean,
        promise: Promise
    ) {
        scope.launch {
            try {
                // For free users, only allow first 2 pages
                if (!isPro && pageNumber > 2) {
                    promise.reject(
                        "PRO_REQUIRED",
                        "Free users can only extract the first 2 pages. Upgrade to Pro for unlimited access."
                    )
                    return@launch
                }

                sendProgressEvent(0, "Opening PDF...")

                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Input PDF file not found")
                    return@launch
                }

                // Use use() extension for automatic resource cleanup
                ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY).use { fileDescriptor ->
                    PdfRenderer(fileDescriptor).use { pdfRenderer ->
                        if (pageNumber < 1 || pageNumber > pdfRenderer.pageCount) {
                            promise.reject("INVALID_PAGE", "Page number $pageNumber is out of range (1-${pdfRenderer.pageCount})")
                            return@launch
                        }

                        sendProgressEvent(30, "Extracting page $pageNumber...")

                        pdfRenderer.openPage(pageNumber - 1).use { page ->
                            // Calculate dimensions with memory limits
                            var width = page.width
                            var height = page.height
                            val originalWidth = width
                            val originalHeight = height

                            val pixelCount = width.toLong() * height.toLong()
                            if (pixelCount > MAX_BITMAP_PIXELS) {
                                val reductionFactor = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                                width = (width * reductionFactor).toInt()
                                height = (height * reductionFactor).toInt()
                                Log.d(TAG, "Page $pageNumber: Reduced dimensions to ${width}x${height}")
                            }

                            // Use RGB_565 for memory efficiency
                            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                            val pdfDocument = PdfDocument()

                            try {
                                bitmap.eraseColor(Color.WHITE)
                                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                                sendProgressEvent(60, "Creating PDF...")

                                val pageInfo = PdfDocument.PageInfo.Builder(originalWidth, originalHeight, 1).create()
                                val pdfPage = pdfDocument.startPage(pageInfo)

                                // Scale bitmap to original dimensions if it was reduced
                                if (width != originalWidth || height != originalHeight) {
                                    val destRect = android.graphics.Rect(0, 0, originalWidth, originalHeight)
                                    val paint = Paint().apply {
                                        isFilterBitmap = true
                                        isDither = true
                                    }
                                    pdfPage.canvas.drawBitmap(bitmap, null, destRect, paint)
                                } else {
                                    pdfPage.canvas.drawBitmap(bitmap, 0f, 0f, null)
                                }

                                pdfDocument.finishPage(pdfPage)

                                sendProgressEvent(80, "Saving...")

                                val outputFile = File(outputPath)
                                FileOutputStream(outputFile).use { outputStream ->
                                    pdfDocument.writeTo(outputStream)
                                }

                                sendProgressEvent(100, "Complete!")

                                val response = Arguments.createMap().apply {
                                    putString("outputPath", outputPath)
                                    putInt("pageNumber", pageNumber)
                                    putDouble("fileSize", outputFile.length().toDouble())
                                }

                                promise.resolve(response)
                            } finally {
                                bitmap.recycle()
                                pdfDocument.close()
                            }
                        }
                    }
                }

            } catch (e: SecurityException) {
                promise.reject("PDF_CORRUPTED", "PDF file is corrupted or password-protected", e)
            } catch (e: IllegalStateException) {
                promise.reject("PDF_MALFORMED", "PDF file is malformed or cannot be read", e)
            } catch (e: Exception) {
                promise.reject("EXTRACT_ERROR", e.message ?: "Unknown error during page extraction", e)
            } finally {
                System.gc()
            }
        }
    }

    /**
     * Get PDF page count
     */
    @ReactMethod
    fun getPageCount(pdfPath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(pdfPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                val pageCount = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fileDescriptor ->
                    PdfRenderer(fileDescriptor).use { pdfRenderer ->
                        pdfRenderer.pageCount
                    }
                }

                promise.resolve(pageCount)
            } catch (e: SecurityException) {
                promise.reject("PDF_CORRUPTED", "PDF file is corrupted or invalid", e)
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message ?: "Failed to read PDF", e)
            }
        }
    }

    /**
     * Parse a page range string like "1-3" or "5" into (start, end) pair
     * Returns null if invalid
     */
    private fun parsePageRange(range: String, totalPages: Int): Pair<Int, Int>? {
        return try {
            val trimmed = range.trim()
            if (trimmed.contains("-")) {
                val parts = trimmed.split("-")
                if (parts.size == 2) {
                    val start = parts[0].trim().toInt()
                    val end = parts[1].trim().toInt()
                    if (start in 1..totalPages && end in 1..totalPages && start <= end) {
                        Pair(start, end)
                    } else null
                } else null
            } else {
                val page = trimmed.toInt()
                if (page in 1..totalPages) {
                    Pair(page, page)
                } else null
            }
        } catch (e: NumberFormatException) {
            null
        }
    }

    private fun sendProgressEvent(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        sendEvent("PdfSplitProgress", params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }
}
