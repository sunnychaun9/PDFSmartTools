package com.pdfsmarttools.pdfpageoperations

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pdfsmarttools.manipulate.operations.PdfPageOperationsEngine
import kotlinx.coroutines.*
import java.io.File
import java.util.UUID

/**
 * React Native bridge for PDF page operations (delete, extract, reorder, rotate).
 *
 * Uses PDFBox-based [PdfPageOperationsEngine] for quality-preserving page manipulation.
 * All operations run on Dispatchers.IO — never blocks the UI thread.
 */
class PdfPageOperationsModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PdfPageOperations"

    private companion object {
        const val TAG = "PdfPageOpsModule"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfPageOperationsEngine()

    private fun sendProgress(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PdfPageOperationsProgress", params)
    }

    private fun outputDir(): File {
        val dir = File(reactContext.cacheDir, "pdf_page_operations")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun generateOutputPath(prefix: String): String {
        return File(outputDir(), "${prefix}_${UUID.randomUUID()}.pdf").absolutePath
    }

    private fun resolveResult(result: PdfPageOperationsEngine.OperationResult, promise: Promise) {
        val map = Arguments.createMap().apply {
            putString("outputPath", result.outputPath)
            putInt("inputPageCount", result.inputPageCount)
            putInt("outputPageCount", result.outputPageCount)
            putDouble("fileSize", result.fileSize.toDouble())
            putBoolean("success", true)
        }
        promise.resolve(map)
    }

    private fun rejectError(e: Exception, promise: Promise) {
        when (e) {
            is CancellationException -> promise.reject("CANCELLED", "Operation cancelled")
            is IllegalArgumentException -> promise.reject("INVALID_INPUT", e.message)
            is SecurityException -> promise.reject("PDF_PROTECTED", e.message)
            is OutOfMemoryError -> {
                System.gc()
                promise.reject("OUT_OF_MEMORY", "Not enough memory to process this PDF")
            }
            else -> promise.reject("OPERATION_ERROR", e.message ?: "Operation failed", e)
        }
    }

    // ── Delete Pages ────────────────────────────────────────────────────────

    @ReactMethod
    fun deletePages(inputPath: String, pageIndices: ReadableArray, outputPath: String?, promise: Promise) {
        scope.launch {
            try {
                val pages = readIntArray(pageIndices)
                val outPath = outputPath ?: generateOutputPath("deleted")

                val result = engine.deletePages(
                    context = reactContext,
                    inputPath = inputPath,
                    pagesToDelete = pages,
                    outputPath = outPath,
                    onProgress = { progress, status -> sendProgress(progress, status) }
                )
                resolveResult(result, promise)
            } catch (e: Exception) {
                Log.e(TAG, "deletePages failed", e)
                rejectError(e, promise)
            }
        }
    }

    // ── Extract Pages ───────────────────────────────────────────────────────

    @ReactMethod
    fun extractPages(inputPath: String, pageIndices: ReadableArray, outputPath: String?, promise: Promise) {
        scope.launch {
            try {
                val pages = readIntArray(pageIndices)
                val outPath = outputPath ?: generateOutputPath("extracted")

                val result = engine.extractPages(
                    context = reactContext,
                    inputPath = inputPath,
                    pagesToExtract = pages,
                    outputPath = outPath,
                    onProgress = { progress, status -> sendProgress(progress, status) }
                )
                resolveResult(result, promise)
            } catch (e: Exception) {
                Log.e(TAG, "extractPages failed", e)
                rejectError(e, promise)
            }
        }
    }

    // ── Reorder Pages ───────────────────────────────────────────────────────

    @ReactMethod
    fun reorderPages(inputPath: String, newOrder: ReadableArray, outputPath: String?, promise: Promise) {
        scope.launch {
            try {
                val order = readIntArray(newOrder)
                val outPath = outputPath ?: generateOutputPath("reordered")

                val result = engine.reorderPages(
                    context = reactContext,
                    inputPath = inputPath,
                    newPageOrder = order,
                    outputPath = outPath,
                    onProgress = { progress, status -> sendProgress(progress, status) }
                )
                resolveResult(result, promise)
            } catch (e: Exception) {
                Log.e(TAG, "reorderPages failed", e)
                rejectError(e, promise)
            }
        }
    }

    // ── Rotate Pages ────────────────────────────────────────────────────────

    @ReactMethod
    fun rotatePages(inputPath: String, rotations: ReadableArray, outputPath: String?, promise: Promise) {
        scope.launch {
            try {
                val pageRotations = mutableMapOf<Int, Int>()
                for (i in 0 until rotations.size()) {
                    val entry = rotations.getMap(i) ?: continue
                    val pageIndex = entry.getInt("pageIndex")
                    val degrees = entry.getInt("degrees")
                    pageRotations[pageIndex] = degrees
                }

                val outPath = outputPath ?: generateOutputPath("rotated")

                val result = engine.rotatePages(
                    context = reactContext,
                    inputPath = inputPath,
                    pageRotations = pageRotations,
                    outputPath = outPath,
                    onProgress = { progress, status -> sendProgress(progress, status) }
                )
                resolveResult(result, promise)
            } catch (e: Exception) {
                Log.e(TAG, "rotatePages failed", e)
                rejectError(e, promise)
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun readIntArray(arr: ReadableArray): List<Int> {
        val list = mutableListOf<Int>()
        for (i in 0 until arr.size()) {
            list.add(arr.getInt(i))
        }
        return list
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
