package com.pdfsmarttools.manipulate.merge

import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfError
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.pdfcore.DefaultFileResolver
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.pdfsmarttools.pdfcore.engine.MergeEngine
import com.pdfsmarttools.pdfcore.engine.MergeParams
import com.pdfsmarttools.pdfcore.engine.MergeResult
import com.pdfsmarttools.pdfcore.engine.MemoryPolicy
import com.pdfsmarttools.pdfcore.engine.SavePolicy
import java.io.File
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.ensureActive

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE IMPLEMENTATION: StrictMergeEngine
// ─────────────────────────────────────────────────────────────────────────────
//
// This engine demonstrates full compliance with the PdfEngine contract.
// Every rule from the KDoc is annotated with a [RULE N] comment below.
//
// Architecture position:
//   PdfMergerModule (bridge) → MergePdfsUseCase → **StrictMergeEngine** → PdfBoxFacade
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merges multiple PDF files into a single document.
 *
 * - Uses structural page import (preserves text layers and metadata)
 * - Applies watermark for free users
 * - Cancellation-aware at page boundaries
 * - Atomic save with validation
 *
 * Implements [MergeEngine] (= `PdfEngine<MergeParams, MergeResult>`).
 */
class StrictMergeEngine : MergeEngine {

    // ── Contract declarations ────────────────────────────────────────────

    override val tag: String = "MergeEngine"

    /**
     * [RULE 3 — Memory Policy]
     * Merge uses MIXED mode: 50 MB RAM buffer with temp-file overflow.
     * This is correct because merge reads and writes full page content.
     */
    override val memoryPolicy: MemoryPolicy = MemoryPolicy.MIXED

    /**
     * [RULE 4 — Save Policy]
     * PDF output requires ATOMIC_VALIDATED: temp file → validate → rename.
     */
    override val savePolicy: SavePolicy = SavePolicy.ATOMIC_VALIDATED

    // ── Main execution ───────────────────────────────────────────────────

    /**
     * [RULE 1 — Threading]
     * This suspend function MUST be called from Dispatchers.IO.
     * It does not switch dispatchers internally because all work is I/O-bound
     * (loading PDFBox documents, importing pages, saving).
     */
    override suspend fun execute(
        params: MergeParams,
        reporter: ProgressReporter
    ): PdfResult<MergeResult> {

        // ── Input validation (fail fast, before any I/O) ─────────────
        if (params.inputPaths.size < 2) {
            return PdfResult.failure(
                PdfError.InvalidInput("At least 2 PDF files are required for merging")
            )
        }
        if (params.outputPath.isBlank()) {
            return PdfResult.failure(
                PdfError.InvalidInput("Output path must not be blank")
            )
        }

        val startTime = System.currentTimeMillis()

        // [RULE 3] Initialize PDFBox through the facade
        PdfBoxFacade.ensureInitialized(params.context)

        val outputFile = File(params.outputPath)
        // [RULE 4] Create parent directories before writing
        outputFile.parentFile?.mkdirs()

        val fileResolver = DefaultFileResolver(params.context)
        val resolvedFiles = mutableListOf<File>()
        val cacheFiles = mutableListOf<File>()

        // ── Resolve all input paths ──────────────────────────────────
        for (path in params.inputPaths) {
            val resolved = fileResolver.resolveInputFile(path, "merge")
            if (!resolved.exists()) {
                return PdfResult.failure(PdfError.FileNotFound(path))
            }
            resolvedFiles.add(resolved)
            if (fileResolver.isCacheFile(path)) {
                cacheFiles.add(resolved)
            }
        }

        // ── Core operation wrapped in PdfResult.runCatching ──────────
        // [RULE 5 — Error Handling]
        // PdfResult.runCatching automatically:
        //   - Rethrows CancellationException (RULE 2)
        //   - Maps OutOfMemoryError → PdfError.OutOfMemory
        //   - Maps SecurityException → PdfError.PdfEncrypted
        //   - Maps other exceptions via PdfError.fromException
        val result = PdfResult.runCatching {
            doMerge(params, resolvedFiles, outputFile, reporter, startTime)
        }

        // ── Cleanup ──────────────────────────────────────────────────
        // Always clean up cache files (content:// URI copies) regardless of outcome
        cacheFiles.forEach { it.delete() }

        // [RULE 4] On failure, delete partial output
        if (result is PdfResult.Failure) {
            outputFile.delete()
        }

        return result
    }

