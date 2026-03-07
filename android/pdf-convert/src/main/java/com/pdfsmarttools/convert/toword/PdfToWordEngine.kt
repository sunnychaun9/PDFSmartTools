package com.pdfsmarttools.convert.toword

import android.content.Context
import android.util.Log
import com.pdfsmarttools.convert.toword.analysis.*
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File

data class PdfToWordResult(
    val outputPath: String,
    val pageCount: Int,
    val wordCount: Int,
    val fileSize: Long,
    // Enhanced metrics
    val pagesProcessed: Int = pageCount,
    val paragraphsDetected: Int = 0,
    val headingsDetected: Int = 0,
    val tablesDetected: Int = 0,
    val imagesExtracted: Int = 0,
    val ocrUsed: Boolean = false,
    val processingTimeMs: Long = 0
)

/**
 * High-fidelity PDF → DOCX conversion engine.
 *
 * Pipeline:
 * 1. Load PDF via PDFBox
 * 2. Per-page analysis: TextBlock extraction → heading detection →
 *    table reconstruction → paragraph merging → image extraction
 * 3. Multi-page header/footer detection
 * 4. DOCX generation with structural elements, tables, images, headers/footers
 * 5. Document cleanup (hyphen joining, whitespace normalization)
 *
 * Falls back to simple text extraction if the analysis pipeline fails.
 */
class PdfToWordEngine {

    companion object {
        private const val TAG = "PdfToWordEngine"

        /** Minimum characters extracted before considering OCR fallback. */
        private const val OCR_THRESHOLD = 50
    }

    private val analyzer = DocumentAnalyzer()
    private val headerFooterDetector = HeaderFooterDetector()
    private val docxBuilder = AdvancedDocxBuilder()

    /**
     * Convert a PDF to DOCX with advanced layout reconstruction.
     *
     * @param context Android context for PDFBox initialization.
     * @param inputPath Absolute path to source PDF.
     * @param outputPath Absolute path for output DOCX.
     * @param extractImages Whether to extract embedded images.
     * @param isPro Whether user has Pro subscription.
     * @param onProgress Progress callback (0-100, status).
     */
    suspend fun convertToDocx(
        context: Context,
        inputPath: String,
        outputPath: String,
        extractImages: Boolean,
        isPro: Boolean,
        onProgress: (Int, String) -> Unit
    ): PdfToWordResult {
        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)
        onProgress(0, "Opening PDF...")

        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found")

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()

        PdfBoxFacade.loadDocument(inputFile).use { document ->
            val totalPages = document.numberOfPages
            if (totalPages == 0) throw IllegalArgumentException("PDF has no pages")

            val maxPages = if (!isPro) minOf(totalPages, 5) else totalPages

            onProgress(5, "Analyzing document structure...")

            // Phase 1: Analyze all pages
            val pageAnalyses = mutableListOf<PageAnalysis>()
            var anyScanned = false

            for (pageIdx in 0 until maxPages) {
                onProgress(
                    5 + ((pageIdx + 1) * 20 / maxPages),
                    "Analyzing page ${pageIdx + 1} of $maxPages..."
                )

                try {
                    val analysis = analyzer.analyzePage(document, pageIdx, extractImages)
                    pageAnalyses.add(analysis)
                    if (analysis.isScanned) anyScanned = true
                } catch (e: Exception) {
                    Log.w(TAG, "Analysis failed for page $pageIdx, using fallback: ${e.message}")
                    pageAnalyses.add(createFallbackAnalysis(document, pageIdx))
                }

                // Memory check between pages
                checkMemoryPressure()
            }

            // Phase 2: Detect headers/footers across pages
            onProgress(28, "Detecting headers and footers...")
            val headerFooterInput = pageAnalyses.map { page ->
                Triple(page.pageIndex, page.pageHeight, page.textBlocks)
            }
            val headerFooterResult = headerFooterDetector.detect(headerFooterInput)

            // Phase 3: Build DOCX
            onProgress(30, "Building Word document...")
            val stats = docxBuilder.build(
                pages = pageAnalyses,
                headerFooter = headerFooterResult,
                outputFile = outputFile,
                isPro = isPro,
                maxPages = maxPages,
                onProgress = onProgress
            )

            val processingTimeMs = System.currentTimeMillis() - startTime
            onProgress(100, "Complete!")

            Log.d(TAG, "Conversion complete: ${maxPages} pages, " +
                    "${stats.headingsWritten} headings, ${stats.tablesWritten} tables, " +
                    "${stats.imagesWritten} images in ${processingTimeMs}ms")

            return PdfToWordResult(
                outputPath = outputPath,
                pageCount = maxPages,
                wordCount = stats.wordCount,
                fileSize = outputFile.length(),
                pagesProcessed = maxPages,
                paragraphsDetected = stats.paragraphsWritten,
                headingsDetected = stats.headingsWritten,
                tablesDetected = stats.tablesWritten,
                imagesExtracted = stats.imagesWritten,
                ocrUsed = anyScanned,
                processingTimeMs = processingTimeMs
            )
        }
    }

    /**
     * Fallback: simple text extraction when analysis fails for a page.
     */
    private fun createFallbackAnalysis(document: PDDocument, pageIndex: Int): PageAnalysis {
        val page = document.getPage(pageIndex)
        val mediaBox = page.mediaBox

        val stripper = PDFTextStripper()
        stripper.startPage = pageIndex + 1
        stripper.endPage = pageIndex + 1
        val text = stripper.getText(document)

        val paragraphs = text.split("\n\n")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .mapIndexed { idx, paraText ->
                StructuralElement(
                    type = StructureType.PARAGRAPH,
                    text = DocumentCleanup.clean(paraText),
                    blocks = emptyList(),
                    pageIndex = pageIndex,
                    y = idx * 20f,
                    fontSize = 11f
                )
            }

        return PageAnalysis(
            pageIndex = pageIndex,
            pageWidth = mediaBox.width,
            pageHeight = mediaBox.height,
            textBlocks = emptyList(),
            elements = paragraphs,
            tables = emptyList(),
            images = emptyList(),
            averageFontSize = 11f,
            isScanned = text.length < OCR_THRESHOLD
        )
    }

    private fun checkMemoryPressure() {
        val rt = Runtime.getRuntime()
        if (rt.totalMemory() - rt.freeMemory() > (rt.maxMemory() * 0.80).toLong()) {
            System.gc()
            Log.d(TAG, "Memory pressure detected, triggered GC")
        }
    }
}
