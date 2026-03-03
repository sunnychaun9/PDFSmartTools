package com.pdfsmarttools.pdfcore.engine

import android.content.Context
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult

// ─────────────────────────────────────────────────────────────────────────────
// PdfEngine<P, R> — THE STRICT ENGINE CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
//
// Every PDF engine MUST implement this interface. The generic parameters
// enforce type safety between operation input (P) and output (R).
//
// Architecture position:
//   Bridge Module → UseCase → **PdfEngine** → PdfBoxFacade → PDFBox
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * # Strict Engine Contract
 *
 * All PDF engines conform to this typed interface. The contract enforces
 * rules for threading, cancellation, memory, output safety, error handling,
 * and progress reporting. Violating any rule is a bug.
 *
 * ## 1. Threading Constraints
 *
 * - [execute] **MUST** be called from [kotlinx.coroutines.Dispatchers.IO]
 *   or an equivalent I/O dispatcher provided by [DispatcherProvider.io].
 *   The caller (use case) owns the dispatcher — engines do NOT switch
 *   dispatchers for top-level I/O work.
 *
 * - CPU-bound sub-tasks (bitmap compression, text extraction, parallel
 *   image resampling) **SHOULD** use [kotlinx.coroutines.Dispatchers.Default]
 *   via [kotlinx.coroutines.withContext] internally, then return to the
 *   caller's dispatcher.
 *
 * - Engines **MUST NEVER** switch to [kotlinx.coroutines.Dispatchers.Main].
 *   No engine touches the UI thread. Ever.
 *
 * - Parallel work **MUST** be bounded by [kotlinx.coroutines.sync.Semaphore]
 *   with concurrency ≤ [ParallelPageProcessor.defaultConcurrency()].
 *
 * ## 2. Coroutine Usage Rules
 *
 * - [execute] is a `suspend` function. Engines **MUST** be coroutine-aware.
 *
 * - Engines **MUST** call [kotlin.coroutines.coroutineContext.ensureActive]
 *   at every page boundary (after processing each page, before starting
 *   the next). For batch operations, check at every batch boundary.
 *
 * - Engines **MUST NOT** catch [kotlinx.coroutines.CancellationException].
 *   If a `try/catch(e: Exception)` block exists, [CancellationException]
 *   must be re-thrown explicitly:
 *   ```kotlin
 *   catch (e: Exception) {
 *       if (e is CancellationException) throw e
 *       // handle other exceptions
 *   }
 *   ```
 *   Prefer [PdfResult.runCatching] which handles this automatically.
 *
 * - On cancellation, engines **MUST** clean up partial output files
 *   before the exception propagates. Use `try/finally` or
 *   `catch(e: CancellationException) { cleanup(); throw e }`.
 *
 * ## 3. Memory-Safe Loading Policy
 *
 * - Engines **MUST** declare their [memoryPolicy] honestly (see [MemoryPolicy]).
 *
 * - Engines using PDFBox **MUST** load documents exclusively through
 *   [PdfBoxFacade]. Direct `PDDocument.load()` calls are forbidden.
 *
 * - The facade method must match the declared policy:
 *
 *   | MemoryPolicy          | Facade method                          |
 *   |-----------------------|----------------------------------------|
 *   | [MemoryPolicy.MIXED]  | `PdfBoxFacade.loadDocument(file, 50L)` |
 *   | [MemoryPolicy.TEMP_FILE_ONLY] | `PdfBoxFacade.loadDocumentTempFileOnly(file)` |
 *   | [MemoryPolicy.SYSTEM_DEFAULT] | `PdfBoxFacade.loadDocumentDefault(file)` |
 *   | [MemoryPolicy.NATIVE_RENDERER] | N/A — engine uses `PdfRenderer`    |
 *
 * - Before allocating bitmaps, engines **MUST** check
 *   [MemoryBudget.canAllocateBitmap] or [MemoryBudget.availableBytes].
 *
 * - Bitmaps **MUST** be recycled immediately after use in a `try/finally` block.
 *
 * - For input files > 100 MB, engines **SHOULD** use chunked processing:
 *   load a subset of pages, process, release, repeat.
 *
 * - After processing a batch of pages, engines **SHOULD** call
 *   [ParallelPageProcessor.checkMemoryAndGc] with threshold 0.80.
 *
 * ## 4. Safe Save Strategy
 *
 * - Engines **MUST** follow their declared [savePolicy] (see [SavePolicy]).
 *
 * - For [SavePolicy.ATOMIC_VALIDATED] (required for all PDF output):
 *   1. Write to a temp file via [PdfBoxFacade.atomicSave]
 *   2. Validate via [PdfBoxFacade.validateOutput] (reopens and checks page count)
 *   3. If validation fails, delete output and return [PdfError.ValidationFailed]
 *
 * - For [SavePolicy.ATOMIC] (non-PDF output like images, .docx):
 *   1. Write to a temp file in the same directory
 *   2. Rename to final path (atomic on same filesystem)
 *   3. Fallback: copy + delete if rename fails (cross-filesystem)
 *
 * - On **ANY** exception (including cancellation), engines **MUST** delete
 *   partial output files in `catch` or `finally` blocks. No orphaned temp files.
 *
 * - Parent directories **MUST** be created before writing:
 *   `outputFile.parentFile?.mkdirs()`
 *
 * ## 5. Error Handling
 *
 * - Engines **MUST** return [PdfResult.Failure] for recoverable errors
 *   (bad input, corrupt file, wrong password, validation failure).
 *
 * - Engines **MUST** rethrow [CancellationException] (see rule 2 above).
 *
 * - Engines **SHOULD** use [PdfResult.runCatching] to wrap the main
 *   operation body. It automatically:
 *   - Rethrows [CancellationException]
 *   - Maps [OutOfMemoryError] → [PdfError.OutOfMemory]
 *   - Maps [SecurityException] → [PdfError.PdfEncrypted]
 *   - Maps other exceptions via [PdfError.fromException]
 *
 * - Engines **MUST NOT** swallow exceptions silently. Individual page/image
 *   failures may be logged and skipped (e.g., a corrupt image in a page),
 *   but the overall operation must still report success or failure.
 *
 * ## 6. Progress Reporting
 *
 * - Engines **MUST** report progress through the provided [ProgressReporter].
 *
 * - Progress values **MUST** be in `[0, 100]` range (clamped via `coerceIn`).
 *
 * - Engines **MUST** call [ProgressReporter.onComplete] before returning
 *   a [PdfResult.Success].
 *
 * - Progress callbacks **MUST NOT** throw exceptions. Wrap in try/catch
 *   internally if the reporter implementation might throw.
 *
 * - Engines **SHOULD** report at page boundaries for consistency.
 *
 * ## 7. Watermarking
 *
 * - If [EngineParams.isPro] is `false`, engines that produce PDF output
 *   **MUST** apply watermarks via [PdfBoxFacade.addWatermarkToPage].
 *
 * - Custom watermark implementations are forbidden. The facade ensures
 *   consistent appearance and APPEND mode (preserves text layers).
 */
