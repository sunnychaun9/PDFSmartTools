package com.pdfsmarttools.common

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Standardized progress tracking utility for all PDF operations.
 * Provides consistent progress reporting with time estimates.
 */
class ProgressTracker(
    private val reactContext: ReactApplicationContext,
    private val eventName: String,
    private val totalItems: Int
) {
    private var startTime: Long = 0
    private var processedItems: Int = 0
    private var lastUpdateTime: Long = 0
    private var itemTimes: MutableList<Long> = mutableListOf()

    // Minimum interval between progress updates (ms) to avoid flooding
    private val minUpdateInterval = 100L

    /**
     * Start tracking progress
     */
    fun start() {
        startTime = System.currentTimeMillis()
        lastUpdateTime = startTime
        processedItems = 0
        itemTimes.clear()
    }

    /**
     * Update progress after completing an item
     *
     * @param currentItem Current item number (1-indexed)
     * @param status Status message to display
     * @param forceUpdate Force update even if interval hasn't passed
     */
    fun update(currentItem: Int, status: String, forceUpdate: Boolean = false) {
        val now = System.currentTimeMillis()

        // Track time for this item
        if (processedItems > 0 && itemTimes.size < 10) {
            val itemTime = now - lastUpdateTime
            if (itemTime > 0) {
                itemTimes.add(itemTime)
            }
        }

        processedItems = currentItem
        lastUpdateTime = now

        // Throttle updates unless forced
        if (!forceUpdate && (now - lastUpdateTime) < minUpdateInterval) {
            return
        }

        // Calculate progress percentage
        val progress = if (totalItems > 0) {
            ((currentItem.toFloat() / totalItems) * 100).toInt().coerceIn(0, 100)
        } else {
            0
        }

        // Calculate estimated time remaining
        val elapsedMs = now - startTime
        val estimatedTotalMs = if (processedItems > 0 && totalItems > 0) {
            (elapsedMs.toFloat() / processedItems * totalItems).toLong()
        } else {
            0L
        }
        val estimatedRemainingMs = (estimatedTotalMs - elapsedMs).coerceAtLeast(0)

        // Build and send event
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putInt("currentItem", currentItem)
            putInt("totalItems", totalItems)
            putString("status", status)
            putDouble("elapsedMs", elapsedMs.toDouble())
            putDouble("estimatedRemainingMs", estimatedRemainingMs.toDouble())
            putDouble("estimatedTotalMs", estimatedTotalMs.toDouble())
        }

        sendEvent(params)
    }

    /**
     * Report completion
     */
    fun complete(status: String = "Complete!") {
        val now = System.currentTimeMillis()
        val elapsedMs = now - startTime

        val params = Arguments.createMap().apply {
            putInt("progress", 100)
            putInt("currentItem", totalItems)
            putInt("totalItems", totalItems)
            putString("status", status)
            putDouble("elapsedMs", elapsedMs.toDouble())
            putDouble("estimatedRemainingMs", 0.0)
            putDouble("estimatedTotalMs", elapsedMs.toDouble())
        }

        sendEvent(params)
    }

    /**
     * Report a stage without item progress (for initialization, etc.)
     */
    fun reportStage(progress: Int, status: String) {
        val now = System.currentTimeMillis()
        val elapsedMs = now - startTime

        val params = Arguments.createMap().apply {
            putInt("progress", progress.coerceIn(0, 100))
            putInt("currentItem", 0)
            putInt("totalItems", totalItems)
            putString("status", status)
            putDouble("elapsedMs", elapsedMs.toDouble())
            putDouble("estimatedRemainingMs", -1.0) // Unknown
            putDouble("estimatedTotalMs", -1.0) // Unknown
        }

        sendEvent(params)
    }

    private fun sendEvent(params: WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            // Ignore event emission errors
        }
    }

    companion object {
        /**
         * Format milliseconds to human-readable time
         */
        fun formatTime(ms: Long): String {
            return when {
                ms < 1000 -> "< 1 sec"
                ms < 60000 -> "${ms / 1000} sec"
                ms < 3600000 -> "${ms / 60000} min ${(ms % 60000) / 1000} sec"
                else -> "${ms / 3600000} hr ${(ms % 3600000) / 60000} min"
            }
        }
    }
}
