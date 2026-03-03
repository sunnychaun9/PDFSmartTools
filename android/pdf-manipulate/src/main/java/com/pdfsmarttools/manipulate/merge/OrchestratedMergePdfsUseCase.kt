package com.pdfsmarttools.manipulate.merge

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.pdfcore.engine.MergeEngine
import com.pdfsmarttools.pdfcore.engine.MergeParams
import com.pdfsmarttools.pdfcore.engine.MergeResult
import com.pdfsmarttools.pdfcore.engine.PdfEngineOrchestrator
import kotlinx.coroutines.withContext

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE: Orchestrated MergePdfs Use Case
// ─────────────────────────────────────────────────────────────────────────────
//
// Execution path through the system:
//
//   PdfMergerModule (RN bridge)
//       │
//       │  promise, reactContext
//       ▼
//   OrchestratedMergePdfsUseCase.invoke()
//       │
//       │  1. switches to Dispatchers.IO
//       │  2. validates domain rules (≥2 files, non-blank output)
//       │  3. builds typed MergeParams
//       │
//       ▼
//   PdfEngineOrchestrator.execute(mergeEngine, params, reporter)
//       │
//       │  • memory gate           (enforces MIXED ≥ 60MB free)
//       │  • PDFBox init           (ensureInitialized)
//       │  • input validation      (files exist)
//       │  • timing start          ─┐
//       │                           │
//       ▼                           │
//   StrictMergeEngine.execute(params, reporter)
//       │                           │
//       │  • resolve files          │
//       │  • structural merge       │  wall-clock
//       │  • watermark (free)       │  measured
//       │  • atomic save            │
//       │  • validate output        │
//       │                           │
//       ▼                           │
//   PdfEngineOrchestrator           │
//       │  • timing stop           ─┘
//       │  • save policy audit     (output exists, non-empty)
//       │  • log metrics           (duration, sizes, heap %)
//       │  • memory cleanup        (reset + GC if needed)
//       │
//       ▼
//   PdfResult<MergeResult>
//       │
//       ▼
//   PdfMergerModule (bridge)
//       │  onSuccess → promise.resolve(WritableMap)
//       │  onFailure → ErrorMapper.rejectPromise(promise, error)
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Use case that merges PDFs through the [PdfEngineOrchestrator].
 *
 * This use case owns:
 * - Dispatcher switching (to IO)
 * - Domain-level input validation (before the engine runs)
 * - Building typed [MergeParams] from raw arguments
 *
 * The orchestrator owns:
 * - Memory enforcement, timing, logging, exception safety, save audit
 *
 * The engine owns:
 * - PDFBox operations, page merging, watermarking, atomic save, validation
 *
 * @param engine A [MergeEngine] implementation (e.g., [StrictMergeEngine]).
 * @param orchestrator Shared orchestrator instance.
 * @param dispatchers Injectable dispatchers for testability.
 */
class OrchestratedMergePdfsUseCase(
    private val engine: MergeEngine,
    private val orchestrator: PdfEngineOrchestrator,
    private val dispatchers: DispatcherProvider
) {

    /**
     * Merge multiple PDF files into a single document.
     *
     * @param context Android context for PDFBox init and file resolution.
     * @param inputPaths Paths (file:// or content://) to input PDFs. Must be ≥ 2.
     * @param outputPath Destination path for the merged PDF.
     * @param isPro Whether the user has a Pro subscription (controls watermarks).
     * @param reporter Progress callback for UI updates.
     * @return [PdfResult.Success] with [MergeResult], or [PdfResult.Failure] with typed error.
     */
    suspend operator fun invoke(
        context: Context,
        inputPaths: List<String>,
        outputPath: String,
        isPro: Boolean,
        reporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<MergeResult> = withContext(dispatchers.io) {

        // ── Domain validation (use case responsibility) ─────────────────
        if (inputPaths.size < 2) {
            return@withContext PdfResult.failure(
                PdfError.InvalidInput("At least 2 PDF files are required for merging")
            )
        }
        if (outputPath.isBlank()) {
            return@withContext PdfResult.failure(
                PdfError.InvalidInput("Output path must not be blank")
            )
        }

        // ── Build typed params ──────────────────────────────────────────
        val params = MergeParams(
            context = context,
            inputPaths = inputPaths,
            outputPath = outputPath,
            isPro = isPro
        )

        // ── Delegate to orchestrator ────────────────────────────────────
        // The orchestrator handles:
        //   - Memory policy enforcement (MIXED: 60MB minimum)
        //   - PDFBox initialization
        //   - Input file existence checks
        //   - Exception safety net (OOM, Security, etc.)
        //   - Timing measurement
        //   - Save policy audit (output exists and non-empty)
        //   - Structured logging
        //   - Post-execution memory cleanup
        orchestrator.execute(engine, params, reporter)
    }
}
