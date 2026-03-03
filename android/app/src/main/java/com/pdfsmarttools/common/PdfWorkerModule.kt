package com.pdfsmarttools.common

import androidx.work.*
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * React Native bridge for WorkManager-based background PDF operations.
 * Allows JS to enqueue long-running operations that survive app backgrounding.
 */
class PdfWorkerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PdfWorker"

    /**
     * Enqueue a background compress operation.
     * @param inputPath Source PDF path
     * @param outputPath Destination PDF path
     * @param level Compression level (LOW, MEDIUM, HIGH)
     * @param isPro Whether user has Pro subscription
     * @param promise Resolves with work request ID
     */
    @ReactMethod
    fun enqueueCompress(inputPath: String, outputPath: String, level: String, isPro: Boolean, promise: Promise) {
        try {
            val inputData = workDataOf(
                PdfWorker.KEY_OPERATION to PdfWorker.OP_COMPRESS,
                PdfWorker.KEY_INPUT_PATH to inputPath,
                PdfWorker.KEY_OUTPUT_PATH to outputPath,
                PdfWorker.KEY_COMPRESSION_LEVEL to level,
                PdfWorker.KEY_IS_PRO to isPro
            )

            val workRequest = OneTimeWorkRequestBuilder<PdfWorker>()
                .setInputData(inputData)
                .build()

            val workManager = WorkManager.getInstance(reactContext)
            workManager.enqueue(workRequest)

            // Observe result
            observeWork(workManager, workRequest.id.toString())

            promise.resolve(workRequest.id.toString())
        } catch (e: Exception) {
            promise.reject("ENQUEUE_ERROR", e.message, e)
        }
    }

    /**
     * Enqueue a background merge operation.
     * @param inputPaths Pipe-separated list of input PDF paths
     * @param outputPath Destination PDF path
     * @param isPro Whether user has Pro subscription
     * @param promise Resolves with work request ID
     */
    @ReactMethod
    fun enqueueMerge(inputPaths: String, outputPath: String, isPro: Boolean, promise: Promise) {
        try {
            val inputData = workDataOf(
                PdfWorker.KEY_OPERATION to PdfWorker.OP_MERGE,
                PdfWorker.KEY_INPUT_PATHS to inputPaths,
                PdfWorker.KEY_OUTPUT_PATH to outputPath,
                PdfWorker.KEY_IS_PRO to isPro
            )

            val workRequest = OneTimeWorkRequestBuilder<PdfWorker>()
                .setInputData(inputData)
                .build()

            val workManager = WorkManager.getInstance(reactContext)
            workManager.enqueue(workRequest)

            observeWork(workManager, workRequest.id.toString())

            promise.resolve(workRequest.id.toString())
        } catch (e: Exception) {
            promise.reject("ENQUEUE_ERROR", e.message, e)
        }
    }

    /**
     * Observe work completion and emit events to JS
     */
    private fun observeWork(workManager: WorkManager, workId: String) {
        val id = java.util.UUID.fromString(workId)
        workManager.getWorkInfoByIdLiveData(id).observeForever { workInfo ->
            if (workInfo == null) return@observeForever

            when (workInfo.state) {
                WorkInfo.State.SUCCEEDED -> {
                    val result = Arguments.createMap().apply {
                        putString("workId", workId)
                        putString("status", "succeeded")
                        putString("resultPath", workInfo.outputData.getString(PdfWorker.KEY_RESULT_PATH))
                        putDouble("resultSize", workInfo.outputData.getLong(PdfWorker.KEY_RESULT_SIZE, 0).toDouble())
                        putInt("pageCount", workInfo.outputData.getInt(PdfWorker.KEY_PAGE_COUNT, 0))
                    }
                    sendEvent("PdfWorkerComplete", result)
                }
                WorkInfo.State.FAILED -> {
                    val result = Arguments.createMap().apply {
                        putString("workId", workId)
                        putString("status", "failed")
                        putString("error", workInfo.outputData.getString(PdfWorker.KEY_ERROR) ?: "Unknown error")
                    }
                    sendEvent("PdfWorkerComplete", result)
                }
                WorkInfo.State.CANCELLED -> {
                    val result = Arguments.createMap().apply {
                        putString("workId", workId)
                        putString("status", "cancelled")
                    }
                    sendEvent("PdfWorkerComplete", result)
                }
                else -> { /* ENQUEUED, RUNNING, BLOCKED - ignore */ }
            }
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