interface PdfEngine<P : EngineParams, R : EngineResult> {

    /**
     * Unique tag for logging and metrics.
     * Convention: `"XxxEngine"` (e.g., `"MergeEngine"`, `"CompressEngine"`).
     */
    val tag: String

    /**
     * Memory loading strategy this engine uses for PDFBox documents.
     * Must match the actual `PdfBoxFacade.loadXxx()` call used inside [execute].
     */
    val memoryPolicy: MemoryPolicy

    /**
     * Output safety strategy this engine uses.
     * PDF output must use [SavePolicy.ATOMIC_VALIDATED].
     * Non-PDF output (images, .docx) must use [SavePolicy.ATOMIC].
     */
    val savePolicy: SavePolicy

    /**
     * Execute the engine operation.
     *
     * **Threading:** Must be called from `Dispatchers.IO`.
     * **Cancellation:** Checks `ensureActive()` at every page boundary.
     * **Memory:** Follows declared [memoryPolicy].
     * **Output:** Follows declared [savePolicy].
     *
     * @param params Operation-specific parameters (always includes context and isPro).
     * @param reporter Progress callback. Defaults to [ProgressReporter.NOOP].
     * @return [PdfResult.Success] with typed result, or [PdfResult.Failure] with typed error.
     * @throws kotlinx.coroutines.CancellationException if the coroutine is cancelled.
     */
    suspend fun execute(
        params: P,
        reporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<R>
}


// ─────────────────────────────────────────────────────────────────────────────
// BASE PARAM & RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base interface for all engine parameters.
 * Every operation needs Android Context (for PDFBox init and file resolution)
 * and a pro/free flag (for watermark and page-limit decisions).
 */
interface EngineParams {
    /** Android Context — required for PDFBox initialization and ContentResolver access. */
    val context: Context
    /** Whether the user has a Pro subscription. Controls watermarks and page limits. */
    val isPro: Boolean
}

/**
 * Convenience base for operations that take a single input file and produce a single output file.
 * Covers: compress, protect, unlock, sign, PDF-to-word, word-to-PDF, OCR.
 */
interface SingleFileParams : EngineParams {
    val inputPath: String
    val outputPath: String
}

/**
 * Base for operations that take multiple input files (merge, scan).
 */
interface MultiFileParams : EngineParams {
    val inputPaths: List<String>
    val outputPath: String
}

/**
 * Base interface for all engine results.
 * Every operation produces at least one output file with a known size.
 */
interface EngineResult {
    /** Primary output file path. */
    val outputPath: String
    /** Output file size in bytes. */
    val outputSize: Long
}

/**
 * Extended result for operations that split into multiple output files.
 */
interface MultiFileResult {
    /** All output file paths. */
    val outputPaths: List<String>
}


// ─────────────────────────────────────────────────────────────────────────────
// MEMORY POLICY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Declares how an engine loads PDFBox documents into memory.
 * Engines MUST declare the policy they actually use and MUST use the
 * corresponding [PdfBoxFacade] loading method.
 *
 * ## Policy selection guide
 *
 * ```
 * Does the engine use PDFBox?
 *   NO  → NATIVE_RENDERER (uses PdfRenderer or PdfDocument)
 *   YES → Does it modify page content (images, streams)?
 *           YES → MIXED (default, 50MB RAM + overflow to temp files)
 *           NO  → Does it only read metadata/page count?
 *                   YES → TEMP_FILE_ONLY (minimal heap footprint)
 *                   NO  → SYSTEM_DEFAULT (for simple load/save)
 * ```
 */
enum class MemoryPolicy {
    /**
     * Mixed mode: 50 MB RAM buffer with temp-file overflow.
     * The default for most engines that read and modify page content.
     * Maps to: `PdfBoxFacade.loadDocument(file, memoryBudgetMb = 50L)`
     */
    MIXED,

