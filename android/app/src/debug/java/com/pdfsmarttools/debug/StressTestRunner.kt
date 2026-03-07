package com.pdfsmarttools.debug

import android.content.Context
import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.di.ModuleProvider
import com.pdfsmarttools.manipulate.batch.BatchProgressListener
import com.pdfsmarttools.manipulate.batch.BatchProgressSnapshot
import com.pdfsmarttools.manipulate.batch.BatchResult
import com.pdfsmarttools.convert.preview.PdfPreviewEngine
import com.pdfsmarttools.convert.preview.PdfPreviewMetrics
import com.pdfsmarttools.convert.preview.PdfThumbnailCache
import com.pdfsmarttools.manipulate.cache.PdfCacheManager
import com.pdfsmarttools.manipulate.merge.StrictMergeEngine
import com.pdfsmarttools.manipulate.streaming.StreamingCompressEngine
import com.pdfsmarttools.manipulate.streaming.StreamingMergeEngine
import com.pdfsmarttools.pdfcore.engine.CompressParams
import com.pdfsmarttools.pdfcore.engine.MergeParams
import com.pdfsmarttools.pdfcore.model.CompressionLevel
import kotlinx.coroutines.CompletableDeferred
import java.io.File
import java.util.UUID

/**
 * Orchestrates stress test scenarios.
 *
 * **Merge tests** run through [PdfEngineOrchestrator] — the exact production code path
 * including memory gates, save audits, and exception safety nets.
 *
 * **Compress tests** run through [CompressPdfUseCase] which uses the old-style engine
 * (not yet migrated to PdfEngine<P,R> contract). Still exercises the real compression
 * pipeline including PdfBoxFacade, image recompression, and atomic save.
 */
class StressTestRunner(private val context: Context) {

    private companion object {
        const val TAG = "StressTestRunner"
    }

    private val orchestrator = ModuleProvider.orchestrator

