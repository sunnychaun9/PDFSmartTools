package com.pdfsmarttools.pdfsplitter

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

class PdfSplitterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PdfSplitterModule"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfSplitterEngine()
    private var currentJob: Job? = null

    override fun getName(): String = "PdfSplitter"

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
        sendEvent("PdfSplitProgress", params)
    }

    @ReactMethod
    fun splitPdf(
        inputPath: String,
        outputDir: String,
        baseName: String,
        ranges: ReadableArray,
        isPro: Boolean,
        promise: Promise
    ) {
        currentJob = scope.launch {
            try {
                sendProgressEvent(0, "Opening PDF...")

                // Parse page ranges from JS array
                val pageRanges = mutableListOf<Pair<Int, Int>>()
                for (i in 0 until ranges.size()) {
                    val range = ranges.getString(i) ?: continue
                    val parsed = parsePageRange(range)
                    if (parsed != null) {
                        pageRanges.add(parsed)
                    }
                }

                if (pageRanges.isEmpty()) {
                    promise.reject("INVALID_RANGES", "No valid page ranges specified")
                    return@launch
                }

                sendProgressEvent(10, "Validating page ranges...")

                val result = engine.split(
                    context = reactContext,
                    inputPath = inputPath,
                    outputDir = outputDir,
                    baseName = baseName,
                    pageRanges = pageRanges,
                    isPro = isPro
                ) { progress, status ->
                    sendProgressEvent(progress, status)
                }

                sendProgressEvent(100, "Complete!")

                // Build response matching existing JS bridge shape
                val outputFilesArray = Arguments.createArray()
                for (file in result.outputFiles) {
                    val fileInfo = Arguments.createMap().apply {
                        putString("path", file.path)
                        putString("fileName", file.fileName)
                        putString("range", file.range)
                        putInt("pageCount", file.pageCount)
                        putDouble("fileSize", file.fileSize.toDouble())
                    }
                    outputFilesArray.pushMap(fileInfo)
                }

                val response = Arguments.createMap().apply {
                    putArray("outputFiles", outputFilesArray)
                    putInt("totalFilesCreated", result.totalFilesCreated)
                    putInt("sourcePageCount", result.sourcePageCount)
                }

                promise.resolve(response)
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Split operation was cancelled")
            } catch (e: IllegalArgumentException) {
                // Map specific errors to JS error codes
                val code = when {
                    e.message?.contains("not found") == true -> "FILE_NOT_FOUND"
                    e.message?.contains("Free users") == true -> "PRO_REQUIRED"
                    e.message?.contains("Invalid page range") == true -> "INVALID_RANGES"
                    else -> "SPLIT_ERROR"
                }
                promise.reject(code, e.message ?: "Unknown error during PDF splitting")
            } catch (e: SecurityException) {
                promise.reject("PDF_CORRUPTED", "PDF file is corrupted or password-protected", e)
            } catch (e: Exception) {
                promise.reject("SPLIT_ERROR", e.message ?: "Unknown error during PDF splitting", e)
            }
        }
    }

    @ReactMethod
    fun extractPage(
        inputPath: String,
        outputPath: String,
        pageNumber: Int,
        isPro: Boolean,
        promise: Promise
    ) {
        currentJob = scope.launch {
            try {
                sendProgressEvent(0, "Opening PDF...")

                val result = engine.extractPage(
                    context = reactContext,
                    inputPath = inputPath,
                    outputPath = outputPath,
                    pageNumber = pageNumber,
                    isPro = isPro
                ) { progress, status ->
                    sendProgressEvent(progress, status)
                }

                sendProgressEvent(100, "Complete!")

                val response = Arguments.createMap().apply {
                    putString("outputPath", result.outputPath)
                    putInt("pageNumber", result.pageNumber)
                    putDouble("fileSize", result.fileSize.toDouble())
                }

                promise.resolve(response)
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Extract operation was cancelled")
            } catch (e: IllegalArgumentException) {
                val code = when {
                    e.message?.contains("not found") == true -> "FILE_NOT_FOUND"
                    e.message?.contains("Free users") == true -> "PRO_REQUIRED"
                    e.message?.contains("out of range") == true -> "INVALID_PAGE"
                    else -> "EXTRACT_ERROR"
                }
                promise.reject(code, e.message ?: "Unknown error during page extraction")
            } catch (e: SecurityException) {
                promise.reject("PDF_CORRUPTED", "PDF file is corrupted or password-protected", e)
            } catch (e: Exception) {
                promise.reject("EXTRACT_ERROR", e.message ?: "Unknown error during page extraction", e)
            }
        }
    }

    @ReactMethod
    fun getPageCount(pdfPath: String, promise: Promise) {
        scope.launch {
            try {
                val pageCount = engine.getPageCount(reactContext, pdfPath)
                promise.resolve(pageCount)
            } catch (e: SecurityException) {
                promise.reject("PDF_CORRUPTED", "PDF file is corrupted or invalid", e)
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message ?: "Failed to read PDF", e)
            }
        }
    }

    @ReactMethod
    fun cancelOperation(promise: Promise) {
        currentJob?.cancel()
        currentJob = null
        promise.resolve(true)
    }

    /**
     * Parse a page range string like "1-3" or "5" into (start, end) pair.
     * Validation against totalPages happens in the engine.
     */
    private fun parsePageRange(range: String): Pair<Int, Int>? {
        return try {
            val trimmed = range.trim()
            if (trimmed.contains("-")) {
                val parts = trimmed.split("-")
                if (parts.size == 2) {
                    val start = parts[0].trim().toInt()
                    val end = parts[1].trim().toInt()
                    if (start >= 1 && end >= 1 && start <= end) {
                        Pair(start, end)
                    } else null
                } else null
            } else {
                val page = trimmed.toInt()
                if (page >= 1) {
                    Pair(page, page)
                } else null
            }
        } catch (e: NumberFormatException) {
            null
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
        currentJob?.cancel()
        scope.cancel()
    }
}
