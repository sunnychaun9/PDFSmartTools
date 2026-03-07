package com.pdfsmarttools.debug

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.manipulate.cache.PdfCacheManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File

/**
 * React Native bridge module for debug stress testing.
 *
 * Follows the same coroutine pattern as PdfCompressorModule / PdfMergerModule:
 * - CoroutineScope(Dispatchers.IO + SupervisorJob())
 * - currentTestJob for cancellation support
 * - invalidate() cancels scope, resets simulators, cleans up files
 *
 * This module only exists in the debug source set and is never included in release builds.
 */
class DebugStressTestModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DebugStressTest"

    private companion object {
        const val TAG = "DebugStressTest"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentTestJob: Job? = null

    private val memorySimulator = DebugMemorySimulator()
    private val storageSimulator = DebugStorageSimulator()
    private val runner by lazy { StressTestRunner(reactContext.applicationContext) }

    private fun createReporter(): DebugProgressReporter =
        DebugProgressReporter(reactContext)

    private fun emitLog(message: String) {
        try {
            val params = Arguments.createMap().apply {
                putString("message", message)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("DebugStressTestLog", params)
        } catch (_: Exception) { }
    }

    // ── PDF Generation ───────────────────────────────────────────────────────

    @ReactMethod
    fun generateSyntheticPdf(pageCount: Int, promise: Promise) {
        scope.launch {
            try {
                val startTime = System.currentTimeMillis()
                val (path, sizeBytes) = SyntheticPdfGenerator.generate(
                    reactContext.applicationContext, pageCount, "manual"
                )
                val durationMs = System.currentTimeMillis() - startTime

                val result = Arguments.createMap().apply {
                    putString("path", path)
                    putDouble("sizeBytes", sizeBytes.toDouble())
                    putDouble("durationMs", durationMs.toDouble())
                }
                emitLog("Generated ${pageCount}p PDF (${sizeBytes / 1024}KB) in ${durationMs}ms")
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "generateSyntheticPdf failed", e)
                promise.reject("GENERATION_ERROR", e.message, e)
            }
        }
    }

    // ── Stress Tests ─────────────────────────────────────────────────────────

    @ReactMethod
    fun runMergeStressTest(fileCount: Int, pagesPerFile: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runMergeStress(fileCount, pagesPerFile, reporter)
                emitLog("Merge test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Merge stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runMergeStressTest failed", e)
                emitLog("Merge test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runCompressStressTest(pageCount: Int, level: String, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runCompressStress(pageCount, level, reporter)
                emitLog("Compress test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Compress stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runCompressStressTest failed", e)
                emitLog("Compress test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runRepeatedExecutionTest(engineName: String, iterations: Int, pageCount: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metricsList = runner.runRepeatedExecution(engineName, iterations, pageCount, reporter)

                val resultArray = Arguments.createArray()
                metricsList.forEach { resultArray.pushMap(it.toWritableMap()) }

                emitLog("Repeated execution ($engineName x$iterations): " +
                        "${metricsList.count { it.status == TestStatus.SUCCESS }}/${metricsList.size} passed")
                promise.resolve(resultArray)
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Repeated execution test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runRepeatedExecutionTest failed", e)
                emitLog("Repeated execution ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runLargeDocumentTest(pageCount: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runLargeDocumentTest(pageCount, reporter)
                emitLog("Large document test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Large document test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runLargeDocumentTest failed", e)
                emitLog("Large document test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    // ── Batch Stress Tests ─────────────────────────────────────────────────────

    @ReactMethod
    fun runBatchCompressStressTest(fileCount: Int, pagesPerFile: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runBatchCompressStress(fileCount, pagesPerFile, reporter)
                emitLog("Batch compress test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Batch compress stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runBatchCompressStressTest failed", e)
                emitLog("Batch compress test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runBatchMergeStressTest(fileCount: Int, pagesPerFile: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runBatchMergeStress(fileCount, pagesPerFile, reporter)
                emitLog("Batch merge test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Batch merge stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runBatchMergeStressTest failed", e)
                emitLog("Batch merge test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    // ── Streaming Stress Tests ──────────────────────────────────────────────────

    @ReactMethod
    fun runStreamingCompressStressTest(pageCount: Int, level: String, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runStreamingCompressStress(pageCount, level, reporter)
                emitLog("Streaming compress test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Streaming compress stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runStreamingCompressStressTest failed", e)
                emitLog("Streaming compress test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runStreamingMergeStressTest(fileCount: Int, pagesPerFile: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runStreamingMergeStress(fileCount, pagesPerFile, reporter)
                emitLog("Streaming merge test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Streaming merge stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runStreamingMergeStressTest failed", e)
                emitLog("Streaming merge test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runLowMemoryStreamingStressTest(pageCount: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runLowMemoryStreamingStress(pageCount, reporter)
                emitLog("Low memory streaming test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} pages")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Low memory streaming stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runLowMemoryStreamingStressTest failed", e)
                emitLog("Low memory streaming test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    // ── Cache Stress Tests ────────────────────────────────────────────────────

    @ReactMethod
    fun runCacheRepeatedCompressStressTest(pageCount: Int, iterations: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runCacheRepeatedCompressStress(pageCount, iterations, reporter)
                emitLog("Cache repeated compress test ${metrics.status}: ${metrics.durationMs}ms")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Cache repeated compress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runCacheRepeatedCompressStressTest failed", e)
                emitLog("Cache repeated compress test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runCacheBatchSharedFilesStressTest(fileCount: Int, pagesPerFile: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runCacheBatchSharedFilesStress(fileCount, pagesPerFile, reporter)
                emitLog("Cache batch shared files test ${metrics.status}: ${metrics.durationMs}ms")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Cache batch shared files test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runCacheBatchSharedFilesStressTest failed", e)
                emitLog("Cache batch shared files test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runCacheLowMemoryEvictionStressTest(fileCount: Int, pagesPerFile: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runCacheLowMemoryEvictionStress(fileCount, pagesPerFile, reporter)
                emitLog("Cache eviction test ${metrics.status}: ${metrics.durationMs}ms")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Cache eviction test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runCacheLowMemoryEvictionStressTest failed", e)
                emitLog("Cache eviction test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    // ── Preview Engine Stress Tests ──────────────────────────────────────────

    @ReactMethod
    fun runPreviewThumbnailStressTest(thumbnailCount: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runPreviewThumbnailStress(thumbnailCount, reporter)
                emitLog("Preview thumbnail test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} thumbnails")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Preview thumbnail stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runPreviewThumbnailStressTest failed", e)
                emitLog("Preview thumbnail test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runPreviewLargePdfStressTest(pageCount: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runPreviewLargePdfStress(pageCount, reporter)
                emitLog("Preview large PDF test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} thumbnails")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Preview large PDF stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runPreviewLargePdfStressTest failed", e)
                emitLog("Preview large PDF test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runBackgroundThumbnailGenerationStressTest(pageCount: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runBackgroundThumbnailGenerationStress(pageCount, reporter)
                emitLog("Background thumbnail generation test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} thumbnails")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Background thumbnail generation stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runBackgroundThumbnailGenerationStressTest failed", e)
                emitLog("Background thumbnail generation test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runPreviewRapidScrollStressTest(pageCount: Int, thumbnailCount: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                val metrics = runner.runPreviewRapidScrollStress(pageCount, thumbnailCount, reporter)
                emitLog("Preview rapid scroll test ${metrics.status}: ${metrics.durationMs}ms, " +
                        "${metrics.pageCount} thumbnails")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Preview rapid scroll stress test was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "runPreviewRapidScrollStressTest failed", e)
                emitLog("Preview rapid scroll test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getCacheMetrics(promise: Promise) {
        scope.launch {
            try {
                val snapshot = PdfCacheManager.metrics.snapshot()
                val result = Arguments.createMap().apply {
                    putInt("hits", snapshot.hits)
                    putInt("misses", snapshot.misses)
                    putInt("evictions", snapshot.evictions)
                    putInt("memoryPressureEvictions", snapshot.memoryPressureEvictions)
                    putDouble("totalSavedMs", snapshot.totalSavedMs.toDouble())
                    putInt("hitRatePercent", snapshot.hitRatePercent)
                    putInt("totalRequests", snapshot.totalRequests)
                    putInt("cacheSize", PdfCacheManager.size)
                    putDouble("estimatedMemoryMb", PdfCacheManager.estimatedMemoryMb.toDouble())
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("METRICS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun clearCache(promise: Promise) {
        scope.launch {
            try {
                PdfCacheManager.clear()
                PdfCacheManager.metrics.reset()
                emitLog("PDF cache cleared")
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", e.message, e)
            }
        }
    }

    // ── Memory Simulation ────────────────────────────────────────────────────

    @ReactMethod
    fun enableLowMemorySimulation(limitMb: Int, promise: Promise) {
        try {
            memorySimulator.enable(limitMb)
            emitLog("Low memory simulation enabled: target=${limitMb}MB, " +
                    "actual=${MemoryBudget.availableMemoryMb()}MB")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "enableLowMemorySimulation failed", e)
            promise.reject("SIMULATION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun disableLowMemorySimulation(promise: Promise) {
        try {
            memorySimulator.reset()
            emitLog("Low memory simulation disabled: available=${MemoryBudget.availableMemoryMb()}MB")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "disableLowMemorySimulation failed", e)
            promise.reject("SIMULATION_ERROR", e.message, e)
        }
    }

    // ── Storage Simulation ───────────────────────────────────────────────────

    @ReactMethod
    fun simulateStorageFull(promise: Promise) {
        scope.launch {
            try {
                val fillerSize = storageSimulator.fillStorage(reactContext.applicationContext)
                emitLog("Storage simulation active: filler=${fillerSize / (1024 * 1024)}MB")

                val result = Arguments.createMap().apply {
                    putDouble("fillerSizeBytes", fillerSize.toDouble())
                    putDouble("remainingBytes", reactContext.cacheDir.usableSpace.toDouble())
                }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "simulateStorageFull failed", e)
                promise.reject("SIMULATION_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun runStorageFullTest(promise: Promise) {
        currentTestJob = scope.launch {
            try {
                // 1. Fill storage
                storageSimulator.fillStorage(reactContext.applicationContext)
                emitLog("Storage filled, running compress test...")

                // 2. Run engine — should fail with PROCESSING_FAILED
                val reporter = createReporter()
                val metrics = runner.runCompressStress(10, "low", reporter)

                // 3. Clean up filler regardless of result
                storageSimulator.cleanup(reactContext.applicationContext)

                emitLog("Storage full test ${metrics.status}: ${metrics.errorCode ?: "no error"}")
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                storageSimulator.cleanup(reactContext.applicationContext)
                promise.reject("CANCELLED", "Storage full test was cancelled")
            } catch (e: Exception) {
                storageSimulator.cleanup(reactContext.applicationContext)
                Log.e(TAG, "runStorageFullTest failed", e)
                emitLog("Storage full test ERROR: ${e.message}")
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun cleanupStorageSimulation(promise: Promise) {
        try {
            storageSimulator.cleanup(reactContext.applicationContext)
            emitLog("Storage simulation cleaned up")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "cleanupStorageSimulation failed", e)
            promise.reject("CLEANUP_ERROR", e.message, e)
        }
    }

    // ── Cancellation Test ────────────────────────────────────────────────────

    @ReactMethod
    fun startCancellableOperation(pagesPerFile: Int, promise: Promise) {
        currentTestJob = scope.launch {
            try {
                val reporter = createReporter()
                // Merge 20 files — long enough to cancel mid-operation
                val metrics = runner.runMergeStress(20, pagesPerFile, reporter)
                promise.resolve(metrics.toWritableMap())
            } catch (e: CancellationException) {
                emitLog("Cancellation test: operation cancelled successfully")
                // Check for orphaned temp files
                val tmpFiles = findOrphanedTmpFiles()
                val result = Arguments.createMap().apply {
                    putBoolean("cancelled", true)
                    putInt("orphanedTmpFiles", tmpFiles.size)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "startCancellableOperation failed", e)
                promise.reject("TEST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun cancelCurrentOperation(promise: Promise) {
        val job = currentTestJob
        if (job != null && job.isActive) {
            job.cancel()
            emitLog("Cancel requested for current operation")
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    // ── Memory Snapshot ──────────────────────────────────────────────────────

    @ReactMethod
    fun getMemorySnapshot(promise: Promise) {
        val runtime = Runtime.getRuntime()
        val result = Arguments.createMap().apply {
            putInt("heapUsagePercent", MemoryBudget.heapUsagePercent())
            putDouble("availableMb", MemoryBudget.availableMemoryMb().toDouble())
            putDouble("maxHeapMb", (runtime.maxMemory() / (1024 * 1024)).toDouble())
            putDouble("usedHeapMb", ((runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024)).toDouble())
            putBoolean("simulationActive", memorySimulator.isActive)
        }
        promise.resolve(result)
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────

    @ReactMethod
    fun cleanupAllTestFiles(promise: Promise) {
        try {
            SyntheticPdfGenerator.cleanup(reactContext.applicationContext)
            storageSimulator.cleanup(reactContext.applicationContext)
            emitLog("All test files cleaned up")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "cleanupAllTestFiles failed", e)
            promise.reject("CLEANUP_ERROR", e.message, e)
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    override fun invalidate() {
        super.invalidate()
        currentTestJob?.cancel()
        scope.cancel()
        memorySimulator.reset()
        try {
            kotlinx.coroutines.runBlocking { PdfCacheManager.clear() }
        } catch (_: Exception) { }
        try {
            storageSimulator.cleanup(reactContext.applicationContext)
            SyntheticPdfGenerator.cleanup(reactContext.applicationContext)
        } catch (_: Exception) { }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun findOrphanedTmpFiles(): List<File> {
        val testDir = File(reactContext.cacheDir, "debug_stress_tests")
        if (!testDir.exists()) return emptyList()
        return testDir.walkTopDown()
            .filter { it.isFile && it.name.endsWith(".tmp") }
            .toList()
    }
}
