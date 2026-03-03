package com.pdfsmarttools.debug

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pdfsmarttools.core.memory.MemoryBudget
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
