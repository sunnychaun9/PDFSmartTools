package com.pdfsmarttools.pdfcore.api

import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.pdfcore.model.CompressionLevel
import com.pdfsmarttools.pdfcore.model.PageRange

/**
 * Service interface for PDF manipulation operations:
 * compress, merge, split, protect, unlock, and page management.
 */
interface PdfManipulationService {

    // --- Compression ---

    data class CompressionOptions(
        val inputPath: String,
        val outputPath: String,
        val level: CompressionLevel,
        val isPro: Boolean = false
    )

    data class CompressionResult(
        val outputPath: String,
        val originalSize: Long,
        val compressedSize: Long,
        val compressionRatio: Double,
        val pageCount: Int
    )

    suspend fun compressPdf(
        options: CompressionOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<CompressionResult>

    // --- Merge ---

    data class MergeOptions(
        val inputPaths: List<String>,
        val outputPath: String,
        val isPro: Boolean = false
    )

    data class MergeResult(
        val outputPath: String,
        val totalPages: Int,
        val fileCount: Int,
        val outputSize: Long
    )

    suspend fun mergePdfs(
        options: MergeOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<MergeResult>

    // --- Split ---

    data class SplitOptions(
        val inputPath: String,
        val outputDir: String,
        val baseName: String,
        val pageRanges: List<PageRange>,
        val isPro: Boolean = false
    )

    data class SplitOutputFile(
        val path: String,
        val fileName: String,
        val range: String,
        val pageCount: Int,
        val fileSize: Long
    )

    data class SplitResult(
        val outputFiles: List<SplitOutputFile>,
        val totalFilesCreated: Int,
        val sourcePageCount: Int
    )

    suspend fun splitPdf(
        options: SplitOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<SplitResult>

    // --- Extract page ---

    data class ExtractPageOptions(
        val inputPath: String,
        val outputPath: String,
        val pageNumber: Int,
        val isPro: Boolean = false
    )

    data class ExtractResult(
        val outputPath: String,
        val pageNumber: Int,
        val fileSize: Long
    )

    suspend fun extractPage(
        options: ExtractPageOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<ExtractResult>

    // --- Protect ---

    data class ProtectOptions(
        val inputPath: String,
        val outputPath: String,
        val password: String,
        val isPro: Boolean = false
    )

    data class ProtectResult(
        val outputPath: String,
        val originalSize: Long,
        val protectedSize: Long,
        val pageCount: Int
    )

    suspend fun protectPdf(
        options: ProtectOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<ProtectResult>

    // --- Unlock ---

    data class UnlockOptions(
        val inputPath: String,
        val outputPath: String,
        val password: String
    )

    data class UnlockResult(
        val outputPath: String,
        val originalSize: Long,
        val unlockedSize: Long,
        val pageCount: Int
    )

    suspend fun unlockPdf(
        options: UnlockOptions,
        progressReporter: ProgressReporter = ProgressReporter.NOOP
    ): PdfResult<UnlockResult>

    // --- Page Management ---

    data class PageInfo(
        val pageNumber: Int,
        val width: Int,
        val height: Int
    )

    suspend fun getPageInfo(inputPath: String): PdfResult<List<PageInfo>>

    suspend fun getPageCount(inputPath: String): PdfResult<Int>
}
