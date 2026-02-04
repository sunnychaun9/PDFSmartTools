package com.pdfsmarttools.preflight

import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import java.io.File

/**
 * Native module for PDF pre-flight checks.
 * Validates PDF files before heavy processing to prevent OOM and crashes.
 *
 * Checks:
 * - Page count
 * - Page dimensions (to estimate memory)
 * - File size
 * - Encryption status
 * - Estimated memory requirement
 */
class PdfPreflightModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        // Memory estimation constants
        private const val BYTES_PER_PIXEL_RGB565 = 2 // RGB_565 format
        private const val BYTES_PER_PIXEL_ARGB8888 = 4 // ARGB_8888 format

        // Thresholds
        private const val WARNING_PAGE_COUNT = 50
        private const val HIGH_WARNING_PAGE_COUNT = 100
        private const val ABORT_RECOMMENDATION_PAGE_COUNT = 500

        private const val WARNING_MEMORY_MB = 100
        private const val HIGH_WARNING_MEMORY_MB = 200
        private const val ABORT_RECOMMENDATION_MEMORY_MB = 500

        // Max bitmap size for safe processing
        private const val MAX_SAFE_BITMAP_PIXELS = 50_000_000L
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "PdfPreflight"

    /**
     * Analyze a PDF file and return detailed information for pre-flight checks.
     *
     * @param inputPath Path to the PDF file
     * @param promise React Native promise
     */
    @ReactMethod
    fun analyzePdf(inputPath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(inputPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                val fileSize = file.length()
                var pageCount = 0
                var maxPageWidth = 0
                var maxPageHeight = 0
                var totalPixels = 0L
                var isEncrypted = false
                var hasLargePages = false

                // Open PDF and analyze
                try {
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                        PdfRenderer(fd).use { renderer ->
                            pageCount = renderer.pageCount

                            // Analyze each page dimensions (quick operation)
                            for (i in 0 until minOf(pageCount, 100)) { // Sample first 100 pages
                                renderer.openPage(i).use { page ->
                                    val width = page.width
                                    val height = page.height

                                    maxPageWidth = maxOf(maxPageWidth, width)
                                    maxPageHeight = maxOf(maxPageHeight, height)

                                    val pagePixels = width.toLong() * height.toLong()
                                    totalPixels += pagePixels

                                    if (pagePixels > MAX_SAFE_BITMAP_PIXELS) {
                                        hasLargePages = true
                                    }
                                }
                            }

                            // If more than 100 pages, estimate remaining
                            if (pageCount > 100) {
                                val avgPixelsPerPage = totalPixels / 100
                                totalPixels = avgPixelsPerPage * pageCount
                            }
                        }
                    }
                } catch (e: SecurityException) {
                    isEncrypted = true
                }

                // Calculate memory estimates
                val estimatedMemoryRGB565 = (totalPixels * BYTES_PER_PIXEL_RGB565) / (1024 * 1024) // MB
                val estimatedMemoryARGB8888 = (totalPixels * BYTES_PER_PIXEL_ARGB8888) / (1024 * 1024) // MB

                // Use RGB565 estimate as that's what we use
                val estimatedMemoryMB = estimatedMemoryRGB565

                // Determine severity level
                val severity = when {
                    pageCount >= ABORT_RECOMMENDATION_PAGE_COUNT || estimatedMemoryMB >= ABORT_RECOMMENDATION_MEMORY_MB -> "critical"
                    pageCount >= HIGH_WARNING_PAGE_COUNT || estimatedMemoryMB >= HIGH_WARNING_MEMORY_MB -> "high"
                    pageCount >= WARNING_PAGE_COUNT || estimatedMemoryMB >= WARNING_MEMORY_MB -> "warning"
                    else -> "ok"
                }

                // Generate warning message
                val warningMessage = when (severity) {
                    "critical" -> "This PDF has $pageCount pages and may require ~${estimatedMemoryMB}MB of memory. Processing is likely to fail or be very slow. Consider splitting the PDF first."
                    "high" -> "This PDF has $pageCount pages and may require ~${estimatedMemoryMB}MB of memory. Processing may be slow and could fail on devices with limited memory."
                    "warning" -> "This PDF has $pageCount pages. Processing may take some time."
                    else -> null
                }

                // Generate recommendations
                val recommendations = Arguments.createArray()
                if (severity == "critical" || severity == "high") {
                    recommendations.pushString("Consider splitting the PDF into smaller parts")
                    recommendations.pushString("Close other apps to free memory")
                    recommendations.pushString("Ensure device has sufficient storage")
                }
                if (hasLargePages) {
                    recommendations.pushString("Some pages have very large dimensions and will be downscaled")
                }
                if (isEncrypted) {
                    recommendations.pushString("This PDF is password protected - unlock it first")
                }

                // Build response
                val result = Arguments.createMap().apply {
                    putInt("pageCount", pageCount)
                    putDouble("fileSize", fileSize.toDouble())
                    putInt("maxPageWidth", maxPageWidth)
                    putInt("maxPageHeight", maxPageHeight)
                    putDouble("estimatedMemoryMB", estimatedMemoryMB.toDouble())
                    putBoolean("isEncrypted", isEncrypted)
                    putBoolean("hasLargePages", hasLargePages)
                    putString("severity", severity)
                    putString("warningMessage", warningMessage)
                    putArray("recommendations", recommendations)
                    putBoolean("canProcess", severity != "critical" || !isEncrypted)
                    putBoolean("shouldWarn", severity != "ok")
                }

                promise.resolve(result)

            } catch (e: OutOfMemoryError) {
                // Even analysis ran out of memory - this is a very large PDF
                val result = Arguments.createMap().apply {
                    putInt("pageCount", -1)
                    putDouble("fileSize", File(inputPath).length().toDouble())
                    putString("severity", "critical")
                    putString("warningMessage", "This PDF is too large to analyze. It will likely fail to process.")
                    putBoolean("canProcess", false)
                    putBoolean("shouldWarn", true)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                // Generic error - still provide what info we can
                promise.reject("ANALYSIS_FAILED", "Failed to analyze PDF")
            }
        }
    }

    /**
     * Quick check if a PDF can be opened (not encrypted/corrupted)
     */
    @ReactMethod
    fun canOpenPdf(inputPath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(inputPath)
                if (!file.exists()) {
                    promise.resolve(Arguments.createMap().apply {
                        putBoolean("canOpen", false)
                        putString("reason", "File not found")
                    })
                    return@launch
                }

                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { renderer ->
                        promise.resolve(Arguments.createMap().apply {
                            putBoolean("canOpen", true)
                            putInt("pageCount", renderer.pageCount)
                        })
                    }
                }
            } catch (e: SecurityException) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("canOpen", false)
                    putString("reason", "PDF is password protected or corrupted")
                })
            } catch (e: Exception) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("canOpen", false)
                    putString("reason", "PDF file is invalid or corrupted")
                })
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN compatibility
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN compatibility
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }
}
