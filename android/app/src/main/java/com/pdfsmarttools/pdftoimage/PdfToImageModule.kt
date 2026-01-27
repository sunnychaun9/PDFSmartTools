package com.pdfsmarttools.pdftoimage

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream

class PdfToImageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "PdfToImage"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Get the total number of pages in a PDF
     */
    @ReactMethod
    fun getPageCount(inputPath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(inputPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found: $inputPath")
                    return@launch
                }

                val parcelFileDescriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val pdfRenderer = PdfRenderer(parcelFileDescriptor)
                val pageCount = pdfRenderer.pageCount

                pdfRenderer.close()
                parcelFileDescriptor.close()

                promise.resolve(pageCount)
            } catch (e: SecurityException) {
                promise.reject("PDF_ENCRYPTED", "This PDF is password protected and cannot be opened", e)
            } catch (e: Exception) {
                promise.reject("PAGE_COUNT_ERROR", e.message ?: "Failed to get page count", e)
            }
        }
    }

    /**
     * Convert PDF pages to images
     *
     * @param inputPath Path to the PDF file
     * @param outputDir Directory to save images
     * @param format Image format: "png" or "jpg"
     * @param pageIndices Array of page indices to convert (0-based). Empty array means all pages.
     * @param quality Quality setting for JPEG (0-100). Ignored for PNG.
     * @param maxResolution Max resolution in pixels (width or height, whichever is larger)
     * @param isPro Whether the user is a Pro subscriber
     * @param promise React Native promise
     */
    @ReactMethod
    fun convertToImages(
        inputPath: String,
        outputDir: String,
        format: String,
        pageIndices: ReadableArray,
        quality: Int,
        maxResolution: Int,
        isPro: Boolean,
        promise: Promise
    ) {
        scope.launch {
            var pdfRenderer: PdfRenderer? = null
            var parcelFileDescriptor: ParcelFileDescriptor? = null

            try {
                val file = File(inputPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found: $inputPath")
                    return@launch
                }

                // Create output directory if it doesn't exist
                val outputDirectory = File(outputDir)
                if (!outputDirectory.exists()) {
                    outputDirectory.mkdirs()
                }

                parcelFileDescriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                pdfRenderer = PdfRenderer(parcelFileDescriptor)

                val totalPages = pdfRenderer.pageCount
                val baseName = file.nameWithoutExtension

                // Determine which pages to convert
                val pagesToConvert = if (pageIndices.size() == 0) {
                    // Convert all pages
                    (0 until totalPages).toList()
                } else {
                    // Convert specified pages
                    (0 until pageIndices.size()).map { pageIndices.getInt(it) }
                        .filter { it in 0 until totalPages }
                }

                // Pro gating: Free users can only convert 1 page
                val actualPagesToConvert = if (!isPro && pagesToConvert.size > 1) {
                    listOf(pagesToConvert.first())
                } else {
                    pagesToConvert
                }

                // Resolution limits: Free users get max 1024px, Pro users get up to 300 DPI equivalent
                val effectiveMaxResolution = if (!isPro) {
                    minOf(maxResolution, 1024)
                } else {
                    maxResolution
                }

                val outputPaths = mutableListOf<String>()
                val imageFormat = format.lowercase()
                val compressFormat = if (imageFormat == "png") Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
                val extension = if (imageFormat == "png") "png" else "jpg"
                val effectiveQuality = if (imageFormat == "png") 100 else quality

                for ((index, pageIndex) in actualPagesToConvert.withIndex()) {
                    // Send progress event
                    val progressParams = Arguments.createMap().apply {
                        putInt("currentPage", index + 1)
                        putInt("totalPages", actualPagesToConvert.size)
                        putInt("progress", ((index + 1) * 100) / actualPagesToConvert.size)
                        putInt("pageIndex", pageIndex)
                    }
                    sendEvent("PdfToImageProgress", progressParams)

                    val page = pdfRenderer.openPage(pageIndex)

                    // Calculate dimensions maintaining aspect ratio
                    val originalWidth = page.width
                    val originalHeight = page.height
                    val scale = calculateScale(originalWidth, originalHeight, effectiveMaxResolution)
                    val scaledWidth = (originalWidth * scale).toInt()
                    val scaledHeight = (originalHeight * scale).toInt()

                    // Create bitmap and render page
                    val bitmap = Bitmap.createBitmap(scaledWidth, scaledHeight, Bitmap.Config.ARGB_8888)

                    // Fill with white background for JPEG (since JPEG doesn't support transparency)
                    if (imageFormat != "png") {
                        bitmap.eraseColor(android.graphics.Color.WHITE)
                    }

                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    // Save bitmap to file
                    val outputFileName = "${baseName}_page_${pageIndex + 1}.$extension"
                    val outputFile = File(outputDirectory, outputFileName)

                    FileOutputStream(outputFile).use { out ->
                        bitmap.compress(compressFormat, effectiveQuality, out)
                    }

                    bitmap.recycle()
                    outputPaths.add(outputFile.absolutePath)
                }

                // Build response
                val response = Arguments.createMap().apply {
                    putArray("outputPaths", Arguments.fromList(outputPaths))
                    putInt("pageCount", actualPagesToConvert.size)
                    putInt("totalPdfPages", totalPages)
                    putString("format", extension)
                    putInt("resolution", effectiveMaxResolution)
                    putBoolean("wasLimited", !isPro && pagesToConvert.size > 1)
                }

                promise.resolve(response)

            } catch (e: SecurityException) {
                promise.reject("PDF_ENCRYPTED", "This PDF is password protected and cannot be opened", e)
            } catch (e: OutOfMemoryError) {
                promise.reject("OUT_OF_MEMORY", "Not enough memory to process this PDF. Try a lower resolution.", e)
            } catch (e: Exception) {
                promise.reject("CONVERSION_ERROR", e.message ?: "Unknown error during conversion", e)
            } finally {
                try {
                    pdfRenderer?.close()
                    parcelFileDescriptor?.close()
                } catch (e: Exception) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    /**
     * Calculate scale factor to fit within max resolution while maintaining aspect ratio
     */
    private fun calculateScale(width: Int, height: Int, maxResolution: Int): Float {
        val maxDimension = maxOf(width, height)
        return if (maxDimension > maxResolution) {
            maxResolution.toFloat() / maxDimension.toFloat()
        } else {
            // For higher resolution (Pro users), scale up if needed
            // Default PDF rendering is 72 DPI, scale up to achieve higher DPI
            val scaleFactor = maxResolution.toFloat() / maxDimension.toFloat()
            minOf(scaleFactor, 4.0f) // Cap at 4x to prevent memory issues
        }
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
