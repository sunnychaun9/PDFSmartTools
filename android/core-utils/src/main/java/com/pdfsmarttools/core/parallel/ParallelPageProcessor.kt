package com.pdfsmarttools.core.parallel

import android.util.Log

/**
 * Configuration for parallel page processing operations.
 */
data class ParallelConfig(
    val maxConcurrency: Int = ParallelPageProcessor.defaultConcurrency(),
    val gcCheckInterval: Int = 5,
    val gcThresholdFraction: Double = 0.80
)

/**
 * Shared utilities for parallel PDF processing engines.
 * Keeps it minimal — engines use coroutines directly since compression
 * and OCR have different pipeline shapes.
 */
object ParallelPageProcessor {

    private const val TAG = "ParallelPageProcessor"

    /**
     * Default concurrency level: half of available processors, minimum 2.
     */
    fun defaultConcurrency(): Int {
        return (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(2)
    }

    /**
     * Check heap pressure and run GC only if usage exceeds threshold.
     * Shared by all engines to replace unconditional System.gc() calls.
     *
     * @param thresholdFraction Fraction of maxMemory that triggers GC (e.g. 0.80)
     * @param label Log label for identifying the caller
     * @return true if GC was triggered
     */
    fun checkMemoryAndGc(thresholdFraction: Double = 0.80, label: String = ""): Boolean {
        val runtime = Runtime.getRuntime()
        val usedBytes = runtime.totalMemory() - runtime.freeMemory()
        val maxBytes = runtime.maxMemory()
        if (usedBytes > (maxBytes * thresholdFraction).toLong()) {
            val usedMb = usedBytes / (1024 * 1024)
            val pct = usedBytes * 100 / maxBytes
            Log.d(TAG, "[$label] Memory at ${usedMb}MB (${pct}%), running GC")
            System.gc()
            return true
        }
        return false
    }
}
