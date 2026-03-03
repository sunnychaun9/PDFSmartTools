package com.pdfsmarttools.pdftoimage

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

/**
 * Thin React Native bridge for PDF-to-image conversion.
 * All processing logic is in PdfToImageEngine.
 */
class PdfToImageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfToImageEngine()

    override fun getName(): String = "PdfToImage"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun getPageCount(inputPath: String, promise: Promise) {
        scope.launch {
            try {
                val count = engine.getPageCount(inputPath, reactContext)
                promise.resolve(count)
            } catch (e: SecurityException) {
                promise.reject("PDF_ENCRYPTED", "This PDF is password protected and cannot be opened", e)
            } catch (e: Exception) {
                promise.reject("PAGE_COUNT_ERROR", e.message ?: "Failed to get page count", e)
            }
        }
    }

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
            try {
                val indices = (0 until pageIndices.size()).map { pageIndices.getInt(it) }

                val options = PdfToImageEngine.ConversionOptions(
                    inputPath = inputPath,
                    outputDir = outputDir,
                    format = format,
                    pageIndices = indices,
                    quality = quality,
                    maxResolution = maxResolution,
                    isPro = isPro
                )

                val result = engine.convertToImages(options, reactContext) { currentPage, totalPages, pageIndex ->
                    val params = Arguments.createMap().apply {
                        putInt("currentPage", currentPage)
                        putInt("totalPages", totalPages)
                        putInt("progress", (currentPage * 100) / totalPages)
                        putInt("pageIndex", pageIndex)
                    }
                    sendEvent("PdfToImageProgress", params)
                }

                val response = Arguments.createMap().apply {
                    putArray("outputPaths", Arguments.fromList(result.outputPaths))
                    putInt("pageCount", result.pageCount)
                    putInt("totalPdfPages", result.totalPdfPages)
                    putString("format", result.format)
                    putInt("resolution", result.resolution)
                    putBoolean("wasLimited", result.wasLimited)
                }

                promise.resolve(response)

            } catch (e: SecurityException) {
                promise.reject("PDF_ENCRYPTED", "This PDF is password protected and cannot be opened", e)
            } catch (e: OutOfMemoryError) {
                promise.reject("OUT_OF_MEMORY", "Not enough memory to process this PDF. Try a lower resolution.", e)
            } catch (e: Exception) {
                promise.reject("CONVERSION_ERROR", e.message ?: "Unknown error during conversion", e)
            } finally {
                System.gc()
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }
}
