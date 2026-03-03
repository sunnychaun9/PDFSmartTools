package com.pdfsmarttools.pdfpagemanager

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Thin React Native bridge for PDF page management.
 * All processing logic is in PdfPageManagerEngine.
 */
class PdfPageManagerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val isCancelled = AtomicBoolean(false)
    private val engine = PdfPageManagerEngine()

    override fun getName(): String = "PdfPageManager"

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
        sendEvent("PdfPageManagerProgress", params)
    }

    @ReactMethod
    fun getPageInfo(inputPath: String, promise: Promise) {
        scope.launch {
            try {
                val info = engine.getPageInfo(inputPath)

                val pages = Arguments.createArray()
                for (page in info.pages) {
                    val pageMap = Arguments.createMap().apply {
                        putInt("index", page.index)
                        putInt("width", page.width)
                        putInt("height", page.height)
                    }
                    pages.pushMap(pageMap)
                }

                val result = Arguments.createMap().apply {
                    putInt("pageCount", info.pageCount)
                    putArray("pages", pages)
                    putDouble("fileSize", info.fileSize.toDouble())
                }
                promise.resolve(result)
            } catch (e: SecurityException) {
                promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", "Failed to read PDF file")
            }
        }
    }

    @ReactMethod
    fun generateThumbnails(inputPath: String, outputDir: String, maxWidth: Int, promise: Promise) {
        isCancelled.set(false)

        scope.launch {
            try {
                val result = engine.generateThumbnails(
                    inputPath = inputPath,
                    outputDir = outputDir,
                    maxWidth = maxWidth,
                    isCancelled = { isCancelled.get() },
                    onProgress = { progress, status -> sendProgressEvent(progress, status) }
                )

                val thumbnails = Arguments.createArray()
                for (thumb in result.thumbnails) {
                    val thumbMap = Arguments.createMap().apply {
                        putInt("index", thumb.index)
                        putString("path", thumb.path)
                        putInt("width", thumb.width)
                        putInt("height", thumb.height)
                        putInt("originalWidth", thumb.originalWidth)
                        putInt("originalHeight", thumb.originalHeight)
                    }
                    thumbnails.pushMap(thumbMap)
                }

                val response = Arguments.createMap().apply {
                    putInt("pageCount", result.pageCount)
                    putArray("thumbnails", thumbnails)
                }
                promise.resolve(response)
            } catch (e: PdfPageManagerEngine.CancellationException) {
                promise.reject("CANCELLED", "Operation cancelled")
            } catch (e: SecurityException) {
                promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
            } catch (e: OutOfMemoryError) {
                System.gc()
                promise.reject("OUT_OF_MEMORY", "Not enough memory to generate thumbnails")
            } catch (e: Exception) {
                promise.reject("THUMBNAIL_ERROR", "Failed to generate thumbnails")
            }
        }
    }

    @ReactMethod
    fun applyPageChanges(
        inputPath: String,
        outputPath: String,
        operations: ReadableArray,
        isPro: Boolean,
        promise: Promise
    ) {
        isCancelled.set(false)

        scope.launch {
            try {
                val pageOps = mutableListOf<PdfPageManagerEngine.PageOperation>()
                for (i in 0 until operations.size()) {
                    val op = operations.getMap(i) ?: continue
                    val originalIndex = op.getInt("originalIndex")
                    val rotation = if (op.hasKey("rotation")) op.getInt("rotation") else 0
                    pageOps.add(PdfPageManagerEngine.PageOperation(originalIndex, rotation))
                }

                val result = engine.applyPageChanges(
                    inputPath = inputPath,
                    outputPath = outputPath,
                    operations = pageOps,
                    isPro = isPro,
                    isCancelled = { isCancelled.get() },
                    onProgress = { progress, status -> sendProgressEvent(progress, status) }
                )

                val response = Arguments.createMap().apply {
                    putString("outputPath", result.outputPath)
                    putInt("pageCount", result.pageCount)
                    putDouble("fileSize", result.fileSize.toDouble())
                    putBoolean("success", true)
                }
                promise.resolve(response)
            } catch (e: PdfPageManagerEngine.CancellationException) {
                promise.reject("CANCELLED", "Operation cancelled")
            } catch (e: SecurityException) {
                if (e.message?.contains("Free users") == true) {
                    promise.reject("PRO_REQUIRED", e.message)
                } else {
                    promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
                }
            } catch (e: OutOfMemoryError) {
                System.gc()
                promise.reject("OUT_OF_MEMORY", "Not enough memory to process this PDF")
            } catch (e: Exception) {
                promise.reject("PROCESS_ERROR", "Failed to process PDF pages")
            } finally {
                System.gc()
            }
        }
    }

    @ReactMethod
    fun cancelOperation(promise: Promise) {
        isCancelled.set(true)
        promise.resolve(true)
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
