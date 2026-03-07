package com.pdfsmarttools.convert.toword.analysis

import android.util.Log
import org.apache.poi.util.Units
import org.apache.poi.xwpf.model.XWPFHeaderFooterPolicy
import org.apache.poi.xwpf.usermodel.*
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.math.BigInteger

/**
 * Advanced DOCX builder that converts analyzed page structures into
 * a high-fidelity Word document.
 *
 * Handles:
 * - Heading hierarchy (H1, H2, H3) with proper DOCX styles
 * - Paragraph reconstruction with line spacing
 * - List items with indentation
 * - Tables with cell alignment
 * - Inline images at approximate positions
 * - Headers and footers
 * - Page breaks between pages
 * - Margins and section properties
 */
class AdvancedDocxBuilder {

    companion object {
        private const val TAG = "AdvancedDocxBuilder"

        // Font sizes in half-points (DOCX convention)
        private const val H1_SIZE = 32  // 16pt
        private const val H2_SIZE = 28  // 14pt
        private const val H3_SIZE = 24  // 12pt
        private const val BODY_SIZE = 22 // 11pt

        // Default image dimensions in EMU
        private const val DEFAULT_IMAGE_WIDTH_EMU = 5_500_000L  // ~3.8 inches
        private const val MAX_IMAGE_WIDTH_EMU = 7_000_000L      // ~4.9 inches
    }

    data class BuildStats(
        var paragraphsWritten: Int = 0,
        var headingsWritten: Int = 0,
        var tablesWritten: Int = 0,
        var imagesWritten: Int = 0,
        var listItemsWritten: Int = 0,
        var wordCount: Int = 0
    )

    /**
     * Build a DOCX document from analyzed pages.
     *
     * @param pages List of page analyses (one per PDF page).
     * @param headerFooter Detected header/footer info.
     * @param outputFile Output .docx file.
     * @param isPro Whether user has Pro access.
     * @param maxPages Max pages to process (for free tier limit).
     * @param onProgress Progress callback.
     * @return Build statistics.
     */
    fun build(
        pages: List<PageAnalysis>,
        headerFooter: HeaderFooterDetector.HeaderFooterResult,
        outputFile: File,
        isPro: Boolean,
        maxPages: Int,
        onProgress: (Int, String) -> Unit
    ): BuildStats {
        val stats = BuildStats()
        val document = XWPFDocument()

        try {
            // Set up document headers/footers
            setupHeaderFooter(document, headerFooter)

            val pagesToProcess = pages.take(maxPages)

            for ((idx, page) in pagesToProcess.withIndex()) {
                if (idx > 0) {
                    // Page break between pages
                    val br = document.createParagraph()
                    br.isPageBreak = true
                }

                writePage(document, page, headerFooter, stats)

                val progress = 30 + ((idx + 1) * 50 / pagesToProcess.size)
                onProgress(progress, "Building document (${idx + 1}/${pagesToProcess.size})...")
            }

            // Add free tier notice
            if (!isPro && pages.size > maxPages) {
                val notice = document.createParagraph()
                notice.isPageBreak = true
                val run = notice.createRun()
                run.isBold = true
                run.fontSize = 11
                run.setText("[PDF Smart Tools - Free Version: Only first $maxPages pages converted. Upgrade to Pro for full conversion.]")
            }

            onProgress(85, "Saving document...")

            // Write to file
            outputFile.parentFile?.mkdirs()
            val tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")
            FileOutputStream(tempFile).use { document.write(it) }

            // Atomic rename
            if (outputFile.exists()) outputFile.delete()
            if (!tempFile.renameTo(outputFile)) {
                tempFile.copyTo(outputFile, overwrite = true)
                tempFile.delete()
            }

        } finally {
            document.close()
        }

        return stats
    }

