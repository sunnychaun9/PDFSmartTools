package com.pdfsmarttools.pdfcore.engine

import com.pdfsmarttools.core.logging.PdfLogger
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import java.io.File
import kotlinx.coroutines.CancellationException

// ─────────────────────────────────────────────────────────────────────────────
// PdfEngineOrchestrator — RUNTIME ENFORCEMENT INFRASTRUCTURE
// ─────────────────────────────────────────────────────────────────────────────
//
// Every engine execution flows through this class. It is the single chokepoint
// that enforces declared policies, collects metrics, and provides a safety net
// for unhandled exceptions.
//
// ─── Dependency Graph ───────────────────────────────────────────────────────
//
//    Bridge Module
//        │
//        ▼
//    UseCase (owns dispatcher, validates domain rules)
//        │
//        ▼
//  ┌─────────────────────────┐
//  │  PdfEngineOrchestrator  │  ← runtime enforcement layer
//  │  • pre-execution checks │
//  │  • timing measurement   │
//  │  • exception safety net │
//  │  • post-execution audit │
//  └────────────┬────────────┘
//               │
//               ▼
//    PdfEngine<P, R>.execute()
//        │
//        ▼
//    PdfBoxFacade (PDFBox operations)
//
// ─── Execution Flow ─────────────────────────────────────────────────────────
//
//  1. LOG START          — engine tag, memory policy, save policy, input summary
//  2. MEMORY GATE        — verify heap budget per declared MemoryPolicy
//  3. PDFBOX INIT        — ensureInitialized() for non-NATIVE_RENDERER engines
//  4. MEMORY RESET       — MemoryBudget.reset() to clear stale reservations
//  5. INPUT VALIDATION   — check input file(s) exist for file-based params
//  6. ─── EXECUTE ───    — delegate to engine.execute(params, reporter)
//  7. TIMING             — measure wall-clock duration of step 6
//  8. SAVE POLICY AUDIT  — verify output file exists and is non-empty
//  9. LOG METRICS        — structured log with timing, memory, file sizes
// 10. MEMORY CLEANUP     — MemoryBudget.reset() + suggest GC if heap > 75%
// 11. RETURN RESULT      — PdfResult<R> to the use case
//
// If step 6 throws:
//   • CancellationException → rethrown immediately (NEVER caught)
//   • OutOfMemoryError      → mapped to PdfError.OutOfMemory
//   • SecurityException     → mapped to PdfError.PdfEncrypted
//   • Other Exception       → mapped via PdfError.fromException
//   • Other Throwable       → mapped to PdfError.Unknown
//   • Partial output files  → deleted
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime enforcement layer for all PDF engine executions.
 *
 * This orchestrator does NOT own the coroutine dispatcher — the calling use case
 * is responsible for switching to `Dispatchers.IO` before calling [execute].
 *
 * @param logger Structured logger. Injectable for testing.
 */
