package com.pdfsmarttools.convert.toword.analysis

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition

/**
 * Extracts positioned text blocks from PDF pages using PDFBox TextPosition API.
 *
 * Groups individual character positions into coherent text blocks based on
 * spatial proximity and font properties. This is the foundation for all
 * subsequent structure detection.
 */
class TextBlockExtractor {

    companion object {
        /** Max horizontal gap (in points) before splitting into separate blocks. */
        private const val WORD_GAP_THRESHOLD = 3.0f

        /** Max vertical gap factor (relative to font size) before starting a new line. */
        private const val LINE_GAP_FACTOR = 1.5f
    }

    /**
     * Extract text blocks with position and font metadata for a single page.
     */
    fun extractPage(document: PDDocument, pageIndex: Int): List<TextBlock> {
        val positions = mutableListOf<TextPosition>()

        val stripper = object : PDFTextStripper() {
            override fun processTextPosition(text: TextPosition) {
                positions.add(text)
            }
        }
        stripper.startPage = pageIndex + 1
        stripper.endPage = pageIndex + 1
        stripper.sortByPosition = true
        stripper.getText(document)

        if (positions.isEmpty()) return emptyList()

        return groupIntoBlocks(positions, pageIndex)
    }

    /**
     * Groups raw TextPositions into logical text blocks.
     *
     * Heuristic: Characters on the same line with similar font and small gaps
     * are grouped together. A new block starts when:
     * - Y coordinate changes significantly (new line)
     * - Large horizontal gap (new column/block)
     * - Font size or style changes
     */
    private fun groupIntoBlocks(positions: List<TextPosition>, pageIndex: Int): List<TextBlock> {
        val blocks = mutableListOf<TextBlock>()
        if (positions.isEmpty()) return blocks

        var currentText = StringBuilder()
        var blockX = positions[0].xDirAdj
        var blockY = positions[0].yDirAdj
        var blockWidth = 0f
        var blockHeight = positions[0].heightDir
        var blockFontSize = positions[0].fontSizeInPt
        var blockFontName = positions[0].font?.name ?: ""
        var lastEndX = positions[0].xDirAdj

        for ((i, pos) in positions.withIndex()) {
            val fontSize = pos.fontSizeInPt
            val fontName = pos.font?.name ?: ""
            val x = pos.xDirAdj
            val y = pos.yDirAdj

            val isNewLine = i > 0 && Math.abs(y - blockY) > blockFontSize * LINE_GAP_FACTOR
            val isLargeGap = i > 0 && (x - lastEndX) > blockFontSize * WORD_GAP_THRESHOLD
            val isFontChange = i > 0 && (Math.abs(fontSize - blockFontSize) > 1.0f ||
                    fontName != blockFontName)

            if (i > 0 && (isNewLine || isLargeGap || isFontChange)) {
                // Flush current block
                val text = currentText.toString().trim()
                if (text.isNotEmpty()) {
                    blocks.add(TextBlock(
                        text = text,
                        x = blockX,
                        y = blockY,
                        width = blockWidth,
                        height = blockHeight,
                        fontSize = blockFontSize,
                        fontName = blockFontName,
                        isBold = isBoldFont(blockFontName),
                        isItalic = isItalicFont(blockFontName),
                        pageIndex = pageIndex
                    ))
                }

                // Start new block
                currentText = StringBuilder()
                blockX = x
                blockY = y
                blockWidth = 0f
                blockHeight = pos.heightDir
                blockFontSize = fontSize
                blockFontName = fontName
            }

            // Add space if there's a word gap on the same line
            if (i > 0 && !isNewLine && (x - lastEndX) > fontSize * 0.3f) {
                currentText.append(' ')
            }

            currentText.append(pos.unicode ?: "")
            blockWidth = (x + pos.widthDirAdj) - blockX
            blockHeight = maxOf(blockHeight, pos.heightDir)
            lastEndX = x + pos.widthDirAdj
        }

        // Flush last block
        val text = currentText.toString().trim()
        if (text.isNotEmpty()) {
            blocks.add(TextBlock(
                text = text,
                x = blockX,
                y = blockY,
                width = blockWidth,
                height = blockHeight,
                fontSize = blockFontSize,
                fontName = blockFontName,
                isBold = isBoldFont(blockFontName),
                isItalic = isItalicFont(blockFontName),
                pageIndex = pageIndex
            ))
        }

        return blocks
    }

    private fun isBoldFont(fontName: String): Boolean {
        val lower = fontName.lowercase()
        return lower.contains("bold") || lower.contains("heavy") || lower.contains("black")
    }

    private fun isItalicFont(fontName: String): Boolean {
        val lower = fontName.lowercase()
        return lower.contains("italic") || lower.contains("oblique")
    }
}
