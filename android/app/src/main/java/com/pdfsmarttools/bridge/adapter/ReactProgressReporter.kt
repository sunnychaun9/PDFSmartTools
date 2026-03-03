package com.pdfsmarttools.bridge.adapter

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pdfsmarttools.core.progress.ProgressReporter

/**
 * Implements ProgressReporter by emitting React Native events.
 * Used by bridge modules to forward progress from use cases to JS.
 */
class ReactProgressReporter(
    private val reactContext: ReactApplicationContext,
    private val eventName: String,
    private val minUpdateInterval: Long = 100L
) : ProgressReporter {

    private var lastEmitTime: Long = 0L

    override fun onProgress(progress: Int, currentItem: Int, totalItems: Int, status: String) {
        val now = System.currentTimeMillis()
        if (now - lastEmitTime < minUpdateInterval) return
        lastEmitTime = now

        val params = Arguments.createMap().apply {
            putInt("progress", progress.coerceIn(0, 100))
            putInt("currentItem", currentItem)
            putInt("totalItems", totalItems)
            putString("status", status)
        }
        emit(params)
    }

    override fun onStage(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress.coerceIn(0, 100))
            putString("status", status)
        }
        emit(params)
    }

    override fun onComplete(status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", 100)
            putString("status", status)
        }
        emit(params)
    }

    private fun emit(params: com.facebook.react.bridge.WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {
            // Ignore event emission errors (JS not ready, module invalidated, etc.)
        }
    }
}
