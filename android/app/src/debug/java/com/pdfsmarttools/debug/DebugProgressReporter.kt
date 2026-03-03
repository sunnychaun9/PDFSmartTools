package com.pdfsmarttools.debug

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.progress.ProgressReporter

/**
 * Progress reporter for debug stress tests.
 *
 * Implements [ProgressReporter] with the same DeviceEventEmitter pattern as
 * ReactProgressReporter. Additionally tracks peak heap usage by sampling
 * MemoryBudget at each progress callback.
 *
 * @param reactContext React Native context for event emission.
 * @param eventName Event name emitted to JS (default: "DebugStressTestProgress").
 * @param minUpdateInterval Minimum interval between emitted events in milliseconds.
 */
class DebugProgressReporter(
    private val reactContext: ReactApplicationContext,
    private val eventName: String = "DebugStressTestProgress",
    private val minUpdateInterval: Long = 100L
) : ProgressReporter {

    private var lastEmitTime: Long = 0L
    var peakHeapPercent: Int = 0
        private set
    var peakAvailableMb: Long = Long.MAX_VALUE
        private set

    private fun sampleMemory() {
        val heap = MemoryBudget.heapUsagePercent()
        val available = MemoryBudget.availableMemoryMb()
        if (heap > peakHeapPercent) peakHeapPercent = heap
        if (available < peakAvailableMb) peakAvailableMb = available
    }

    override fun onProgress(progress: Int, currentItem: Int, totalItems: Int, status: String) {
        sampleMemory()

        val now = System.currentTimeMillis()
        if (now - lastEmitTime < minUpdateInterval) return
        lastEmitTime = now

        val params = Arguments.createMap().apply {
            putInt("progress", progress.coerceIn(0, 100))
            putInt("currentItem", currentItem)
            putInt("totalItems", totalItems)
            putString("status", status)
            putInt("heapPercent", MemoryBudget.heapUsagePercent())
            putDouble("availableMb", MemoryBudget.availableMemoryMb().toDouble())
        }
        emit(params)
    }

    override fun onStage(progress: Int, status: String) {
        sampleMemory()

        val params = Arguments.createMap().apply {
            putString("type", "stage")
            putInt("progress", progress.coerceIn(0, 100))
            putString("status", status)
            putInt("heapPercent", MemoryBudget.heapUsagePercent())
            putDouble("availableMb", MemoryBudget.availableMemoryMb().toDouble())
        }
        emit(params)
    }

    override fun onComplete(status: String) {
        sampleMemory()

        val params = Arguments.createMap().apply {
            putString("type", "complete")
            putInt("progress", 100)
            putString("status", status)
            putInt("heapPercent", MemoryBudget.heapUsagePercent())
            putDouble("availableMb", MemoryBudget.availableMemoryMb().toDouble())
        }
        emit(params)
    }

    fun reset() {
        peakHeapPercent = MemoryBudget.heapUsagePercent()
        peakAvailableMb = MemoryBudget.availableMemoryMb()
        lastEmitTime = 0L
    }

    private fun emit(params: com.facebook.react.bridge.WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {
            // JS not ready or module invalidated — swallow silently
        }
    }
}