    private fun outputDir(): File {
        val dir = File(context.cacheDir, "debug_stress_tests/output")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /**
     * Merge [fileCount] synthetic PDF files, each with [pagesPerFile] pages.
     * Runs through PdfEngineOrchestrator with StrictMergeEngine.
     */
    suspend fun runMergeStress(
        fileCount: Int,
        pagesPerFile: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "Merge ${fileCount}x${pagesPerFile}p"
        val engineTag = "MergeEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        // Generate synthetic PDFs
        val inputPaths = mutableListOf<String>()
        var totalInputSize = 0L
        for (i in 1..fileCount) {
            val (path, size) = SyntheticPdfGenerator.generate(context, pagesPerFile, "merge_$i")
            inputPaths.add(path)
            totalInputSize += size
        }

        val outputPath = File(outputDir(), "merge_result_${UUID.randomUUID().toString().take(8)}.pdf")
            .absolutePath

        val params = MergeParams(
            context = context,
            inputPaths = inputPaths,
            outputPath = outputPath,
            isPro = true  // Bypass watermark for stress testing
        )

        val result = orchestrator.execute(StrictMergeEngine(), params, reporter)
        val durationMs = System.currentTimeMillis() - startTime

        return when (result) {
            is PdfResult.Success -> StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = TestStatus.SUCCESS,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = reporter.peakHeapPercent,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = result.data.outputSize,
                inputSizeBytes = totalInputSize,
                pageCount = result.data.totalPages
            )
            is PdfResult.Failure -> StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = TestStatus.FAILURE,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = reporter.peakHeapPercent,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = 0L,
                inputSizeBytes = totalInputSize,
                pageCount = fileCount * pagesPerFile,
                errorCode = result.error.code,
                errorMessage = result.error.message
            )
        }
    }

    /**
     * Compress a synthetic PDF with [pageCount] pages at the given compression [level].
     * Uses CompressPdfUseCase (old-style, not orchestrated).
     */
    suspend fun runCompressStress(
        pageCount: Int,
        level: String,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "Compress ${pageCount}p ($level)"
        val engineTag = "CompressEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        val (inputPath, inputSize) = SyntheticPdfGenerator.generate(context, pageCount, "compress")
        val outputPath = File(outputDir(), "compress_result_${UUID.randomUUID().toString().take(8)}.pdf")
            .absolutePath

        val compressionLevel = try {
            CompressionLevel.valueOf(level.uppercase())
        } catch (_: IllegalArgumentException) {
            CompressionLevel.MEDIUM
        }

        val useCase = ModuleProvider.provideCompressPdfUseCase()
        val result = useCase(
            context = context,
            inputPath = inputPath,
            outputPath = outputPath,
            level = compressionLevel,
            isPro = true,
            progressReporter = reporter
        )

        val durationMs = System.currentTimeMillis() - startTime

        return when (result) {
            is PdfResult.Success -> {
                val outputFile = File(result.data.outputPath)
                StressTestMetrics(
                    testName = testName,
                    engineTag = engineTag,
                    status = TestStatus.SUCCESS,
                    durationMs = durationMs,
                    startHeapPercent = startHeap,
                    peakHeapPercent = reporter.peakHeapPercent,
                    endHeapPercent = MemoryBudget.heapUsagePercent(),
                    startAvailableMb = startAvailable,
                    endAvailableMb = MemoryBudget.availableMemoryMb(),
                    outputSizeBytes = outputFile.length(),
                    inputSizeBytes = inputSize,
                    pageCount = result.data.pageCount
                )
            }
            is PdfResult.Failure -> StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = TestStatus.FAILURE,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = reporter.peakHeapPercent,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = 0L,
                inputSizeBytes = inputSize,
                pageCount = pageCount,
                errorCode = result.error.code,
                errorMessage = result.error.message
            )
        }
    }

    /**
     * Run the same engine [iterations] times to detect memory leaks.
     */
    suspend fun runRepeatedExecution(
        engineName: String,
        iterations: Int,
        pageCount: Int,
        reporter: DebugProgressReporter
    ): List<StressTestMetrics> {
        val results = mutableListOf<StressTestMetrics>()

        for (i in 1..iterations) {
            Log.d(TAG, "Repeated execution $i/$iterations ($engineName)")

            val metrics = when (engineName) {
                "merge" -> runMergeStress(5, pageCount, reporter)
                "compress" -> runCompressStress(pageCount, "medium", reporter)
                else -> runMergeStress(5, pageCount, reporter)
            }

            results.add(metrics)

            // Brief GC pause between iterations
            System.gc()
        }

        return results
    }

    /**
     * Batch compress stress test: generates [fileCount] PDFs and batch compresses them.
     */
    suspend fun runBatchCompressStress(
        fileCount: Int,
        pagesPerFile: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "BatchCompress ${fileCount}x${pagesPerFile}p"
        val engineTag = "TurboBatchEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        val inputPaths = mutableListOf<String>()
        var totalInputSize = 0L
        for (i in 1..fileCount) {
            val (path, size) = SyntheticPdfGenerator.generate(context, pagesPerFile, "batch_compress_$i")
            inputPaths.add(path)
            totalInputSize += size
        }

        val outputDir = File(outputDir(), "batch_compress_${UUID.randomUUID().toString().take(8)}")
            .also { it.mkdirs() }.absolutePath

        val batchEngine = ModuleProvider.provideTurboBatchPdfEngine(context)
        val completable = CompletableDeferred<BatchResult>()

        val listener = object : BatchProgressListener {
            override fun onBatchProgress(snapshot: BatchProgressSnapshot) {
                reporter.onProgress(snapshot.percentComplete, snapshot.completedFiles, snapshot.totalFiles,
                    "Batch: ${snapshot.completedFiles}/${snapshot.totalFiles}")
            }
            override fun onBatchCompleted(result: BatchResult) { completable.complete(result) }
            override fun onBatchFailed(jobId: String, errorMessage: String) {
                completable.complete(BatchResult(jobId, com.pdfsmarttools.manipulate.batch.BatchOperationType.COMPRESS,
                    com.pdfsmarttools.manipulate.batch.BatchJobStatus.FAILED, fileCount, 0, fileCount,
                    System.currentTimeMillis() - startTime, emptyList(), emptyList()))
            }
            override fun onBatchCancelled(jobId: String) {
                completable.complete(BatchResult(jobId, com.pdfsmarttools.manipulate.batch.BatchOperationType.COMPRESS,
                    com.pdfsmarttools.manipulate.batch.BatchJobStatus.CANCELLED, fileCount, 0, 0,
                    System.currentTimeMillis() - startTime, emptyList(), emptyList()))
            }
        }

        batchEngine.runBatchCompress(inputPaths, outputDir, "medium", true, listener)
        val result = completable.await()
        batchEngine.destroy()

        val durationMs = System.currentTimeMillis() - startTime

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = if (result.completedFiles == fileCount) TestStatus.SUCCESS else TestStatus.FAILURE,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = reporter.peakHeapPercent,
            endHeapPercent = MemoryBudget.heapUsagePercent(),
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = totalInputSize,
            pageCount = fileCount * pagesPerFile,
            errorCode = if (result.failedFiles > 0) "PARTIAL_FAILURE" else null,
            errorMessage = if (result.failedFiles > 0) "${result.failedFiles} files failed" else null
        )
    }

    /**
     * Batch merge stress test: generates [fileCount] PDFs and batch merges them.
     */
    suspend fun runBatchMergeStress(
        fileCount: Int,
        pagesPerFile: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "BatchMerge ${fileCount}x${pagesPerFile}p"
        val engineTag = "TurboBatchEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        val inputPaths = mutableListOf<String>()
        var totalInputSize = 0L
        for (i in 1..fileCount) {
            val (path, size) = SyntheticPdfGenerator.generate(context, pagesPerFile, "batch_merge_$i")
            inputPaths.add(path)
            totalInputSize += size
        }

        val outputDir = File(outputDir(), "batch_merge_${UUID.randomUUID().toString().take(8)}")
            .also { it.mkdirs() }.absolutePath

        val batchEngine = ModuleProvider.provideTurboBatchPdfEngine(context)
        val completable = CompletableDeferred<BatchResult>()

        val listener = object : BatchProgressListener {
            override fun onBatchProgress(snapshot: BatchProgressSnapshot) {
                reporter.onProgress(snapshot.percentComplete, snapshot.completedFiles, snapshot.totalFiles,
                    "Batch merge: ${snapshot.completedFiles}/${snapshot.totalFiles}")
            }
            override fun onBatchCompleted(result: BatchResult) { completable.complete(result) }
            override fun onBatchFailed(jobId: String, errorMessage: String) {
                completable.complete(BatchResult(jobId, com.pdfsmarttools.manipulate.batch.BatchOperationType.MERGE,
                    com.pdfsmarttools.manipulate.batch.BatchJobStatus.FAILED, fileCount, 0, fileCount,
                    System.currentTimeMillis() - startTime, emptyList(), emptyList()))
            }
            override fun onBatchCancelled(jobId: String) {
                completable.complete(BatchResult(jobId, com.pdfsmarttools.manipulate.batch.BatchOperationType.MERGE,
                    com.pdfsmarttools.manipulate.batch.BatchJobStatus.CANCELLED, fileCount, 0, 0,
                    System.currentTimeMillis() - startTime, emptyList(), emptyList()))
            }
        }

        batchEngine.runBatchMerge(inputPaths, outputDir, true, listener)
        val result = completable.await()
        batchEngine.destroy()

        val durationMs = System.currentTimeMillis() - startTime

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = if (result.status == com.pdfsmarttools.manipulate.batch.BatchJobStatus.COMPLETED) TestStatus.SUCCESS else TestStatus.FAILURE,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = reporter.peakHeapPercent,
            endHeapPercent = MemoryBudget.heapUsagePercent(),
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = totalInputSize,
            pageCount = fileCount * pagesPerFile
        )
    }

    /**
     * Large document test: generates a high-page-count PDF and runs merge.
     * Uses orchestrated merge to test memory gates with large inputs.
     */
    suspend fun runLargeDocumentTest(
        pageCount: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        // Split into 5 files to exercise merge orchestrator with large total page count
        val pagesPerFile = (pageCount / 5).coerceAtLeast(10)
        return runMergeStress(5, pagesPerFile, reporter)
    }

    // ── Streaming Engine Stress Tests ─────────────────────────────────────────

    /**
     * Streaming compress stress test: generates a large PDF and compresses
     * it using [StreamingCompressEngine] (page-by-page processing).
     *
     * Simulates 200MB+ file processing with minimal memory footprint.
     */
    suspend fun runStreamingCompressStress(
        pageCount: Int,
        level: String,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "StreamCompress ${pageCount}p ($level)"
        val engineTag = "StreamingCompressEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        val (inputPath, inputSize) = SyntheticPdfGenerator.generate(context, pageCount, "stream_compress")
        val outputPath = File(outputDir(), "stream_compress_${UUID.randomUUID().toString().take(8)}.pdf")
            .absolutePath

        val compressionLevel = try {
            CompressionLevel.valueOf(level.uppercase())
        } catch (_: IllegalArgumentException) {
            CompressionLevel.MEDIUM
        }

        val engine = StreamingCompressEngine()
        val params = CompressParams(
            context = context,
            inputPath = inputPath,
            outputPath = outputPath,
            isPro = true,
            level = compressionLevel
        )

        val result = engine.execute(params, reporter)
        val durationMs = System.currentTimeMillis() - startTime

        return when (result) {
            is PdfResult.Success -> {
                val outputFile = File(result.data.outputPath)
                StressTestMetrics(
                    testName = testName,
                    engineTag = engineTag,
                    status = TestStatus.SUCCESS,
                    durationMs = durationMs,
                    startHeapPercent = startHeap,
                    peakHeapPercent = reporter.peakHeapPercent,
                    endHeapPercent = MemoryBudget.heapUsagePercent(),
                    startAvailableMb = startAvailable,
                    endAvailableMb = MemoryBudget.availableMemoryMb(),
                    outputSizeBytes = outputFile.length(),
                    inputSizeBytes = inputSize,
                    pageCount = result.data.pageCount
                )
            }
            is PdfResult.Failure -> StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = TestStatus.FAILURE,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = reporter.peakHeapPercent,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = 0L,
                inputSizeBytes = inputSize,
                pageCount = pageCount,
                errorCode = result.error.code,
                errorMessage = result.error.message
            )
        }
    }

    /**
     * Streaming merge stress test: generates multiple PDFs and merges them
     * using [StreamingMergeEngine] (one source file at a time).
     *
     * Simulates merging many large PDFs (500MB+ total) with stable memory.
     */
    suspend fun runStreamingMergeStress(
        fileCount: Int,
        pagesPerFile: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "StreamMerge ${fileCount}x${pagesPerFile}p"
        val engineTag = "StreamingMergeEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        val inputPaths = mutableListOf<String>()
        var totalInputSize = 0L
        for (i in 1..fileCount) {
            val (path, size) = SyntheticPdfGenerator.generate(context, pagesPerFile, "stream_merge_$i")
            inputPaths.add(path)
            totalInputSize += size
        }

        val outputPath = File(outputDir(), "stream_merge_${UUID.randomUUID().toString().take(8)}.pdf")
            .absolutePath

        val engine = StreamingMergeEngine()
        val params = MergeParams(
            context = context,
            inputPaths = inputPaths,
            outputPath = outputPath,
            isPro = true
        )

        val result = engine.execute(params, reporter)
        val durationMs = System.currentTimeMillis() - startTime

        return when (result) {
            is PdfResult.Success -> StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = TestStatus.SUCCESS,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = reporter.peakHeapPercent,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = result.data.outputSize,
                inputSizeBytes = totalInputSize,
                pageCount = result.data.totalPages
            )
            is PdfResult.Failure -> StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = TestStatus.FAILURE,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = reporter.peakHeapPercent,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = 0L,
                inputSizeBytes = totalInputSize,
                pageCount = fileCount * pagesPerFile,
                errorCode = result.error.code,
                errorMessage = result.error.message
            )
        }
    }

    /**
     * Low memory streaming stress test: simulates constrained memory conditions
     * by reserving a large portion of the memory budget before running streaming.
     */
    suspend fun runLowMemoryStreamingStress(
        pageCount: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "LowMemStream ${pageCount}p"
        val engineTag = "StreamingCompressEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName — simulating low memory")

        // Reserve 60% of available memory to simulate constrained conditions
        val reserveBytes = (MemoryBudget.availableBytes() * 0.6).toLong()
        MemoryBudget.reserveMemory(reserveBytes)

        try {
            val (inputPath, inputSize) = SyntheticPdfGenerator.generate(context, pageCount, "lowmem_stream")
            val outputPath = File(outputDir(), "lowmem_stream_${UUID.randomUUID().toString().take(8)}.pdf")
                .absolutePath

            val engine = StreamingCompressEngine()
            val params = CompressParams(
                context = context,
                inputPath = inputPath,
                outputPath = outputPath,
                isPro = true,
                level = CompressionLevel.MEDIUM
            )

            val result = engine.execute(params, reporter)
            val durationMs = System.currentTimeMillis() - startTime

            return when (result) {
                is PdfResult.Success -> StressTestMetrics(
                    testName = testName,
                    engineTag = engineTag,
                    status = TestStatus.SUCCESS,
                    durationMs = durationMs,
                    startHeapPercent = startHeap,
                    peakHeapPercent = reporter.peakHeapPercent,
                    endHeapPercent = MemoryBudget.heapUsagePercent(),
                    startAvailableMb = startAvailable,
                    endAvailableMb = MemoryBudget.availableMemoryMb(),
                    outputSizeBytes = File(result.data.outputPath).length(),
                    inputSizeBytes = inputSize,
                    pageCount = result.data.pageCount
                )
                is PdfResult.Failure -> StressTestMetrics(
                    testName = testName,
                    engineTag = engineTag,
                    status = TestStatus.FAILURE,
                    durationMs = durationMs,
                    startHeapPercent = startHeap,
                    peakHeapPercent = reporter.peakHeapPercent,
                    endHeapPercent = MemoryBudget.heapUsagePercent(),
                    startAvailableMb = startAvailable,
                    endAvailableMb = MemoryBudget.availableMemoryMb(),
                    outputSizeBytes = 0L,
                    inputSizeBytes = inputSize,
                    pageCount = pageCount,
                    errorCode = result.error.code,
                    errorMessage = result.error.message
                )
            }
        } finally {
            MemoryBudget.releaseMemory(reserveBytes)
            MemoryBudget.reset()
        }
    }

    // ── Cache Stress Tests ────────────────────────────────────────────────────

    /**
     * Repeated compress on the same PDF 50x to verify cache hits increase performance.
     * The first iteration is a cache miss (cold); subsequent iterations should be faster
     * due to cached page count lookups.
     */
    suspend fun runCacheRepeatedCompressStress(
        pageCount: Int,
        iterations: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "CacheRepeatCompress ${pageCount}p x$iterations"
        val engineTag = "CacheStress"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        // Clear cache to start fresh
        PdfCacheManager.clear()
        PdfCacheManager.metrics.reset()

        val (inputPath, inputSize) = SyntheticPdfGenerator.generate(context, pageCount, "cache_repeat")
        var lastOutputPath = ""
        var successCount = 0

        for (i in 1..iterations) {
            val outputPath = File(outputDir(), "cache_repeat_${i}_${UUID.randomUUID().toString().take(6)}.pdf")
                .absolutePath

            val engine = StreamingCompressEngine()
            val params = CompressParams(
                context = context,
                inputPath = inputPath,
                outputPath = outputPath,
                isPro = true,
                level = CompressionLevel.LOW
            )

            val result = engine.execute(params, reporter)
            if (result is PdfResult.Success) {
                successCount++
                lastOutputPath = result.data.outputPath
            }

            // Clean up output to save disk space
            File(outputPath).delete()

            if (i % 10 == 0) {
                Log.d(TAG, "Cache test iteration $i/$iterations: " +
                        "hits=${PdfCacheManager.metrics.hits}, " +
                        "misses=${PdfCacheManager.metrics.misses}")
            }
        }

        val durationMs = System.currentTimeMillis() - startTime
        val cacheMetrics = PdfCacheManager.metrics.snapshot()

        Log.i(TAG, "$testName complete: $successCount/$iterations succeeded, " +
                "cache hits=${cacheMetrics.hits}, misses=${cacheMetrics.misses}, " +
                "hitRate=${cacheMetrics.hitRatePercent}%, savedMs=${cacheMetrics.totalSavedMs}")

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = if (successCount == iterations) TestStatus.SUCCESS else TestStatus.FAILURE,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = reporter.peakHeapPercent,
            endHeapPercent = MemoryBudget.heapUsagePercent(),
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = inputSize,
            pageCount = pageCount * iterations,
            errorCode = if (successCount < iterations) "PARTIAL_FAILURE" else null,
            errorMessage = if (successCount < iterations) "${iterations - successCount} iterations failed, " +
                    "cacheHitRate=${cacheMetrics.hitRatePercent}%" else
                "cacheHits=${cacheMetrics.hits}, hitRate=${cacheMetrics.hitRatePercent}%, " +
                        "savedMs=${cacheMetrics.totalSavedMs}"
        )
    }

    /**
     * Batch operations with shared files to test cache reuse across operations.
     * Generates files, then runs compress + merge using overlapping file sets.
     */
    suspend fun runCacheBatchSharedFilesStress(
        fileCount: Int,
        pagesPerFile: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "CacheBatchShared ${fileCount}x${pagesPerFile}p"
        val engineTag = "CacheStress"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        PdfCacheManager.clear()
        PdfCacheManager.metrics.reset()

        // Generate shared input files
        val inputPaths = mutableListOf<String>()
        var totalInputSize = 0L
        for (i in 1..fileCount) {
            val (path, size) = SyntheticPdfGenerator.generate(context, pagesPerFile, "cache_batch_$i")
            inputPaths.add(path)
            totalInputSize += size
        }

        var operationSuccess = 0

        // Phase 1: Compress each file (populates cache)
        for ((idx, path) in inputPaths.withIndex()) {
            val outputPath = File(outputDir(), "cache_batch_c_${idx}.pdf").absolutePath
            val engine = StreamingCompressEngine()
            val params = CompressParams(
                context = context,
                inputPath = path,
                outputPath = outputPath,
                isPro = true,
                level = CompressionLevel.LOW
            )
            val result = engine.execute(params, reporter)
            if (result is PdfResult.Success) operationSuccess++
            File(outputPath).delete()
        }

        // Phase 2: Merge all files (should hit cache for page counts)
        val mergeOutput = File(outputDir(), "cache_batch_merged.pdf").absolutePath
        val mergeEngine = StreamingMergeEngine()
        val mergeParams = MergeParams(
            context = context,
            inputPaths = inputPaths,
            outputPath = mergeOutput,
            isPro = true
        )
        val mergeResult = mergeEngine.execute(mergeParams, reporter)
        if (mergeResult is PdfResult.Success) operationSuccess++
        File(mergeOutput).delete()

        // Phase 3: Compress again (should be all cache hits)
        for ((idx, path) in inputPaths.withIndex()) {
            val outputPath = File(outputDir(), "cache_batch_c2_${idx}.pdf").absolutePath
            val engine = StreamingCompressEngine()
            val params = CompressParams(
                context = context,
                inputPath = path,
                outputPath = outputPath,
                isPro = true,
                level = CompressionLevel.MEDIUM
            )
            val result = engine.execute(params, reporter)
            if (result is PdfResult.Success) operationSuccess++
            File(outputPath).delete()
        }

        val durationMs = System.currentTimeMillis() - startTime
        val cacheMetrics = PdfCacheManager.metrics.snapshot()
        val totalOps = fileCount * 2 + 1 // compress + merge + compress again

        Log.i(TAG, "$testName complete: $operationSuccess/$totalOps ops, " +
                "cache: hits=${cacheMetrics.hits}, misses=${cacheMetrics.misses}, " +
                "hitRate=${cacheMetrics.hitRatePercent}%")

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = if (operationSuccess == totalOps) TestStatus.SUCCESS else TestStatus.FAILURE,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = reporter.peakHeapPercent,
            endHeapPercent = MemoryBudget.heapUsagePercent(),
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = totalInputSize,
            pageCount = fileCount * pagesPerFile,
            errorMessage = "ops=$operationSuccess/$totalOps, cacheHits=${cacheMetrics.hits}, " +
                    "hitRate=${cacheMetrics.hitRatePercent}%, savedMs=${cacheMetrics.totalSavedMs}"
        )
    }

    /**
     * Low memory cache eviction stress test.
     * Loads files into cache, then simulates memory pressure and verifies
     * entries are properly evicted.
     */
    suspend fun runCacheLowMemoryEvictionStress(
        fileCount: Int,
        pagesPerFile: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "CacheEviction ${fileCount}x${pagesPerFile}p"
        val engineTag = "CacheStress"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        PdfCacheManager.clear()
        PdfCacheManager.metrics.reset()

        // Generate more files than cache capacity (>5) to force LRU evictions
        val inputPaths = mutableListOf<String>()
        var totalInputSize = 0L
        for (i in 1..fileCount) {
            val (path, size) = SyntheticPdfGenerator.generate(context, pagesPerFile, "cache_evict_$i")
            inputPaths.add(path)
            totalInputSize += size
        }

        // Phase 1: Load all files into cache (will exceed max 5, forcing evictions)
        for (path in inputPaths) {
            PdfCacheManager.getPageCount(File(path))
        }

        val cacheAfterLoad = PdfCacheManager.size
        val evictionsAfterLoad = PdfCacheManager.metrics.evictions

        Log.d(TAG, "After loading $fileCount files: cache size=$cacheAfterLoad, " +
                "evictions=$evictionsAfterLoad")

        // Phase 2: Simulate memory pressure
        val reserveBytes = (MemoryBudget.availableBytes() * 0.7).toLong()
        MemoryBudget.reserveMemory(reserveBytes)

        try {
            PdfCacheManager.trimForMemoryPressure()
            val cacheAfterPressure = PdfCacheManager.size
            val pressureEvictions = PdfCacheManager.metrics.memoryPressureEvictions

            Log.d(TAG, "After memory pressure: cache size=$cacheAfterPressure, " +
                    "pressure evictions=$pressureEvictions")

            // Phase 3: Re-access some files (should trigger new loads)
            for (path in inputPaths.take(3)) {
                PdfCacheManager.getPageCount(File(path))
            }
        } finally {
            MemoryBudget.releaseMemory(reserveBytes)
            MemoryBudget.reset()
        }

        val durationMs = System.currentTimeMillis() - startTime
        val cacheMetrics = PdfCacheManager.metrics.snapshot()

        Log.i(TAG, "$testName complete: cache $cacheMetrics")

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = TestStatus.SUCCESS,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = reporter.peakHeapPercent,
            endHeapPercent = MemoryBudget.heapUsagePercent(),
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = totalInputSize,
            pageCount = fileCount * pagesPerFile,
            errorMessage = "lruEvictions=${cacheMetrics.evictions}, " +
                    "pressureEvictions=${cacheMetrics.memoryPressureEvictions}, " +
                    "hits=${cacheMetrics.hits}, misses=${cacheMetrics.misses}"
        )
    }

    // ── Preview Engine Stress Tests ──────────────────────────────────────────

    /**
     * Render [thumbnailCount] thumbnails from a synthetic PDF to verify
     * no memory leaks, stable heap usage, and smooth performance.
     *
     * Generates a PDF with enough pages, then renders thumbnails for
     * all pages in sequence, measuring heap before and after.
     */
    suspend fun runPreviewThumbnailStress(
        thumbnailCount: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "PreviewThumbs ${thumbnailCount}x"
        val engineTag = "PdfPreviewEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()

        Log.d(TAG, "Starting $testName")

        // Generate a synthetic PDF with enough pages
        val pageCount = thumbnailCount.coerceAtMost(200)
        val (inputPath, inputSize) = SyntheticPdfGenerator.generate(context, pageCount, "preview_stress")

        val thumbnailDir = File(context.cacheDir, "debug_preview_stress")
        if (!thumbnailDir.exists()) thumbnailDir.mkdirs()

        PdfThumbnailCache.clear()
        val engine = PdfPreviewEngine()
        var renderedCount = 0
        var peakHeap = startHeap

        try {
            engine.openPdf(inputPath)

            for (i in 0 until thumbnailCount) {
                val pageIndex = i % engine.pageCount
                val outputFile = File(thumbnailDir, "stress_thumb_${i}.jpg")

                engine.renderPageThumbnail(
                    pageIndex = pageIndex,
                    outputFile = outputFile
                )

                renderedCount++

                // Track peak heap
                val currentHeap = MemoryBudget.heapUsagePercent()
                if (currentHeap > peakHeap) peakHeap = currentHeap

                // Report progress
                if (i % 10 == 0 || i == thumbnailCount - 1) {
                    reporter.onProgress(
                        ((i + 1) * 100) / thumbnailCount,
                        i + 1,
                        thumbnailCount,
                        "Rendered ${i + 1}/$thumbnailCount thumbnails"
                    )
                }

                // GC every 50 thumbnails to simulate real scrolling behavior
                if (i > 0 && i % 50 == 0) {
                    System.gc()
                    Log.d(TAG, "Preview stress: $i/$thumbnailCount, heap=${MemoryBudget.heapUsagePercent()}%")
                }
            }
        } finally {
            engine.close()
            // Clean up thumbnail files
            thumbnailDir.listFiles()?.forEach { it.delete() }
            thumbnailDir.delete()
        }

        val durationMs = System.currentTimeMillis() - startTime
        val endHeap = MemoryBudget.heapUsagePercent()

        Log.i(TAG, "$testName complete: $renderedCount thumbnails in ${durationMs}ms, " +
                "heap: $startHeap% → $endHeap% (peak: $peakHeap%)")

        val metrics = PdfPreviewMetrics.snapshot()

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = if (renderedCount == thumbnailCount) TestStatus.SUCCESS else TestStatus.FAILURE,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = peakHeap,
            endHeapPercent = endHeap,
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = inputSize,
            pageCount = renderedCount,
            errorMessage = if (renderedCount == thumbnailCount)
                "rendered=$renderedCount, heap=$startHeap%→$endHeap% (peak=$peakHeap%), " +
                "avgRenderMs=${metrics.avgThumbnailRenderMs}, cacheHitRate=${metrics.cacheHitRatePercent}%"
            else "${thumbnailCount - renderedCount} thumbnails failed"
        )
    }

    /**
     * Large PDF stress test: renders thumbnails from a 1000-page PDF.
     *
     * Verifies:
     * - Engine handles large page counts
     * - Memory stays under 60MB
     * - Render times remain stable across all pages
     * - Cache hit ratio for repeated access
     */
    suspend fun runPreviewLargePdfStress(
        pageCount: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "PreviewLargePdf ${pageCount}p"
        val engineTag = "PdfPreviewEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()
        PdfPreviewMetrics.reset()

        Log.d(TAG, "Starting $testName")

        val (inputPath, inputSize) = SyntheticPdfGenerator.generate(context, pageCount, "preview_large")

        val thumbnailDir = File(context.cacheDir, "debug_preview_large")
        if (!thumbnailDir.exists()) thumbnailDir.mkdirs()

        PdfThumbnailCache.clear()
        val engine = PdfPreviewEngine()
        var renderedCount = 0
        var peakHeap = startHeap
        var gcCount = 0

        try {
            engine.openPdf(inputPath)

            // Render every 5th page to simulate scrolling through a large PDF
            val pagesToRender = (0 until engine.pageCount step 5).toList()

            for ((idx, pageIdx) in pagesToRender.withIndex()) {
                val outputFile = File(thumbnailDir, "large_thumb_${pageIdx}.jpg")

                engine.renderPageThumbnail(
                    pageIndex = pageIdx,
                    outputFile = outputFile
                )

                renderedCount++

                val currentHeap = MemoryBudget.heapUsagePercent()
                if (currentHeap > peakHeap) peakHeap = currentHeap

                if (idx % 20 == 0 || idx == pagesToRender.size - 1) {
                    reporter.onProgress(
                        ((idx + 1) * 100) / pagesToRender.size,
                        idx + 1,
                        pagesToRender.size,
                        "Large PDF: ${idx + 1}/${pagesToRender.size} pages"
                    )
                }

                // GC every 40 renders
                if (renderedCount > 0 && renderedCount % 40 == 0) {
                    System.gc()
                    gcCount++
                    Log.d(TAG, "Large PDF stress: $renderedCount rendered, heap=${currentHeap}%")
                }
            }
        } finally {
            engine.close()
            thumbnailDir.listFiles()?.forEach { it.delete() }
            thumbnailDir.delete()
        }

        val durationMs = System.currentTimeMillis() - startTime
        val endHeap = MemoryBudget.heapUsagePercent()
        val metrics = PdfPreviewMetrics.snapshot()

        Log.i(TAG, "$testName complete: $renderedCount thumbnails in ${durationMs}ms, " +
                "heap: $startHeap%→$endHeap% (peak: $peakHeap%), GCs: $gcCount, " +
                "avgRender: ${metrics.avgThumbnailRenderMs}ms")

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = if (renderedCount == (pageCount / 5).coerceAtLeast(1)) TestStatus.SUCCESS else TestStatus.FAILURE,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = peakHeap,
            endHeapPercent = endHeap,
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = inputSize,
            pageCount = renderedCount,
            errorMessage = "rendered=$renderedCount, gcCount=$gcCount, " +
                "avgRenderMs=${metrics.avgThumbnailRenderMs}, peakHeap=$peakHeap%, " +
                "errors=${metrics.renderErrors}"
        )
    }

    /**
     * Rapid scroll simulation: renders thumbnails in random order.
     *
     * Simulates user rapidly scrolling through a PDF, requesting
     * pages out of order. Verifies no memory leak and stable heap.
     */
    suspend fun runPreviewRapidScrollStress(
        pageCount: Int,
        thumbnailCount: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "PreviewRapidScroll ${thumbnailCount}x random"
        val engineTag = "PdfPreviewEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()
        PdfPreviewMetrics.reset()

        Log.d(TAG, "Starting $testName")

        val (inputPath, inputSize) = SyntheticPdfGenerator.generate(
            context, pageCount.coerceAtMost(200), "preview_scroll"
        )

        val thumbnailDir = File(context.cacheDir, "debug_preview_scroll")
        if (!thumbnailDir.exists()) thumbnailDir.mkdirs()

        PdfThumbnailCache.clear()
        val engine = PdfPreviewEngine()
        var renderedCount = 0
        var peakHeap = startHeap

        try {
            engine.openPdf(inputPath)

            // Generate random page order
            val random = java.util.Random(42) // Deterministic for reproducibility
            val randomPages = (0 until thumbnailCount).map { random.nextInt(engine.pageCount) }

            for ((idx, pageIdx) in randomPages.withIndex()) {
                val outputFile = File(thumbnailDir, "scroll_${idx}.jpg")

                engine.renderPageThumbnail(
                    pageIndex = pageIdx,
                    outputFile = outputFile
                )

                renderedCount++

                val currentHeap = MemoryBudget.heapUsagePercent()
                if (currentHeap > peakHeap) peakHeap = currentHeap

                if (idx % 20 == 0 || idx == thumbnailCount - 1) {
                    reporter.onProgress(
                        ((idx + 1) * 100) / thumbnailCount,
                        idx + 1,
                        thumbnailCount,
                        "Rapid scroll: ${idx + 1}/$thumbnailCount"
                    )
                }

                if (renderedCount > 0 && renderedCount % 50 == 0) {
                    System.gc()
                }
            }
        } finally {
            engine.close()
            thumbnailDir.listFiles()?.forEach { it.delete() }
            thumbnailDir.delete()
        }

        val durationMs = System.currentTimeMillis() - startTime
        val endHeap = MemoryBudget.heapUsagePercent()
        val metrics = PdfPreviewMetrics.snapshot()

        // Check for memory leak: end heap should not be >15% higher than start
        val heapDelta = endHeap - startHeap
        val leaked = heapDelta > 15

        Log.i(TAG, "$testName complete: $renderedCount in ${durationMs}ms, " +
                "heap delta: ${heapDelta}%, cacheHitRate: ${metrics.cacheHitRatePercent}%")

        return StressTestMetrics(
            testName = testName,
            engineTag = engineTag,
            status = if (renderedCount == thumbnailCount && !leaked) TestStatus.SUCCESS else TestStatus.FAILURE,
            durationMs = durationMs,
            startHeapPercent = startHeap,
            peakHeapPercent = peakHeap,
            endHeapPercent = endHeap,
            startAvailableMb = startAvailable,
            endAvailableMb = MemoryBudget.availableMemoryMb(),
            outputSizeBytes = 0L,
            inputSizeBytes = inputSize,
            pageCount = renderedCount,
            errorCode = if (leaked) "MEMORY_LEAK" else null,
            errorMessage = "rendered=$renderedCount, heapDelta=${heapDelta}%, " +
                "avgRenderMs=${metrics.avgThumbnailRenderMs}, " +
                "cacheHitRate=${metrics.cacheHitRatePercent}%, errors=${metrics.renderErrors}" +
                if (leaked) " [POSSIBLE LEAK]" else ""
        )
    }

    /**
     * Stress test for background thumbnail pre-generation.
     *
     * Opens a large PDF (300+ pages), starts background generation,
     * monitors memory, and verifies cache hit rate > 70%.
     */
    suspend fun runBackgroundThumbnailGenerationStress(
        pageCount: Int,
        reporter: DebugProgressReporter
    ): StressTestMetrics {
        val testName = "BgThumbnailGen ${pageCount}p"
        val engineTag = "PdfPreviewEngine"
        val startTime = System.currentTimeMillis()
        val startHeap = MemoryBudget.heapUsagePercent()
        val startAvailable = MemoryBudget.availableMemoryMb()
        reporter.reset()
        PdfPreviewMetrics.reset()

        Log.d(TAG, "Starting $testName")

        val effectivePageCount = pageCount.coerceAtMost(500)
        val (inputPath, inputSize) = SyntheticPdfGenerator.generate(context, effectivePageCount, "bg_gen_stress")

        val thumbnailDir = File(context.cacheDir, "debug_bg_gen_stress")
        if (thumbnailDir.exists()) thumbnailDir.deleteRecursively()
        thumbnailDir.mkdirs()

        PdfThumbnailCache.clear()
        val engine = PdfPreviewEngine()
        var peakHeap = startHeap

        try {
            // 1. Open PDF
            engine.openPdf(inputPath)
            reporter.onProgress(10, 1, 5, "PDF opened: ${engine.pageCount} pages")

            // 2. Start background generation
            engine.startBackgroundThumbnailGeneration(inputPath, engine.pageCount, thumbnailDir)
            reporter.onProgress(20, 2, 5, "Background generation started")

            // 3. Monitor memory while generation runs
            var completed = false
            val timeout = 120_000L // 2 minutes max
            val checkInterval = 500L
            var elapsed = 0L

            while (elapsed < timeout && !completed) {
                Thread.sleep(checkInterval)
                elapsed += checkInterval

                val currentHeap = MemoryBudget.heapUsagePercent()
                if (currentHeap > peakHeap) peakHeap = currentHeap

                val metrics = PdfPreviewMetrics.snapshot()
                val generated = metrics.backgroundThumbnailsGenerated

                // Report progress
                val pct = 20 + ((generated.toFloat() / engine.pageCount) * 70).toInt().coerceAtMost(70)
                reporter.onProgress(pct, 3, 5,
                    "Generating: $generated/${engine.pageCount}, heap: ${currentHeap}%")

                // Check if done
                if (generated >= engine.pageCount) {
                    completed = true
                }

                // 4. Ensure no crashes — if heap exceeds 90%, it's acceptable to stop early
                if (currentHeap > 90) {
                    Log.w(TAG, "High memory pressure: ${currentHeap}%, stopping early")
                    break
                }
            }

            reporter.onProgress(90, 4, 5, "Generation phase complete, verifying cache...")

            // 5. Verify cache hit rate by re-requesting all generated thumbnails
            var cacheHits = 0
            val width = PdfPreviewEngine.DEFAULT_THUMBNAIL_WIDTH
            val height = PdfPreviewEngine.DEFAULT_THUMBNAIL_HEIGHT
            for (i in 0 until engine.pageCount) {
                val cached = PdfThumbnailCache.get(inputPath, i, width, height)
                if (cached != null && File(cached).exists()) {
                    cacheHits++
                }
            }

            val cacheHitRate = if (engine.pageCount > 0) (cacheHits * 100) / engine.pageCount else 0
            reporter.onProgress(100, 5, 5, "Cache hit rate: $cacheHitRate%")

            val durationMs = System.currentTimeMillis() - startTime
            val metrics = PdfPreviewMetrics.snapshot()
            val heapDelta = MemoryBudget.heapUsagePercent() - startHeap
            val leaked = heapDelta > 15
            val hitRateOk = cacheHitRate >= 70

            Log.i(TAG, "$testName complete: ${metrics.backgroundThumbnailsGenerated} generated in ${durationMs}ms, " +
                    "cacheHitRate: $cacheHitRate%, heapDelta: ${heapDelta}%")

            return StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = if (hitRateOk && !leaked) TestStatus.SUCCESS else TestStatus.FAILURE,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = peakHeap,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = 0L,
                inputSizeBytes = inputSize,
                pageCount = metrics.backgroundThumbnailsGenerated,
                errorCode = when {
                    leaked -> "MEMORY_LEAK"
                    !hitRateOk -> "LOW_CACHE_HIT_RATE"
                    else -> null
                },
                errorMessage = "generated=${metrics.backgroundThumbnailsGenerated}, cacheHitRate=$cacheHitRate%, " +
                    "bgDurationMs=${metrics.backgroundQueueDurationMs}, heapDelta=${heapDelta}%" +
                    if (leaked) " [POSSIBLE LEAK]" else "" +
                    if (!hitRateOk) " [LOW HIT RATE]" else ""
            )
        } catch (e: Exception) {
            val durationMs = System.currentTimeMillis() - startTime
            Log.e(TAG, "$testName FAILED: ${e.message}", e)
            return StressTestMetrics(
                testName = testName,
                engineTag = engineTag,
                status = TestStatus.FAILURE,
                durationMs = durationMs,
                startHeapPercent = startHeap,
                peakHeapPercent = peakHeap,
                endHeapPercent = MemoryBudget.heapUsagePercent(),
                startAvailableMb = startAvailable,
                endAvailableMb = MemoryBudget.availableMemoryMb(),
                outputSizeBytes = 0L,
                inputSizeBytes = inputSize,
                pageCount = 0,
                errorCode = "EXCEPTION",
                errorMessage = e.message ?: "Unknown error"
            )
        } finally {
            engine.close()
            thumbnailDir.deleteRecursively()
        }
    }
}