    /**
     * Temp-file only: near-zero heap usage.
     * For metadata reads, page counting, and large file pre-scans.
     * Maps to: `PdfBoxFacade.loadDocumentTempFileOnly(file)`
     */
    TEMP_FILE_ONLY,

    /**
     * System default: let PDFBox decide allocation.
     * For simple operations on small files where overhead doesn't matter.
     * Maps to: `PdfBoxFacade.loadDocumentDefault(file)`
     */
    SYSTEM_DEFAULT,

    /**
     * No PDFBox at all. Engine uses Android native APIs:
     * - `android.graphics.pdf.PdfRenderer` (rendering, thumbnails)
     * - `android.graphics.pdf.PdfDocument` (PDF creation)
     *
     * Engines with this policy MUST NOT import or reference PdfBoxFacade.
     */
    NATIVE_RENDERER
}


// ─────────────────────────────────────────────────────────────────────────────
// SAVE POLICY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Declares how an engine writes output files.
 *
 * All policies follow the same failure contract:
 * on ANY exception, partial/temp output files MUST be deleted.
 */
enum class SavePolicy {
    /**
     * **Required for all PDF output.**
     *
     * Three-step process:
     * 1. Write to temp file via [PdfBoxFacade.atomicSave]
     *    (writes to `.filename.tmp`, then renames atomically)
     * 2. Validate by reopening via [PdfBoxFacade.validateOutput]
     *    (checks page count matches expectation)
     * 3. If validation fails → delete output → return [PdfError.ValidationFailed]
     *
     * This prevents:
     * - Corrupt output from crashes mid-write
     * - Silent page loss from PDFBox serialization bugs
     * - Half-written files from cancelled operations
     */
    ATOMIC_VALIDATED,

    /**
     * Temp file + atomic rename, without PDF-specific validation.
     * For non-PDF output: images (JPEG/PNG), Word documents (.docx).
     *
     * Two-step process:
     * 1. Write to temp file in same directory
     * 2. Rename to final path (fallback: copy + delete for cross-filesystem)
     */
    ATOMIC,

    /**
     * Direct write with no atomicity guarantees.
     * **Only** for intermediate/ephemeral files: thumbnails, cache entries.
     * Never use for user-facing output.
     */
    DIRECT
}


// ─────────────────────────────────────────────────────────────────────────────
// ENGINE METADATA & METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured metrics emitted by engines after each operation.
 * Engines SHOULD log these via [PdfBoxFacade.logMetrics] on success.
 *
 * Reuses [com.pdfsmarttools.pdfcore.OperationMetrics] from PdfBoxFacade.
 */
typealias EngineMetrics = com.pdfsmarttools.pdfcore.OperationMetrics