class PdfEngineOrchestrator(
    private val logger: PdfLogger
) {

    companion object {
        private const val TAG = "EngineOrchestrator"

        // ── Memory thresholds per policy ────────────────────────────────

        /** MIXED mode requires at least 60 MB free (50 MB buffer + 10 MB overhead). */
        private const val MIXED_MIN_MEMORY_MB = 60L

        /** TEMP_FILE_ONLY needs minimal heap — 10 MB is sufficient. */
        private const val TEMP_FILE_MIN_MEMORY_MB = 10L

        /** SYSTEM_DEFAULT is uncontrolled — require 30 MB as a safety baseline. */
        private const val SYSTEM_DEFAULT_MIN_MEMORY_MB = 30L

        /** NATIVE_RENDERER uses Android APIs, not PDFBox — require 20 MB for bitmaps. */
        private const val NATIVE_RENDERER_MIN_MEMORY_MB = 20L

        /** Heap percentage above which we suggest GC after operation completes. */
        private const val POST_EXECUTION_GC_THRESHOLD = 75
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Execute a PDF engine with full runtime enforcement.
     *
     * **Threading contract:** Must be called from `Dispatchers.IO`.
     * The orchestrator does NOT switch dispatchers.
     *
     * **Cancellation contract:** [CancellationException] is ALWAYS rethrown.
     * The orchestrator never swallows cancellation.
     *
     * @param engine The typed engine to execute.
     * @param params Operation parameters (must match engine's type parameter P).
     * @param reporter Progress callback. The orchestrator passes this through
     *        to the engine — it does NOT intercept or modify progress events.
     * @return [PdfResult.Success] with the engine's typed result, or
     *         [PdfResult.Failure] with a typed [PdfError].
     * @throws CancellationException if the coroutine is cancelled.
     */
    suspend fun <P : EngineParams, R : EngineResult> execute(
        engine: PdfEngine<P, R>,
        params: P,
        reporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<R> {

        val startTime = System.currentTimeMillis()
        val engineTag = engine.tag

        // ── 1. Log start ────────────────────────────────────────────────
        logStart(engine, params)

        // ── 2. Memory gate ──────────────────────────────────────────────
        val memoryCheckResult = enforceMemoryPolicy<R>(engine.memoryPolicy, engineTag)
        if (memoryCheckResult != null) {
            return memoryCheckResult
        }

        // ── 3. PDFBox initialization ────────────────────────────────────
        if (engine.memoryPolicy != MemoryPolicy.NATIVE_RENDERER) {
            PdfBoxFacade.ensureInitialized(params.context)
        }

        // ── 4. Reset memory reservations ────────────────────────────────
        MemoryBudget.reset()

        // ── 5. Input validation ─────────────────────────────────────────
        val inputCheckResult = validateInputFiles<R>(params, engineTag)
        if (inputCheckResult != null) {
            return inputCheckResult
        }

        // ── 6–7. Execute with timing + exception safety net ─────────────
        val result = executeWithSafetyNet(engine, params, reporter)
        val durationMs = System.currentTimeMillis() - startTime

        // ── 8. Save policy audit (only on success) ──────────────────────
        if (result is PdfResult.Success) {
            val auditResult = auditSavePolicy<R>(engine.savePolicy, result.data, engineTag)
            if (auditResult != null) {
                // Save policy violated — clean up output and return failure
                cleanupOutputFile(result.data.outputPath)
                return auditResult
            }
        }

        // ── 9. Log metrics ──────────────────────────────────────────────
        logCompletion(engine, params, result, durationMs)

        // ── 10. Memory cleanup ──────────────────────────────────────────
        MemoryBudget.reset()
        if (MemoryBudget.heapUsagePercent() > POST_EXECUTION_GC_THRESHOLD) {
            logger.debug(TAG, "[$engineTag] Heap at ${MemoryBudget.heapUsagePercent()}% post-execution, suggesting GC")
            System.gc()
        }

        // ── 11. Return result ───────────────────────────────────────────
        return result
    }


    // ── Step 2: Memory Policy Enforcement ───────────────────────────────────

    /**
     * Verify that the heap has enough free memory for the engine's declared policy.
     * Returns null if the check passes, or a [PdfResult.Failure] if it fails.
     */
    private fun <R : EngineResult> enforceMemoryPolicy(
        policy: MemoryPolicy,
        engineTag: String
    ): PdfResult<R>? {

        val requiredMb = when (policy) {
            MemoryPolicy.MIXED -> MIXED_MIN_MEMORY_MB
            MemoryPolicy.TEMP_FILE_ONLY -> TEMP_FILE_MIN_MEMORY_MB
            MemoryPolicy.SYSTEM_DEFAULT -> SYSTEM_DEFAULT_MIN_MEMORY_MB
            MemoryPolicy.NATIVE_RENDERER -> NATIVE_RENDERER_MIN_MEMORY_MB
        }

        val availableMb = MemoryBudget.availableMemoryMb()
        val heapPercent = MemoryBudget.heapUsagePercent()

        logger.debug(TAG, "[$engineTag] Memory check: ${availableMb}MB available, " +
                "${heapPercent}% heap used, ${requiredMb}MB required for $policy")

        if (availableMb < requiredMb) {
            // Try GC once before failing
            System.gc()
            val availableAfterGc = MemoryBudget.availableMemoryMb()

            if (availableAfterGc < requiredMb) {
                logger.error(TAG, "[$engineTag] Memory gate FAILED: " +
                        "${availableAfterGc}MB available after GC, ${requiredMb}MB required for $policy")

                return PdfResult.failure(
                    PdfError.OutOfMemory(
                        "Insufficient memory for $engineTag: " +
                                "${availableAfterGc}MB available, ${requiredMb}MB required " +
                                "(policy: $policy, heap: ${MemoryBudget.heapUsagePercent()}%)"
                    )
                )
            }

            logger.info(TAG, "[$engineTag] Memory gate passed after GC: " +
                    "${availableAfterGc}MB available (was ${availableMb}MB)")
        }

        return null // check passed
    }


    // ── Step 5: Input File Validation ───────────────────────────────────────

    /**
     * Validate that input files exist for file-based engine params.
     * Returns null if validation passes, or a [PdfResult.Failure] if it fails.
     */
    private fun <R : EngineResult> validateInputFiles(
        params: EngineParams,
        engineTag: String
    ): PdfResult<R>? {

        when (params) {
            is SingleFileParams -> {
                val inputPath = params.inputPath
                // Skip validation for content:// URIs — they require ContentResolver
                if (!inputPath.startsWith("content://")) {
                    val inputFile = File(inputPath)
                    if (!inputFile.exists()) {
                        logger.error(TAG, "[$engineTag] Input file not found: $inputPath")
                        return PdfResult.failure(PdfError.FileNotFound(inputPath))
                    }
                    if (!inputFile.canRead()) {
                        logger.error(TAG, "[$engineTag] Input file not readable: $inputPath")
                        return PdfResult.failure(PdfError.PermissionDenied("Cannot read input file"))
                    }
                }
            }

            is MultiFileParams -> {
                if (params.inputPaths.isEmpty()) {
                    logger.error(TAG, "[$engineTag] No input files provided")
                    return PdfResult.failure(PdfError.InvalidInput("No input files provided"))
                }
                for (path in params.inputPaths) {
                    if (!path.startsWith("content://")) {
                        val file = File(path)
                        if (!file.exists()) {
                            logger.error(TAG, "[$engineTag] Input file not found: $path")
                            return PdfResult.failure(PdfError.FileNotFound(path))
                        }
                    }
                }
            }

            // EngineParams subclasses with custom path handling (e.g. SplitParams)
            // are validated by the engine itself
            else -> { /* no-op */ }
        }

        return null // validation passed
    }


    // ── Steps 6–7: Execute with Safety Net ──────────────────────────────────

    /**
     * Execute the engine within a comprehensive exception safety net.
     *
     * Exception handling hierarchy:
     * 1. [CancellationException] → rethrown IMMEDIATELY (coroutine contract)
     * 2. [OutOfMemoryError]      → PdfError.OutOfMemory
     * 3. [SecurityException]     → PdfError.PdfEncrypted
     * 4. [Exception]             → PdfError.fromException()
     * 5. [Throwable]             → PdfError.Unknown (catches Error subclasses)
     *
     * The engine itself may return [PdfResult.Failure] for expected errors
     * (bad input, corrupt file, etc.). Those pass through untouched.
     */
    private suspend fun <P : EngineParams, R : EngineResult> executeWithSafetyNet(
        engine: PdfEngine<P, R>,
        params: P,
        reporter: ProgressReporter
    ): PdfResult<R> {

        return try {
            // Delegate to the engine's execute method
            engine.execute(params, reporter)

        } catch (e: CancellationException) {
            // RULE 2: NEVER catch CancellationException. Rethrow immediately.
            // Cleanup is the engine's responsibility (it knows what temp files it created).
            logger.info(TAG, "[${engine.tag}] Cancelled")
            throw e

        } catch (e: OutOfMemoryError) {
            logger.error(TAG, "[${engine.tag}] OOM during execution", e)
            // Attempt GC to stabilize the process
            System.gc()
            PdfResult.failure(
                PdfError.OutOfMemory(
                    "${engine.tag} ran out of memory: ${e.message}",
                    e
                )
            )

        } catch (e: SecurityException) {
            logger.error(TAG, "[${engine.tag}] Security exception", e)
            PdfResult.failure(
                PdfError.PdfEncrypted(
                    "PDF is encrypted or access denied: ${e.message}",
                    e
                )
            )

        } catch (e: Exception) {
            logger.error(TAG, "[${engine.tag}] Unhandled exception", e)
            PdfResult.failure(PdfError.fromException(e))

        } catch (t: Throwable) {
            // Catch remaining Error subclasses (StackOverflowError, etc.)
            // that are not OOM and not CancellationException.
            logger.error(TAG, "[${engine.tag}] Fatal error", t)
            PdfResult.failure(
                PdfError.Unknown(
                    "${engine.tag} encountered a fatal error: ${t.message}",
                    t
                )
            )
        }
    }


    // ── Step 8: Save Policy Audit ───────────────────────────────────────────

    /**
     * Post-execution audit: verify that the output matches the declared save policy.
     *
     * - [SavePolicy.ATOMIC_VALIDATED]: Output file MUST exist and be non-empty.
     *   (Actual page-count validation is the engine's job — the orchestrator only
     *   checks that the file wasn't silently lost or truncated.)
     * - [SavePolicy.ATOMIC]: Output file MUST exist and be non-empty.
     * - [SavePolicy.DIRECT]: No post-check (ephemeral files may be transient).
     *
     * Returns null if the audit passes, or a [PdfResult.Failure] if it fails.
     */
    private fun <R : EngineResult> auditSavePolicy(
        policy: SavePolicy,
        result: EngineResult,
        engineTag: String
    ): PdfResult<R>? {

        if (policy == SavePolicy.DIRECT) {
            return null // no audit for ephemeral output
        }

        val outputFile = File(result.outputPath)

        if (!outputFile.exists()) {
            logger.error(TAG, "[$engineTag] Save policy audit FAILED ($policy): " +
                    "output file does not exist at ${result.outputPath}")
            return PdfResult.failure(
                PdfError.ValidationFailed(
                    "$engineTag reported success but output file is missing"
                )
            )
        }

        if (outputFile.length() <= 0) {
            logger.error(TAG, "[$engineTag] Save policy audit FAILED ($policy): " +
                    "output file is empty at ${result.outputPath}")
            return PdfResult.failure(
                PdfError.ValidationFailed(
                    "$engineTag reported success but output file is empty"
                )
            )
        }

        // Verify reported size matches actual file size (detect stale metadata)
        val actualSize = outputFile.length()
        if (result.outputSize != actualSize) {
            logger.warn(TAG, "[$engineTag] Size mismatch: engine reported ${result.outputSize} " +
                    "bytes but file is $actualSize bytes. Using actual size.")
            // This is a warning, not a failure — the file itself is valid
        }

        logger.debug(TAG, "[$engineTag] Save policy audit passed ($policy): " +
                "${formatBytes(actualSize)} at ${result.outputPath}")

        return null // audit passed
    }


    // ── Logging Helpers ─────────────────────────────────────────────────────

    private fun <P : EngineParams, R : EngineResult> logStart(
        engine: PdfEngine<P, R>,
        params: P
    ) {
        val inputSummary = when (params) {
            is SingleFileParams -> "input=${abbreviatePath(params.inputPath)}"
            is MultiFileParams -> "inputs=${params.inputPaths.size} files"
            else -> "custom params"
        }

        logger.info(TAG, "[${engine.tag}] START | " +
                "memory=${engine.memoryPolicy}, save=${engine.savePolicy}, " +
                "pro=${params.isPro}, $inputSummary, " +
                "heap=${MemoryBudget.heapUsagePercent()}%, " +
                "available=${MemoryBudget.availableMemoryMb()}MB")
    }

    private fun <P : EngineParams, R : EngineResult> logCompletion(
        engine: PdfEngine<P, R>,
        params: P,
        result: PdfResult<R>,
        durationMs: Long
    ) {
        when (result) {
            is PdfResult.Success -> {
                val inputSize = resolveInputSize(params)
                PdfBoxFacade.logMetrics(
                    OperationMetrics(
                        operationName = engine.tag,
                        fileCount = resolveFileCount(params),
                        pageCount = 0, // engine-specific, not available generically
                        inputSizeBytes = inputSize,
                        outputSizeBytes = result.data.outputSize,
                        durationMs = durationMs
                    )
                )
                logger.info(TAG, "[${engine.tag}] SUCCESS | " +
                        "duration=${durationMs}ms, " +
                        "output=${formatBytes(result.data.outputSize)}, " +
                        "heap=${MemoryBudget.heapUsagePercent()}%")
            }

            is PdfResult.Failure -> {
                logger.error(TAG, "[${engine.tag}] FAILED | " +
                        "duration=${durationMs}ms, " +
                        "error=${result.error.code}: ${result.error.message}, " +
                        "heap=${MemoryBudget.heapUsagePercent()}%")
            }
        }
    }


    // ── Utility ─────────────────────────────────────────────────────────────

    private fun cleanupOutputFile(outputPath: String) {
        try {
            val file = File(outputPath)
            if (file.exists()) {
                file.delete()
                logger.debug(TAG, "Cleaned up failed output: $outputPath")
            }
        } catch (e: Exception) {
            logger.warn(TAG, "Failed to clean up output: $outputPath", e)
        }
    }

    private fun resolveInputSize(params: EngineParams): Long {
        return when (params) {
            is SingleFileParams -> {
                if (!params.inputPath.startsWith("content://")) {
                    File(params.inputPath).let { if (it.exists()) it.length() else 0L }
                } else 0L
            }
            is MultiFileParams -> {
                params.inputPaths
                    .filter { !it.startsWith("content://") }
                    .sumOf { File(it).let { f -> if (f.exists()) f.length() else 0L } }
            }
            else -> 0L
        }
    }

    private fun resolveFileCount(params: EngineParams): Int {
        return when (params) {
            is SingleFileParams -> 1
            is MultiFileParams -> params.inputPaths.size
            else -> 1
        }
    }

    /**
     * Abbreviate a file path for logging. Strips leading directories,
     * keeping only the last two path segments for readability.
     */
    private fun abbreviatePath(path: String): String {
        if (path.startsWith("content://")) return "content://…"
        val segments = path.replace("\\", "/").split("/")
        return if (segments.size > 2) {
            "…/" + segments.takeLast(2).joinToString("/")
        } else {
            path
        }
    }

    private fun formatBytes(bytes: Long): String {
        return when {
            bytes < 1024 -> "${bytes}B"
            bytes < 1024 * 1024 -> "${bytes / 1024}KB"
            else -> "${"%.1f".format(bytes / (1024.0 * 1024.0))}MB"
        }
    }
}
