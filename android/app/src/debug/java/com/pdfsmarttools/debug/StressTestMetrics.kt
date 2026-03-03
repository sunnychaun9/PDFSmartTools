package com.pdfsmarttools.debug

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

enum class TestStatus { RUNNING, SUCCESS, FAILURE, CANCELLED, ERROR }

data class StressTestMetrics(
    val testName: String,
    val engineTag: String,
    val status: TestStatus,
    val durationMs: Long,
    val startHeapPercent: Int,
    val peakHeapPercent: Int,
    val endHeapPercent: Int,
    val startAvailableMb: Long,
    val endAvailableMb: Long,
    val outputSizeBytes: Long,
    val inputSizeBytes: Long,
    val pageCount: Int,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val timestamp: Long = System.currentTimeMillis()
) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("testName", testName)
        putString("engineTag", engineTag)
        putString("status", status.name)
        putDouble("durationMs", durationMs.toDouble())
        putInt("startHeapPercent", startHeapPercent)
        putInt("peakHeapPercent", peakHeapPercent)
        putInt("endHeapPercent", endHeapPercent)
        putDouble("startAvailableMb", startAvailableMb.toDouble())
        putDouble("endAvailableMb", endAvailableMb.toDouble())
        putDouble("outputSizeBytes", outputSizeBytes.toDouble())
        putDouble("inputSizeBytes", inputSizeBytes.toDouble())
        putInt("pageCount", pageCount)
        errorCode?.let { putString("errorCode", it) }
        errorMessage?.let { putString("errorMessage", it) }
        putDouble("timestamp", timestamp.toDouble())
    }
}