    // ── Private implementation ────────────────────────────────────────────

    private suspend fun doMerge(
        params: MergeParams,
        resolvedFiles: List<File>,
        outputFile: File,
        reporter: ProgressReporter,
        startTime: Long
    ): MergeResult {

        val fileCount = resolvedFiles.size
        var totalPageCount = 0
        var totalInputSize = 0L

        resolvedFiles.forEach { totalInputSize += it.length() }

        // [RULE 3] Load document through PdfBoxFacade with declared MIXED policy
        PdfBoxFacade.createDocument().use { outputDoc ->

            for ((fileIndex, inputFile) in resolvedFiles.withIndex()) {

                // [RULE 2 — Cancellation] Check at file boundary
                coroutineContext.ensureActive()

                // [RULE 3] Every document load goes through the facade
                PdfBoxFacade.loadDocument(inputFile).use { sourceDoc ->
                    val sourcePageCount = sourceDoc.numberOfPages

                    for (pageIndex in 0 until sourcePageCount) {
                        // [RULE 2] Check at EVERY page boundary
                        coroutineContext.ensureActive()

                        val importedPage = outputDoc.importPage(sourceDoc.getPage(pageIndex))

                        // [RULE 7 — Watermark] Free users get watermarked pages
                        if (!params.isPro) {
                            PdfBoxFacade.addWatermarkToPage(outputDoc, importedPage)
                        }

                        totalPageCount++

                        // [RULE 6 — Progress] Report at page boundaries, values in [0, 100]
                        val progress = ((totalPageCount * 80) / maxPageEstimate(resolvedFiles))
                            .coerceIn(0, 80)
                        reporter.onProgress(
                            progress,
                            fileIndex + 1,
                            fileCount,
                            "Merging file ${fileIndex + 1} of $fileCount"
                        )
                    }
                }

                // [RULE 3] Check memory after processing each file and GC if needed
                if (MemoryBudget.heapUsagePercent() > 80) {
                    Log.d(tag, "Heap at ${MemoryBudget.heapUsagePercent()}% after file ${fileIndex + 1}, requesting GC")
                    System.gc()
                }
            }

            // ── Save phase ───────────────────────────────────────────

            reporter.onStage(85, "Saving merged document...")

            // [RULE 4 — ATOMIC_VALIDATED] Step 1: Atomic save (temp file → rename)
            PdfBoxFacade.atomicSave(outputDoc, outputFile)

            reporter.onStage(95, "Validating output...")

            // [RULE 4 — ATOMIC_VALIDATED] Step 2: Validate by reopening
            val validation = PdfBoxFacade.validateOutput(outputFile, totalPageCount)
            if (!validation.valid) {
                // [RULE 4] Delete invalid output
                outputFile.delete()
                throw IllegalStateException(
                    "Output validation failed: ${validation.errorMessage}"
                )
            }
        }

        // ── Build result ─────────────────────────────────────────────

        val outputSize = outputFile.length()

        // Log metrics for performance monitoring
        PdfBoxFacade.logMetrics(
            OperationMetrics(
                operationName = "merge",
                fileCount = fileCount,
                pageCount = totalPageCount,
                inputSizeBytes = totalInputSize,
                outputSizeBytes = outputSize,
                durationMs = System.currentTimeMillis() - startTime
            )
        )

        // [RULE 6] Report completion before returning success
        reporter.onComplete("Merged $fileCount files ($totalPageCount pages)")

        return MergeResult(
            outputPath = outputFile.absolutePath,
            outputSize = outputSize,
            totalPages = totalPageCount,
            fileCount = fileCount
        )
    }

    /**
     * Estimate total pages across all input files for accurate progress reporting.
     * Uses temp-file-only loading to minimize memory impact.
     * Falls back to file count × 10 if page counting fails.
     */
    private fun maxPageEstimate(files: List<File>): Int {
        var estimate = 0
        for (file in files) {
            estimate += try {
                PdfBoxFacade.loadDocumentTempFileOnly(file).use { it.numberOfPages }
            } catch (_: Exception) {
                10 // conservative fallback
            }
        }
        return estimate.coerceAtLeast(1)
    }
}
