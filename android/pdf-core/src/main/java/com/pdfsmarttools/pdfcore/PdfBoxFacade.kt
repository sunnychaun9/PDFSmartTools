package com.pdfsmarttools.pdfcore

import android.content.Context
import android.util.Log
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.tom_roush.pdfbox.util.Matrix
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Centralized PDFBox facade. This is the ONLY class in the project that
 * imports from com.tom_roush.pdfbox. All other modules must go through
 * this facade for PDFBox operations.
 */
object PdfBoxFacade {

    private const val TAG = "PdfBoxFacade"
    private val initialized = AtomicBoolean(false)

    /**
     * Thread-safe PDFBox initialization. Safe to call from multiple modules.
     */
    fun ensureInitialized(context: Context) {
        if (initialized.compareAndSet(false, true)) {
            PDFBoxResourceLoader.init(context.applicationContext)
            Log.d(TAG, "PDFBox initialized")
        }
    }

    /**
     * Load a PDDocument with mixed memory mode.
     * Caller is responsible for closing the document.
     */
    fun loadDocument(file: File, memoryBudgetMb: Long = 50L): PDDocument {
        return PDDocument.load(file, MemoryUsageSetting.setupMixed(memoryBudgetMb * 1024 * 1024))
    }

    /**
     * Load a PDDocument with password and mixed memory mode.
     */
    fun loadDocument(file: File, password: String, memoryBudgetMb: Long = 50L): PDDocument {
        return PDDocument.load(file, password, MemoryUsageSetting.setupMixed(memoryBudgetMb * 1024 * 1024))
    }

    /**
     * Load a PDDocument in temp-file-only mode (minimal heap usage for metadata reads).
     */
    fun loadDocumentTempFileOnly(file: File): PDDocument {
        return PDDocument.load(file, MemoryUsageSetting.setupTempFileOnly())
    }

    /**
     * Load a PDDocument with password using default loading.
     */
    fun loadDocumentDefault(file: File, password: String): PDDocument {
        return PDDocument.load(file, password)
    }

    /**
     * Load a PDDocument using default loading (no memory settings).
     */
    fun loadDocumentDefault(file: File): PDDocument {
        return PDDocument.load(file)
    }

    /**
     * Create a new empty PDDocument.
     */
    fun createDocument(): PDDocument {
        return PDDocument()
    }

    /**
     * Save a PDDocument atomically: write to temp file, then rename.
     * Prevents partial/corrupt output on crash or cancellation.
     */
    fun atomicSave(document: PDDocument, outputFile: File) {
        outputFile.parentFile?.mkdirs()
        val tempFile = File(outputFile.parentFile, ".${outputFile.name}.tmp")

        try {
            document.save(tempFile)

            if (!tempFile.renameTo(outputFile)) {
                // Fallback: copy and delete if rename fails (cross-filesystem)
                tempFile.copyTo(outputFile, overwrite = true)
                tempFile.delete()
            }
        } catch (e: Exception) {
            tempFile.delete()
            throw e
        }
    }

    /**
     * Validate output PDF by reopening and checking page count and file size.
     */
    fun validateOutput(outputFile: File, expectedPageCount: Int): ValidationResult {
        if (!outputFile.exists()) {
            return ValidationResult(
                valid = false,
                pageCount = 0,
                fileSize = 0,
                errorMessage = "Output file does not exist"
            )
        }

        val fileSize = outputFile.length()
        if (fileSize <= 0) {
            return ValidationResult(
                valid = false,
                pageCount = 0,
                fileSize = fileSize,
                errorMessage = "Output file is empty"
            )
        }

        return try {
            PDDocument.load(outputFile).use { doc ->
                val actualPages = doc.numberOfPages
                if (actualPages != expectedPageCount) {
                    ValidationResult(
                        valid = false,
                        pageCount = actualPages,
                        fileSize = fileSize,
                        errorMessage = "Expected $expectedPageCount pages but got $actualPages"
                    )
                } else {
                    ValidationResult(
                        valid = true,
                        pageCount = actualPages,
                        fileSize = fileSize,
                        errorMessage = null
                    )
                }
            }
        } catch (e: Exception) {
            ValidationResult(
                valid = false,
                pageCount = 0,
                fileSize = fileSize,
                errorMessage = "Failed to reopen output PDF: ${e.message}"
            )
        }
    }

