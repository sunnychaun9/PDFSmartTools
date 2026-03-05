package com.pdfsmarttools.batchprocessing

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pdfsmarttools.di.ModuleProvider
import com.pdfsmarttools.manipulate.batch.BatchProgressListener
import com.pdfsmarttools.manipulate.batch.BatchProgressSnapshot
import com.pdfsmarttools.manipulate.batch.BatchResult
import com.pdfsmarttools.manipulate.batch.TurboBatchPdfEngine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * React Native bridge module for batch PDF processing.
 * Exposes TurboBatchPdfEngine methods to JavaScript.
 *
 * Events emitted:
 * - BatchProgress: { jobId, totalFiles, completedFiles, failedFiles, currentFile, percentComplete, estimatedRemainingMs }
 * - BatchCompleted: { jobId, status, totalFiles, completedFiles, failedFiles, durationMs, outputPaths, errors }
 * - BatchFailed: { jobId, errorMessage }
 * - BatchCancelled: { jobId }
 */
class BatchPdfProcessingModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BatchPdfProcessing"
    }

    override fun getName(): String = "BatchPdfProcessing"

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val engine: TurboBatchPdfEngine by lazy {
        ModuleProvider.provideTurboBatchPdfEngine(reactContext.applicationContext)
    }

    private val progressListener = object : BatchProgressListener {
        override fun onBatchProgress(snapshot: BatchProgressSnapshot) {
            val params = Arguments.createMap().apply {
                putInt("totalFiles", snapshot.totalFiles)
                putInt("completedFiles", snapshot.completedFiles)
                putInt("failedFiles", snapshot.failedFiles)
                putString("currentFile", snapshot.currentFile)
                putInt("percentComplete", snapshot.percentComplete)
                putDouble("estimatedRemainingMs", snapshot.estimatedRemainingMs.toDouble())
            }
            emitEvent("BatchProgress", params)
        }

        override fun onBatchCompleted(result: BatchResult) {
            val outputPathsArray = Arguments.createArray()
            result.outputPaths.forEach { outputPathsArray.pushString(it) }

            val errorsArray = Arguments.createArray()
            result.errors.forEach { error ->
                val errorMap = Arguments.createMap().apply {
                    putString("filePath", error.filePath)
                    putString("errorCode", error.errorCode)
                    putString("errorMessage", error.errorMessage)
                }
                errorsArray.pushMap(errorMap)
            }

            val params = Arguments.createMap().apply {
                putString("jobId", result.jobId)
                putString("status", result.status.name)
                putInt("totalFiles", result.totalFiles)
                putInt("completedFiles", result.completedFiles)
                putInt("failedFiles", result.failedFiles)
                putDouble("durationMs", result.durationMs.toDouble())
                putArray("outputPaths", outputPathsArray)
                putArray("errors", errorsArray)
            }
            emitEvent("BatchCompleted", params)
        }

        override fun onBatchFailed(jobId: String, errorMessage: String) {
            val params = Arguments.createMap().apply {
                putString("jobId", jobId)
                putString("errorMessage", errorMessage)
            }
            emitEvent("BatchFailed", params)
        }

        override fun onBatchCancelled(jobId: String) {
            val params = Arguments.createMap().apply {
                putString("jobId", jobId)
            }
            emitEvent("BatchCancelled", params)
        }
    }

    @ReactMethod
    fun runBatchCompression(files: ReadableArray, level: String, isPro: Boolean, promise: Promise) {
        try {
            val filePaths = readableArrayToList(files)
            if (filePaths.isEmpty()) {
                promise.reject("INVALID_INPUT", "No files provided")
                return
            }

            val outputDir = getOutputDir("batch_compress")
            val jobId = engine.runBatchCompress(filePaths, outputDir, level, isPro, progressListener)
            promise.resolve(jobId)
        } catch (e: Exception) {
            Log.e(TAG, "runBatchCompression failed", e)
            promise.reject("BATCH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun runBatchMerge(files: ReadableArray, isPro: Boolean, promise: Promise) {
        try {
            val filePaths = readableArrayToList(files)
            if (filePaths.size < 2) {
                promise.reject("INVALID_INPUT", "At least 2 files required for merge")
                return
            }

            val outputDir = getOutputDir("batch_merge")
            val jobId = engine.runBatchMerge(filePaths, outputDir, isPro, progressListener)
            promise.resolve(jobId)
        } catch (e: Exception) {
            Log.e(TAG, "runBatchMerge failed", e)
            promise.reject("BATCH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun runBatchSplit(files: ReadableArray, ranges: ReadableArray, isPro: Boolean, promise: Promise) {
        try {
            val filePaths = readableArrayToList(files)
            if (filePaths.isEmpty()) {
                promise.reject("INVALID_INPUT", "No files provided")
                return
            }

            val rangeList = readableArrayToList(ranges)
            val outputDir = getOutputDir("batch_split")
            val jobId = engine.runBatchSplit(filePaths, outputDir, rangeList, isPro, progressListener)
            promise.resolve(jobId)
        } catch (e: Exception) {
            Log.e(TAG, "runBatchSplit failed", e)
            promise.reject("BATCH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelBatchJob(jobId: String, promise: Promise) {
        try {
            engine.cancelJob(jobId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun pauseBatchJob(jobId: String, promise: Promise) {
        try {
            engine.pauseJob(jobId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PAUSE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun resumeBatchJob(jobId: String, promise: Promise) {
        try {
            engine.resumeJob(jobId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESUME_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getWorkerCount(promise: Promise) {
        promise.resolve(TurboBatchPdfEngine.WORKER_COUNT)
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
        engine.destroy()
        scope.cancel()
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun emitEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {
            // Ignore if JS not ready
        }
    }

    private fun readableArrayToList(array: ReadableArray): List<String> {
        val list = mutableListOf<String>()
        for (i in 0 until array.size()) {
            array.getString(i)?.let { list.add(it) }
        }
        return list
    }

    private fun getOutputDir(subDir: String): String {
        val dir = java.io.File(reactContext.cacheDir, subDir)
        if (!dir.exists()) dir.mkdirs()
        return dir.absolutePath
    }
}