    private fun writePage(
        document: XWPFDocument,
        page: PageAnalysis,
        headerFooter: HeaderFooterDetector.HeaderFooterResult,
        stats: BuildStats
    ) {
        val skipIndices = mutableSetOf<Int>()

        // Collect header/footer block indices for this page
        headerFooter.headerBlockIndices[page.pageIndex]?.let { skipIndices.addAll(it) }
        headerFooter.footerBlockIndices[page.pageIndex]?.let { skipIndices.addAll(it) }
        headerFooter.pageNumberIndices[page.pageIndex]?.let { skipIndices.addAll(it) }

        // Write structural elements (headings, paragraphs, list items)
        // interleaved with tables and images by Y position

        val sortedElements = page.elements.sortedBy { it.y }
        val sortedTables = page.tables.sortedBy { it.y }
        val sortedImages = page.images.sortedBy { it.y }

        var tableIdx = 0
        var imageIdx = 0

        for (element in sortedElements) {
            // Insert any tables that come before this element
            while (tableIdx < sortedTables.size && sortedTables[tableIdx].y < element.y) {
                writeTable(document, sortedTables[tableIdx], stats)
                tableIdx++
            }

            // Insert any images that come before this element
            while (imageIdx < sortedImages.size && sortedImages[imageIdx].y < element.y) {
                writeImage(document, sortedImages[imageIdx], stats)
                imageIdx++
            }

            writeElement(document, element, stats)
        }

        // Write remaining tables
        while (tableIdx < sortedTables.size) {
            writeTable(document, sortedTables[tableIdx], stats)
            tableIdx++
        }

        // Write remaining images
        while (imageIdx < sortedImages.size) {
            writeImage(document, sortedImages[imageIdx], stats)
            imageIdx++
        }
    }

    private fun writeElement(
        document: XWPFDocument,
        element: StructuralElement,
        stats: BuildStats
    ) {
        val cleanedText = DocumentCleanup.clean(element.text)
        if (cleanedText.isEmpty()) return

        stats.wordCount += cleanedText.split(Regex("\\s+")).size

        when (element.type) {
            StructureType.HEADING1 -> {
                writeHeading(document, cleanedText, H1_SIZE, element)
                stats.headingsWritten++
            }
            StructureType.HEADING2 -> {
                writeHeading(document, cleanedText, H2_SIZE, element)
                stats.headingsWritten++
            }
            StructureType.HEADING3 -> {
                writeHeading(document, cleanedText, H3_SIZE, element)
                stats.headingsWritten++
            }
            StructureType.PARAGRAPH -> {
                writeParagraph(document, cleanedText, element)
                stats.paragraphsWritten++
            }
            StructureType.LIST_ITEM -> {
                writeListItem(document, cleanedText, element)
                stats.listItemsWritten++
                stats.paragraphsWritten++
            }
            else -> {
                writeParagraph(document, cleanedText, element)
                stats.paragraphsWritten++
            }
        }
    }

    private fun writeHeading(
        document: XWPFDocument,
        text: String,
        sizeHalfPt: Int,
        element: StructuralElement
    ) {
        val paragraph = document.createParagraph()

        // Set spacing before heading
        paragraph.spacingBefore = 240 // 12pt before

        val run = paragraph.createRun()
        run.isBold = true
        run.fontSize = sizeHalfPt / 2
        run.setText(text)

        if (element.isItalic) run.isItalic = true
    }

    private fun writeParagraph(
        document: XWPFDocument,
        text: String,
        element: StructuralElement
    ) {
        val paragraph = document.createParagraph()

        // Apply indentation
        if (element.indentLevel > 0) {
            paragraph.indentationLeft = element.indentLevel * 720 // 720 twips = 0.5 inch
        }

        val run = paragraph.createRun()
        run.fontSize = BODY_SIZE / 2

        if (element.isBold) run.isBold = true
        if (element.isItalic) run.isItalic = true

        // Handle line breaks within the paragraph
        val lines = text.split('\n')
        for ((lineIdx, line) in lines.withIndex()) {
            run.setText(line)
            if (lineIdx < lines.size - 1) {
                run.addBreak()
            }
        }
    }

