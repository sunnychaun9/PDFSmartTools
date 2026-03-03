package com.pdfsmarttools.common

import android.app.ActivityManager
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments

/**
 * Detects device capabilities and classifies into performance tiers.
 * Used to adapt processing defaults (bitmap dimensions, thread counts, etc.)
 *
 * Tiers:
 * - low_end:   < 3GB RAM, < 4 cores
 * - mid_range: 3-6GB RAM, 4-6 cores
 * - high_end:  > 6GB RAM, 8+ cores
 */
class DeviceCapabilityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceCapability"

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            val activityManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)

            val totalRamMb = memInfo.totalMem / (1024 * 1024)
            val availableRamMb = memInfo.availMem / (1024 * 1024)
            val cores = Runtime.getRuntime().availableProcessors()
            val maxHeapMb = Runtime.getRuntime().maxMemory() / (1024 * 1024)

            // Classify device tier
            val tier = when {
                totalRamMb < 3072 || cores < 4 -> "low_end"
                totalRamMb > 6144 && cores >= 8 -> "high_end"
                else -> "mid_range"
            }

            // Recommended settings based on tier
            val bitmapScale = when (tier) {
                "low_end" -> 0.75
                "high_end" -> 1.25
                else -> 1.0
            }
            val maxParallelThreads = when (tier) {
                "low_end" -> 1
                "high_end" -> (cores / 2).coerceAtMost(4)
                else -> 2
            }
            val warningPageThreshold = when (tier) {
                "low_end" -> 30
                "high_end" -> 100
                else -> 50
            }

            val result = Arguments.createMap().apply {
                putString("tier", tier)
                putDouble("totalRamMb", totalRamMb.toDouble())
                putDouble("availableRamMb", availableRamMb.toDouble())
                putInt("cores", cores)
                putDouble("maxHeapMb", maxHeapMb.toDouble())
                putDouble("bitmapScale", bitmapScale)
                putInt("maxParallelThreads", maxParallelThreads)
                putInt("warningPageThreshold", warningPageThreshold)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            // Fallback to mid-range defaults
            val fallback = Arguments.createMap().apply {
                putString("tier", "mid_range")
                putDouble("totalRamMb", 4096.0)
                putDouble("availableRamMb", 2048.0)
                putInt("cores", 4)
                putDouble("maxHeapMb", 256.0)
                putDouble("bitmapScale", 1.0)
                putInt("maxParallelThreads", 2)
                putInt("warningPageThreshold", 50)
            }
            promise.resolve(fallback)
        }
    }
}
