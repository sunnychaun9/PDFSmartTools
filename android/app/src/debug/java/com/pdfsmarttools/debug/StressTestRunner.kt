package com.pdfsmarttools.debug

import android.content.Context
import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.di.ModuleProvider
import com.pdfsmarttools.manipulate.batch.BatchProgressListener
import com.pdfsmarttools.manipulate.batch.BatchProgressSnapshot
import com.pdfsmarttools.manipulate.batch.BatchResult
import com.pdfsmarttools.manipulate.merge.StrictMergeEngine
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
}
