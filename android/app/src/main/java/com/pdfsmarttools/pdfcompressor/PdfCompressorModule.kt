package com.pdfsmarttools.pdfcompressor

import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

class PdfCompressorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfCompressorEngine()

    override fun getName(): String = "PdfCompressor"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun compressPdf(inputPath: String, outputPath: String, level: String, isPro: Boolean, promise: Promise) {
        scope.launch {
            try {
                val compressionLevel = when (level.lowercase()) {
                    "low" -> CompressionLevel.LOW
                    "medium" -> CompressionLevel.MEDIUM
                    "high" -> CompressionLevel.HIGH
                    else -> CompressionLevel.MEDIUM
                }

                val result = engine.compress(
                    context = reactContext,
                    inputPath = inputPath,
                    outputPath = outputPath,
                    level = compressionLevel,
                    isPro = isPro
                ) { progress, currentPage, totalPages ->
                    val params = Arguments.createMap().apply {
                        putInt("progress", progress)
                        putInt("currentPage", currentPage)
                        putInt("totalPages", totalPages)
                    }
                    sendEvent("PdfCompressionProgress", params)
                }

                val response = Arguments.createMap().apply {
                    putString("outputPath", result.outputPath)
                    putDouble("originalSize", result.originalSize.toDouble())
                    putDouble("compressedSize", result.compressedSize.toDouble())
                    putDouble("compressionRatio", result.compressionRatio)
                    putInt("pageCount", result.pageCount)
                }
                promise.resolve(response)
            } catch (e: Exception) {
                promise.reject("COMPRESSION_ERROR", e.message ?: "Unknown error during compression", e)
            }
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

enum class CompressionLevel(val quality: Int, val dpi: Int) {
    LOW(88, 200),      // ~20-30% reduction, no visible loss
    MEDIUM(68, 150),   // ~40-55% reduction, slight loss on zoom
    HIGH(45, 100)      // ~60-75% reduction, noticeable on inspection
}

data class CompressionResult(
    val outputPath: String,
    val originalSize: Long,
    val compressedSize: Long,
    val compressionRatio: Double,
    val pageCount: Int
)
