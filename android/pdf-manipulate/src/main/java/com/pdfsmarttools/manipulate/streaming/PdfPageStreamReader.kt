package com.pdfsmarttools.manipulate.streaming

import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import java.io.File

/**
 * Streaming page reader for large PDF files.
 *
 * Reads PDF pages one at a time with minimal memory footprint by using
 * PDFBox temp-file-only loading mode. Each page can be processed independently,
 * and memory is released after each page operation.
 *
 * Usage:
 * ```kotlin
 * val reader = PdfPageStreamReader(inputFile)
 * reader.open()
 * try {
 *     while (reader.hasNextPage()) {
 *         val page = reader.nextPage()
 *         // process page...
 *         reader.releaseCurrentPage()
 *     }
 * } finally {
 *     reader.close()
 * }
 * ```
 *
 * Memory characteristics:
 * - Uses temp-file-only mode: near-zero heap for document structure
 * - Only the current page's content streams are in memory
 * - Explicit [releaseCurrentPage] hint for eager cleanup
 */
class PdfPageStreamReader(private val file: File) {

    companion object {
        private const val TAG = "PdfPageStreamReader"
    }

    private var document: PDDocument? = null
    private var currentPageIndex: Int = -1
    private var totalPages: Int = 0

    /** Whether the reader has been opened. */
    val isOpen: Boolean get() = document != null

    /** Total page count. Available after [open]. */
    val pageCount: Int get() = totalPages

    /** Current page index (0-based). -1 if not started. */
    val currentIndex: Int get() = currentPageIndex

    /**
     * Open the PDF file for streaming reads.
     * Uses temp-file-only loading to minimize heap usage.
     */
    fun open() {
        check(document == null) { "Reader already open" }

        document = PdfBoxFacade.loadDocumentTempFileOnly(file)
        totalPages = document!!.numberOfPages
        currentPageIndex = -1

        Log.d(TAG, "Opened: ${file.name}, $totalPages pages, " +
                "${file.length() / (1024 * 1024)}MB")
    }

    /**
     * Check if there are more pages to read.
     */
    fun hasNextPage(): Boolean {
        return currentPageIndex + 1 < totalPages
    }

    /**
     * Advance to the next page and return it.
     *
     * @return The next [PDPage] in the document.
     * @throws NoSuchElementException if there are no more pages.
     */
    fun nextPage(): PDPage {
        val doc = document ?: throw IllegalStateException("Reader not open")

        if (!hasNextPage()) {
            throw NoSuchElementException("No more pages (at ${currentPageIndex + 1}/$totalPages)")
        }

        currentPageIndex++
        return doc.getPage(currentPageIndex)
    }

    /**
     * Get a specific page by index without advancing the cursor.
     *
     * @param pageIndex 0-based page index.
     * @return The [PDPage] at the given index.
     */
    fun getPage(pageIndex: Int): PDPage {
        val doc = document ?: throw IllegalStateException("Reader not open")
        require(pageIndex in 0 until totalPages) {
            "Page index $pageIndex out of range [0, $totalPages)"
        }
        currentPageIndex = pageIndex
        return doc.getPage(pageIndex)
    }

    /**
     * Get the underlying document for page import operations.
     * Use with caution — prefer [nextPage] / [getPage] for streaming access.
     */
    fun getDocument(): PDDocument {
        return document ?: throw IllegalStateException("Reader not open")
    }

    /**
     * Hint that the current page has been fully processed.
     * Triggers memory cleanup if heap pressure is detected.
     */
    fun releaseCurrentPage() {
        if (MemoryBudget.heapUsagePercent() > 70) {
            System.gc()
            Log.d(TAG, "Released page $currentPageIndex, GC triggered " +
                    "(heap: ${MemoryBudget.heapUsagePercent()}%)")
        }
    }

    /**
     * Close the reader and release all resources.
     * Safe to call multiple times.
     */
    fun close() {
        try {
            document?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing reader: ${e.message}")
        } finally {
            document = null
            currentPageIndex = -1
            totalPages = 0
        }
    }
}
