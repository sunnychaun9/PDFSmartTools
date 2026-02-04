package com.pdfsmarttools.pdfocr

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * React Native Native Module for PDF OCR
 * Converts scanned PDFs to searchable PDFs with text layer
 */
class PdfOcrModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var ocrEngine: PdfOcrEngine? = null
    private val isProcessing = AtomicBoolean(false)
    private val isCancelled = AtomicBoolean(false)

    override fun getName(): String = "PdfOcr"

    /**
     * Send event to React Native
     */
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Send progress event
     */
    private fun sendProgressEvent(progress: Int, currentPage: Int, totalPages: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putInt("currentPage", currentPage)
            putInt("totalPages", totalPages)
            putString("status", status)
        }
        sendEvent("PdfOcrProgress", params)
    }

    /**
     * Process a scanned PDF and create a searchable PDF with invisible text layer
     *
     * @param inputPath Path to the input PDF file (can be file:// or content:// URI)
     * @param outputPath Path where the searchable PDF will be saved
     * @param isPro Whether the user has Pro subscription (affects watermark)
     * @param promise Promise to resolve/reject with result
     */
    @ReactMethod
    fun processToSearchablePdf(inputPath: String, outputPath: String?, isPro: Boolean, promise: Promise) {
        if (isProcessing.getAndSet(true)) {
            promise.reject("OCR_BUSY", "Another OCR operation is already in progress")
            return
        }

        isCancelled.set(false)

        scope.launch {
            try {
                // Validate input
                if (inputPath.isBlank()) {
                    throw IllegalArgumentException("Input path cannot be empty")
                }

                // Generate output path if not provided
                val finalOutputPath = outputPath ?: generateOutputPath(inputPath)

                // Initialize engine
                if (ocrEngine == null) {
                    ocrEngine = PdfOcrEngine(reactContext)
                }

                val engine = ocrEngine!!

                // Process PDF with progress callback
                val result = engine.processToSearchablePdf(
                    inputPath = inputPath,
                    outputPath = finalOutputPath,
                    isPro = isPro,
                    progressCallback = object : PdfOcrEngine.ProgressCallback {
                        override fun onProgress(
                            progress: Int,
                            currentPage: Int,
                            totalPages: Int,
                            status: String
                        ) {
                            if (!isCancelled.get()) {
                                sendProgressEvent(progress, currentPage, totalPages, status)
                            }
                        }
                    }
                )

                // Check if cancelled
                if (isCancelled.get()) {
                    // Clean up partial output
                    File(finalOutputPath).delete()
                    promise.reject("OCR_CANCELLED", "OCR operation was cancelled")
                    return@launch
                }

                // Build response
                val response = Arguments.createMap().apply {
                    putString("outputPath", result.outputPath)
                    putInt("pageCount", result.pageCount)
                    putInt("totalCharacters", result.totalCharacters)
                    putInt("totalWords", result.totalWords)
                    putDouble("averageConfidence", result.averageConfidence.toDouble())
                    putDouble("processingTimeMs", result.processingTimeMs.toDouble())
                    putBoolean("success", true)
                }

                promise.resolve(response)

            } catch (e: OutOfMemoryError) {
                // Handle OOM gracefully
                System.gc()
                promise.reject(
                    "OCR_OUT_OF_MEMORY",
                    "Not enough memory to process this PDF. Try a smaller file or close other apps.",
                    e
                )
            } catch (e: SecurityException) {
                // FIX: Post-audit hardening – graceful permission revocation handling
                promise.reject(
                    "OCR_PERMISSION_DENIED",
                    "Storage permission was revoked. Please grant permission and try again."
                )
            } catch (e: IllegalArgumentException) {
                // FIX: Post-audit hardening – sanitize error messages
                promise.reject(
                    "OCR_INVALID_INPUT",
                    "Invalid input provided"
                )
            } catch (e: Exception) {
                // FIX: Post-audit hardening – never expose raw exception messages
                promise.reject(
                    "OCR_ERROR",
                    "Failed to process PDF for text recognition"
                )
            } finally {
                isProcessing.set(false)
            }
        }
    }

    /**
     * Cancel ongoing OCR operation
     */
    @ReactMethod
    fun cancelProcessing(promise: Promise) {
        if (isProcessing.get()) {
            isCancelled.set(true)
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    /**
     * Check if OCR is currently processing
     */
    @ReactMethod
    fun isProcessing(promise: Promise) {
        promise.resolve(isProcessing.get())
    }

    /**
     * Get supported features and capabilities
     */
    @ReactMethod
    fun getCapabilities(promise: Promise) {
        val capabilities = Arguments.createMap().apply {
            putBoolean("supportsSearchablePdf", true)
            putBoolean("supportsProgress", true)
            putBoolean("supportsCancellation", true)
            putInt("maxRecommendedPages", 50)
            putString("language", "latin")
            putBoolean("onDevice", true)
        }
        promise.resolve(capabilities)
    }

    /**
     * Generate output path based on input path
     */
    private fun generateOutputPath(inputPath: String): String {
        val cacheDir = reactContext.cacheDir
        val timestamp = System.currentTimeMillis()

        // Extract original filename if possible
        val originalName = when {
            inputPath.startsWith("content://") -> "document"
            else -> {
                val file = File(inputPath.removePrefix("file://"))
                file.nameWithoutExtension
            }
        }

        return File(cacheDir, "${originalName}_searchable_$timestamp.pdf").absolutePath
    }

    /**
     * Required for React Native event emitter
     */
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep track of listeners if needed
    }

    /**
     * Required for React Native event emitter
     */
    @ReactMethod
    fun removeListeners(count: Int) {
        // Clean up listeners if needed
    }

    /**
     * Clean up resources when module is invalidated
     */
    override fun invalidate() {
        super.invalidate()
        scope.cancel()
        ocrEngine?.close()
        ocrEngine = null
    }
}
