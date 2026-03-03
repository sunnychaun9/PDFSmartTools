package com.pdfsmarttools.pdfcore.engine

import android.content.Context
import com.pdfsmarttools.pdfcore.model.CompressionLevel
import com.pdfsmarttools.pdfcore.model.PageRange

// ─────────────────────────────────────────────────────────────────────────────
// ALL ENGINE OPERATIONS — params, results, and typed aliases
// ─────────────────────────────────────────────────────────────────────────────
//
// Each operation defines:
//   1. XxxParams   : EngineParams   — everything the engine needs to execute
//   2. XxxResult   : EngineResult   — everything the engine returns on success
//   3. XxxEngine   = PdfEngine<XxxParams, XxxResult>  — typed alias
//
// Engines implement one alias. Use cases accept the same alias.
// The type system prevents passing CompressParams to a MergeEngine.
//
// ─────────────────────────────────────────────────────────────────────────────


// ════════════════════════════════════════════════════════════════════════════
// COMPRESS
// ════════════════════════════════════════════════════════════════════════════

data class CompressParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean,
    /** Compression quality. Determines JPEG recompression quality for images. */
    val level: CompressionLevel
) : SingleFileParams

data class CompressResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Original file size in bytes. */
    val originalSize: Long,
    /** Compression ratio: 1.0 - (compressed / original). Range [0.0, 1.0]. */
    val compressionRatio: Double,
    /** Total number of pages in the output PDF. */
    val pageCount: Int
) : EngineResult

/** Engine that compresses a PDF by recompressing embedded images. */
typealias CompressEngine = PdfEngine<CompressParams, CompressResult>


// ════════════════════════════════════════════════════════════════════════════
// MERGE
// ════════════════════════════════════════════════════════════════════════════

data class MergeParams(
    override val context: Context,
    override val inputPaths: List<String>,
    override val outputPath: String,
    override val isPro: Boolean
) : MultiFileParams

data class MergeResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Total pages across all merged files. */
    val totalPages: Int,
    /** Number of input files that were merged. */
    val fileCount: Int
) : EngineResult

/** Engine that merges multiple PDFs into a single document. */
typealias MergeEngine = PdfEngine<MergeParams, MergeResult>


// ════════════════════════════════════════════════════════════════════════════
// SPLIT
// ════════════════════════════════════════════════════════════════════════════

data class SplitParams(
    override val context: Context,
    override val isPro: Boolean,
    /** Path to the source PDF. */
    val inputPath: String,
    /** Directory where split files will be written. */
    val outputDir: String,
    /** Base name for output files (e.g., "document" → "document_p1-3.pdf"). */
    val baseName: String,
    /** Page ranges to extract. Each range becomes one output file. */
    val pageRanges: List<PageRange>
) : EngineParams

data class SplitOutputFile(
    val path: String,
    val fileName: String,
    val range: PageRange,
    val pageCount: Int,
    val fileSize: Long
)

data class SplitResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Individual output files with their metadata. */
    val outputFiles: List<SplitOutputFile>,
    /** Total number of files created. */
    val totalFilesCreated: Int,
    /** Page count of the source document. */
    val sourcePageCount: Int
) : EngineResult

/** Engine that splits a PDF into multiple files by page ranges. */
typealias SplitEngine = PdfEngine<SplitParams, SplitResult>


// ════════════════════════════════════════════════════════════════════════════
// PROTECT (encrypt)
// ════════════════════════════════════════════════════════════════════════════

data class ProtectParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean,
    /** User password for opening the PDF. Must be ≥ 6 characters. */
    val password: String
) : SingleFileParams

data class ProtectResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Original file size before encryption. */
    val originalSize: Long,
    /** Page count of the encrypted PDF. */
    val pageCount: Int
) : EngineResult

/** Engine that encrypts a PDF with AES-256 password protection. */
typealias ProtectEngine = PdfEngine<ProtectParams, ProtectResult>


// ════════════════════════════════════════════════════════════════════════════
// UNLOCK (decrypt)
// ════════════════════════════════════════════════════════════════════════════

data class UnlockParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean,
    /** Password to unlock the PDF. */
    val password: String
) : SingleFileParams

data class UnlockResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Original encrypted file size. */
    val originalSize: Long,
    /** Page count of the unlocked PDF. */
    val pageCount: Int
) : EngineResult

/** Engine that removes password protection from a PDF. */
typealias UnlockEngine = PdfEngine<UnlockParams, UnlockResult>


// ════════════════════════════════════════════════════════════════════════════
// SIGN
// ════════════════════════════════════════════════════════════════════════════

data class SignParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean,
    /** Base64-encoded signature image (PNG with transparency). */
    val signatureBase64: String,
    /** 0-indexed page number to place the signature on. */
    val pageNumber: Int,
    /** X position in Android coordinate space (top-left origin). */
    val positionX: Float,
    /** Y position in Android coordinate space (top-left origin). */
    val positionY: Float,
    /** Signature width in PDF points. */
    val signatureWidth: Float,
    /** Signature height in PDF points. */
    val signatureHeight: Float
) : SingleFileParams

