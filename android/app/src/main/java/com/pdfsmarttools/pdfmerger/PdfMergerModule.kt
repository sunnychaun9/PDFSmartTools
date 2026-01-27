package com.pdfsmarttools.pdfmerger

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

class PdfMergerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfMergerEngine()

    override fun getName(): String = "PdfMerger"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun mergePdfs(inputPaths: ReadableArray, outputPath: String, isPro: Boolean, promise: Promise) {
        scope.launch {
            try {
                val paths = mutableListOf<String>()
                for (i in 0 until inputPaths.size()) {
                    inputPaths.getString(i)?.let { paths.add(it) }
                }

                if (paths.size < 2) {
                    promise.reject("MERGE_ERROR", "At least 2 PDF files are required")
                    return@launch
                }

                val result = engine.merge(
                    context = reactContext,
                    inputPaths = paths,
                    outputPath = outputPath,
                    isPro = isPro
                ) { progress, currentFile, totalFiles ->
                    val params = Arguments.createMap().apply {
                        putInt("progress", progress)
                        putInt("currentFile", currentFile)
                        putInt("totalFiles", totalFiles)
                    }
                    sendEvent("PdfMergeProgress", params)
                }

                val response = Arguments.createMap().apply {
                    putString("outputPath", result.outputPath)
                    putInt("totalPages", result.totalPages)
                    putInt("fileCount", result.fileCount)
                    putDouble("outputSize", result.outputSize.toDouble())
                }
                promise.resolve(response)
            } catch (e: Exception) {
                promise.reject("MERGE_ERROR", e.message ?: "Unknown error during merge", e)
            }
        }
    }

    @ReactMethod
    fun getPageCount(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val pageCount = engine.getPageCount(reactContext, filePath)
                promise.resolve(pageCount)
            } catch (e: Exception) {
                promise.reject("PAGE_COUNT_ERROR", e.message ?: "Failed to get page count", e)
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