    /**
     * Add a semi-transparent watermark to a page using PDFBox content streams.
     * Preserves existing page content (unlike bitmap drawing).
     */
    fun addWatermarkToPage(document: PDDocument, page: PDPage) {
        val mediaBox = page.mediaBox
        val pageWidth = mediaBox.width
        val pageHeight = mediaBox.height

        val watermarkText = "PDF Smart Tools - Free Version"
        val fontSize = pageWidth / 18f

        PDPageContentStream(
            document, page,
            PDPageContentStream.AppendMode.APPEND,
            true,  // compress
            true   // reset context
        ).use { cs ->
            // Set transparency
            val gs = PDExtendedGraphicsState()
            gs.nonStrokingAlphaConstant = 0.15f
            gs.strokingAlphaConstant = 0.15f
            cs.setGraphicsStateParameters(gs)

            cs.beginText()
            cs.setFont(PDType1Font.HELVETICA_BOLD, fontSize)
            cs.setNonStrokingColor(128, 128, 128) // Gray

            // Move to center, then rotate
            val textWidth = PDType1Font.HELVETICA_BOLD.getStringWidth(watermarkText) / 1000f * fontSize
            val centerX = pageWidth / 2f
            val centerY = pageHeight / 2f

            // Create rotation matrix: translate to center, rotate -30 degrees, offset for text centering
            val angle = Math.toRadians(-30.0)
            val cos = Math.cos(angle).toFloat()
            val sin = Math.sin(angle).toFloat()
            val tx = centerX - (textWidth / 2f * cos)
            val ty = centerY - (textWidth / 2f * sin)

            cs.setTextMatrix(Matrix(cos, sin, -sin, cos, tx, ty))
            cs.showText(watermarkText)
            cs.endText()
        }
    }

    /**
     * Log operation metrics for performance monitoring.
     */
    fun logMetrics(metrics: OperationMetrics) {
        Log.i(TAG, buildString {
            append("Operation: ${metrics.operationName}")
            append(" | Files: ${metrics.fileCount}")
            append(" | Pages: ${metrics.pageCount}")
            append(" | Input: ${formatBytes(metrics.inputSizeBytes)}")
            append(" | Output: ${formatBytes(metrics.outputSizeBytes)}")
            append(" | Duration: ${metrics.durationMs}ms")
            append(" | Memory: ${currentMemoryMb()}MB")
        })
    }

    /**
     * Get current heap memory usage in MB.
     */
    fun currentMemoryMb(): Long {
        val runtime = Runtime.getRuntime()
        return (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024)
    }

    /**
     * Get page count from a PDF file with minimal memory usage.
     */
    fun getPageCount(context: Context, file: File): Int {
        ensureInitialized(context)
        return loadDocumentTempFileOnly(file).use { doc -> doc.numberOfPages }
    }

    /**
     * Get page dimensions (width, height in PDF points) for a specific page.
     */
    fun getPageDimensions(file: File, pageNumber: Int): Pair<Int, Int> {
        return loadDocumentTempFileOnly(file).use { doc ->
            if (pageNumber < 0 || pageNumber >= doc.numberOfPages) {
                throw IllegalArgumentException("Page number out of range")
            }
            val page = doc.getPage(pageNumber)
            val mediaBox = page.mediaBox
            Pair(mediaBox.width.toInt(), mediaBox.height.toInt())
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

data class ValidationResult(
    val valid: Boolean,
    val pageCount: Int,
    val fileSize: Long,
    val errorMessage: String?
)

data class OperationMetrics(
    val operationName: String,
    val fileCount: Int,
    val pageCount: Int,
    val inputSizeBytes: Long,
    val outputSizeBytes: Long,
    val durationMs: Long
)
