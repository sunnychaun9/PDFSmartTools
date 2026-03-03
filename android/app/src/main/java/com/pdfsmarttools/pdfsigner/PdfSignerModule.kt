package com.pdfsmarttools.pdfsigner

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

/**
 * Thin React Native bridge for PDF signing.
 * All processing logic is in PdfSignerEngine.
 */
class PdfSignerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfSignerEngine()

    override fun getName(): String = "PdfSigner"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun sendProgressEvent(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        sendEvent("PdfSigningProgress", params)
    }

    @ReactMethod
    fun signPdf(
        inputPath: String,
        outputPath: String,
        signatureBase64: String,
        pageNumber: Int,
        positionX: Float,
        positionY: Float,
        signatureWidth: Float,
        signatureHeight: Float,
        addWatermark: Boolean,
        promise: Promise
    ) {
        scope.launch {
            try {
                val options = PdfSignerEngine.SigningOptions(
                    inputPath = inputPath,
                    outputPath = outputPath,
                    signatureBase64 = signatureBase64,
                    pageNumber = pageNumber,
                    positionX = positionX,
                    positionY = positionY,
                    signatureWidth = signatureWidth,
                    signatureHeight = signatureHeight,
                    addWatermark = addWatermark
                )

                val result = engine.signPdf(reactContext, options) { progress, status ->
                    sendProgressEvent(progress, status)
                }

                val response = Arguments.createMap().apply {
                    putString("outputPath", result.outputPath)
                    putInt("pageCount", result.pageCount)
                    putInt("signedPage", result.signedPage)
                    putDouble("fileSize", result.fileSize.toDouble())
                }

                promise.resolve(response)

            } catch (e: Exception) {
                // Clean up partial file on failure
                try {
                    java.io.File(outputPath).delete()
                } catch (_: Exception) {}

                promise.reject("SIGNING_ERROR", e.message ?: "Unknown error during PDF signing", e)
            }
        }
    }

    @ReactMethod
    fun getPdfPageCount(pdfPath: String, promise: Promise) {
        scope.launch {
            try {
                val count = engine.getPageCount(reactContext, pdfPath)
                promise.resolve(count)
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message ?: "Failed to read PDF", e)
            }
        }
    }

    @ReactMethod
    fun getPdfPageDimensions(pdfPath: String, pageNumber: Int, promise: Promise) {
        scope.launch {
            try {
                val (width, height) = engine.getPageDimensions(reactContext, pdfPath, pageNumber)
                val result = Arguments.createMap().apply {
                    putInt("width", width)
                    putInt("height", height)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message ?: "Failed to read PDF dimensions", e)
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
