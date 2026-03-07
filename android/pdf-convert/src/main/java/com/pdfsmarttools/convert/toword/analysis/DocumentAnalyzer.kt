package com.pdfsmarttools.convert.toword.analysis

import com.tom_roush.pdfbox.pdmodel.PDDocument

/**
 * Orchestrates the full document analysis pipeline for a single page.
 *
 * Pipeline:
 * PDF Page → TextBlock extraction → Heading detection → Table detection →
 * Paragraph reconstruction → Structure output
 *
 * This is the main entry point for per-page analysis.
 */
class DocumentAnalyzer(
    private val textBlockExtractor: TextBlockExtractor = TextBlockExtractor(),
    private val headingDetector: HeadingDetector = HeadingDetector(),
    private val tableReconstructor: TableReconstructor = TableReconstructor(),
    private val paragraphReconstructor: ParagraphReconstructor = ParagraphReconstructor(),
    private val imageExtractor: ImageExtractor = ImageExtractor()
) {

    /**
     * Analyze a single PDF page and produce a structured [PageAnalysis].
     *
     * @param document The PDF document.
     * @param pageIndex 0-based page index.
     * @param extractImages Whether to extract embedded images.
     * @return Complete page analysis with detected structures.
     */
    fun analyzePage(
        document: PDDocument,
        pageIndex: Int,
        extractImages: Boolean = false
    ): PageAnalysis {
        val page = document.getPage(pageIndex)
        val mediaBox = page.mediaBox
        val pageWidth = mediaBox.width
        val pageHeight = mediaBox.height

        // Step 1: Extract text blocks with position metadata
        val textBlocks = textBlockExtractor.extractPage(document, pageIndex)

        // Calculate average font size for heading detection
        val averageFontSize = if (textBlocks.isNotEmpty()) {
            textBlocks.map { it.fontSize }.average().toFloat()
        } else 0f

        val isScanned = textBlocks.isEmpty() ||
                textBlocks.sumOf { it.text.length } < 50

        if (isScanned) {
            return PageAnalysis(
                pageIndex = pageIndex,
                pageWidth = pageWidth,
                pageHeight = pageHeight,
                textBlocks = textBlocks,
                elements = emptyList(),
                tables = emptyList(),
                images = emptyList(),
                averageFontSize = averageFontSize,
                isScanned = true
            )
        }

        // Step 2: Detect headings
        val headings = headingDetector.detectHeadings(textBlocks, averageFontSize)

        // Step 3: Detect tables
        val (tables, tableBlockIndices) = tableReconstructor.detectTables(textBlocks, pageIndex)

        // Step 4: Reconstruct paragraphs (skip heading and table blocks)
        val elements = paragraphReconstructor.reconstruct(textBlocks, headings, tableBlockIndices)

        // Step 5: Extract images
        val images = if (extractImages) {
            imageExtractor.extractImages(document, pageIndex)
        } else emptyList()

        return PageAnalysis(
            pageIndex = pageIndex,
            pageWidth = pageWidth,
            pageHeight = pageHeight,
            textBlocks = textBlocks,
            elements = elements,
            tables = tables,
            images = images,
            averageFontSize = averageFontSize,
            isScanned = false
        )
    }
}
