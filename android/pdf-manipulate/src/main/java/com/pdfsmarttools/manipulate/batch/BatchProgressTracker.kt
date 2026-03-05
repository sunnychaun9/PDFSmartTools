package com.pdfsmarttools.manipulate.batch

import java.util.concurrent.atomic.AtomicInteger

/**
 * Thread-safe progress tracker for batch operations.
 * Uses atomic counters for lock-free concurrent updates.
 */
class BatchProgressTracker(
    val totalFiles: Int
) {
    private val completed = AtomicInteger(0)
    private val failed = AtomicInteger(0)
    private var startTimeMs: Long = 0L

    @Volatile
    var currentFile: String = ""
        private set

    @Volatile
    var listener: BatchProgressListener? = null

    val completedCount: Int get() = completed.get()
    val failedCount: Int get() = failed.get()
    val processedCount: Int get() = completed.get() + failed.get()

    val percentComplete: Int get() = if (totalFiles > 0) {
        ((processedCount.toDouble() / totalFiles) * 100).toInt().coerceIn(0, 100)
    } else 0

    val estimatedRemainingMs: Long get() {
        if (startTimeMs == 0L || processedCount == 0) return 0L
        val elapsed = System.currentTimeMillis() - startTimeMs
        val avgPerFile = elapsed.toDouble() / processedCount
        val remaining = totalFiles - processedCount
        return (avgPerFile * remaining).toLong()
    }

    fun start() {
        startTimeMs = System.currentTimeMillis()
    }

    fun onFileStarted(filePath: String) {
        currentFile = filePath
    }

    fun onFileCompleted(filePath: String) {
        completed.incrementAndGet()
        emitProgress()
    }

    fun onFileFailed(filePath: String, errorCode: String, errorMessage: String) {
        failed.incrementAndGet()
        emitProgress()
    }

    fun snapshot(): BatchProgressSnapshot = BatchProgressSnapshot(
        totalFiles = totalFiles,
        completedFiles = completedCount,
        failedFiles = failedCount,
        currentFile = currentFile,
        percentComplete = percentComplete,
        estimatedRemainingMs = estimatedRemainingMs
    )

    private fun emitProgress() {
        listener?.onBatchProgress(snapshot())
    }
}

data class BatchProgressSnapshot(
    val totalFiles: Int,
    val completedFiles: Int,
    val failedFiles: Int,
    val currentFile: String,
    val percentComplete: Int,
    val estimatedRemainingMs: Long
)

interface BatchProgressListener {
    fun onBatchProgress(snapshot: BatchProgressSnapshot)
    fun onBatchCompleted(result: BatchResult)
    fun onBatchFailed(jobId: String, errorMessage: String)
    fun onBatchCancelled(jobId: String)
}