data class SignResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Total pages in the signed PDF. */
    val pageCount: Int,
    /** 0-indexed page that received the signature. */
    val signedPage: Int
) : EngineResult

/** Engine that overlays a signature image onto a PDF page. */
typealias SignEngine = PdfEngine<SignParams, SignResult>


// ════════════════════════════════════════════════════════════════════════════
// PDF → IMAGE
// ════════════════════════════════════════════════════════════════════════════

data class PdfToImageParams(
    override val context: Context,
    override val isPro: Boolean,
    /** Path to the source PDF. */
    val inputPath: String,
    /** Directory where rendered images will be written. */
    val outputDir: String,
    /** Output format: "jpeg" or "png". */
    val format: String = "jpeg",
    /** JPEG quality (1-100). Ignored for PNG. */
    val quality: Int = 90,
    /** Maximum pixel dimension (width or height). Pages are scaled to fit. */
    val maxResolution: Int = 2048
) : EngineParams

data class PdfToImageResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Paths to all rendered images, one per page. */
    val imagePaths: List<String>,
    /** Number of pages rendered. */
    val pageCount: Int,
    /** Format used ("jpeg" or "png"). */
    val format: String
) : EngineResult

/** Engine that renders PDF pages to images using PdfRenderer. */
typealias PdfToImageEngine = PdfEngine<PdfToImageParams, PdfToImageResult>


// ════════════════════════════════════════════════════════════════════════════
// PDF → WORD
// ════════════════════════════════════════════════════════════════════════════

data class PdfToWordParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean,
    /** Whether to extract and embed images from the PDF. */
    val extractImages: Boolean = true
) : SingleFileParams

data class PdfToWordResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Number of PDF pages processed. */
    val pageCount: Int,
    /** Approximate word count in the extracted text. */
    val wordCount: Int
) : EngineResult

/** Engine that extracts text from PDF into a Word document. */
typealias PdfToWordEngine = PdfEngine<PdfToWordParams, PdfToWordResult>


// ════════════════════════════════════════════════════════════════════════════
// WORD → PDF
// ════════════════════════════════════════════════════════════════════════════

data class WordToPdfParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean
) : SingleFileParams

data class WordToPdfResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Number of pages in the generated PDF. */
    val pageCount: Int
) : EngineResult

/** Engine that converts a Word document (.doc/.docx) to PDF. */
typealias WordToPdfEngine = PdfEngine<WordToPdfParams, WordToPdfResult>


// ════════════════════════════════════════════════════════════════════════════
// OCR (scanned PDF → searchable PDF)
// ════════════════════════════════════════════════════════════════════════════

data class OcrParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean
) : SingleFileParams

data class OcrResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Number of pages processed. */
    val pageCount: Int,
    /** Total characters recognized across all pages. */
    val characterCount: Int,
    /** Total words recognized across all pages. */
    val wordCount: Int,
    /** Average OCR confidence (0.0 – 1.0). */
    val averageConfidence: Float,
    /** Total processing time in milliseconds. */
    val processingTimeMs: Long
) : EngineResult

/** Engine that runs OCR on a scanned PDF and produces a searchable PDF. */
typealias OcrEngine = PdfEngine<OcrParams, OcrResult>


// ════════════════════════════════════════════════════════════════════════════
// SCAN (images → PDF)
// ════════════════════════════════════════════════════════════════════════════

data class ScanParams(
    override val context: Context,
    override val inputPaths: List<String>,
    override val outputPath: String,
    override val isPro: Boolean
) : MultiFileParams

data class ScanResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Number of pages created (one per input image). */
    val pageCount: Int
) : EngineResult

/** Engine that converts scanned images into a single PDF document. */
typealias ScanEngine = PdfEngine<ScanParams, ScanResult>


// ════════════════════════════════════════════════════════════════════════════
// PAGE MANAGEMENT (reorder, rotate, delete)
// ════════════════════════════════════════════════════════════════════════════

/**
 * A single page operation within a page management batch.
 */
sealed class PageOperation {
    /** Keep this page in the output (with optional rotation). */
    data class Keep(val sourcePageIndex: Int, val rotationDegrees: Int = 0) : PageOperation()
    /** Delete this page (exclude from output). Represented by omission from the list. */
}

data class PageManageParams(
    override val context: Context,
    override val inputPath: String,
    override val outputPath: String,
    override val isPro: Boolean,
    /** Ordered list of page operations. Output page order matches list order. */
    val operations: List<PageOperation>
) : SingleFileParams

data class PageManageResult(
    override val outputPath: String,
    override val outputSize: Long,
    /** Number of pages in the output PDF. */
    val outputPageCount: Int,
    /** Number of pages in the source PDF. */
    val sourcePageCount: Int
) : EngineResult

/** Engine that reorders, rotates, and deletes pages in a PDF. */
typealias PageManageEngine = PdfEngine<PageManageParams, PageManageResult>