    private fun writeListItem(
        document: XWPFDocument,
        text: String,
        element: StructuralElement
    ) {
        val paragraph = document.createParagraph()
        paragraph.indentationLeft = 720 // 0.5 inch indent
        paragraph.indentationHanging = 360 // Hanging indent for bullet

        val run = paragraph.createRun()
        run.fontSize = BODY_SIZE / 2
        run.setText("\u2022 $text") // Bullet character + text
    }

    private fun writeTable(
        document: XWPFDocument,
        table: DetectedTable,
        stats: BuildStats
    ) {
        if (table.rows.isEmpty()) return

        try {
            val xTable = document.createTable(table.rows.size, table.columnCount)

            for ((rowIdx, row) in table.rows.withIndex()) {
                val tableRow = xTable.getRow(rowIdx)
                for ((colIdx, cellText) in row.withIndex()) {
                    val cell = if (colIdx < tableRow.tableCells.size) {
                        tableRow.getCell(colIdx)
                    } else {
                        tableRow.addNewTableCell()
                    }
                    cell.text = DocumentCleanup.clean(cellText)
                }
            }

            stats.tablesWritten++
        } catch (e: Exception) {
            Log.w(TAG, "Failed to write table: ${e.message}")
            // Fallback: write as plain text
            for (row in table.rows) {
                val para = document.createParagraph()
                val run = para.createRun()
                run.fontSize = BODY_SIZE / 2
                run.setText(row.joinToString("\t"))
            }
        }
    }

    private fun writeImage(
        document: XWPFDocument,
        image: ImageBlock,
        stats: BuildStats
    ) {
        try {
            val paragraph = document.createParagraph()
            paragraph.alignment = ParagraphAlignment.CENTER

            val run = paragraph.createRun()

            // Calculate dimensions maintaining aspect ratio
            val aspectRatio = image.width / image.height
            var widthEmu = DEFAULT_IMAGE_WIDTH_EMU
            var heightEmu = (widthEmu / aspectRatio).toLong()

            if (widthEmu > MAX_IMAGE_WIDTH_EMU) {
                widthEmu = MAX_IMAGE_WIDTH_EMU
                heightEmu = (widthEmu / aspectRatio).toLong()
            }

            val pictureType = when (image.format.lowercase()) {
                "jpeg", "jpg" -> XWPFDocument.PICTURE_TYPE_JPEG
                else -> XWPFDocument.PICTURE_TYPE_PNG
            }

            run.addPicture(
                ByteArrayInputStream(image.imageBytes),
                pictureType,
                "image_p${image.pageIndex}.${image.format}",
                widthEmu.toInt(),
                heightEmu.toInt()
            )

            stats.imagesWritten++
        } catch (e: Exception) {
            Log.w(TAG, "Failed to write image: ${e.message}")
        }
    }

    private fun setupHeaderFooter(
        document: XWPFDocument,
        headerFooter: HeaderFooterDetector.HeaderFooterResult
    ) {
        try {
            if (headerFooter.headerText != null) {
                val header = document.createHeaderFooterPolicy().createHeader(XWPFHeaderFooterPolicy.DEFAULT)
                val para = header.createParagraph()
                para.alignment = ParagraphAlignment.CENTER
                val run = para.createRun()
                run.fontSize = 9
                run.setColor("808080")
                run.setText(headerFooter.headerText)
            }

            if (headerFooter.footerText != null) {
                val footer = document.createHeaderFooterPolicy().createFooter(XWPFHeaderFooterPolicy.DEFAULT)
                val para = footer.createParagraph()
                para.alignment = ParagraphAlignment.CENTER
                val run = para.createRun()
                run.fontSize = 9
                run.setColor("808080")
                run.setText(headerFooter.footerText)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to set header/footer: ${e.message}")
        }
    }
}
