package com.pdfsmarttools.convert.toword.analysis

/**
 * Reconstructs paragraphs from individual text blocks.
 *
 * PDFs often split a single paragraph across multiple lines/blocks.
 * This reconstructor merges lines that belong to the same paragraph
 * and preserves intentional paragraph breaks.
 *
 * Merge rules:
 * - If a line ends without terminal punctuation AND the next line starts
 *   with a lowercase letter → merge into one paragraph.
 * - If the vertical gap between lines is > 1.8x the font height → new paragraph.
 * - Lines with matching indentation are grouped together.
 * - Hyphenated word splits ("docu-\nment" → "document") are joined.
 */
class ParagraphReconstructor {

    companion object {
        /** Vertical gap factor (relative to font height) for paragraph break. */
        private const val PARAGRAPH_GAP_FACTOR = 1.8f

        /** Terminal punctuation that ends a sentence/paragraph. */
        private val TERMINAL_PUNCTUATION = charArrayOf('.', '!', '?', ':', ';')

        /** Bullet/list markers. */
        private val LIST_MARKERS = listOf("•", "-", "–", "—", "►", "●", "○", "■", "□", "▪")
    }

    /**
     * Merge text blocks into logical paragraphs.
     *
     * @param blocks Sorted text blocks (top-to-bottom, left-to-right).
     * @param headings Map of block indices detected as headings.
     * @param tableBlockIndices Set of block indices that belong to tables (skip these).
     * @return List of structural elements (paragraphs, list items).
     */
    fun reconstruct(
        blocks: List<TextBlock>,
        headings: Map<Int, StructureType>,
        tableBlockIndices: Set<Int>
    ): List<StructuralElement> {
        if (blocks.isEmpty()) return emptyList()

        val elements = mutableListOf<StructuralElement>()
        var currentParagraphBlocks = mutableListOf<TextBlock>()
        var currentText = StringBuilder()

        for ((index, block) in blocks.withIndex()) {
            // Skip table blocks
            if (index in tableBlockIndices) {
                flushParagraph(currentText, currentParagraphBlocks, elements)
                currentText = StringBuilder()
                currentParagraphBlocks = mutableListOf()
                continue
            }

            // Headings are emitted as standalone elements
            if (index in headings) {
                flushParagraph(currentText, currentParagraphBlocks, elements)
                currentText = StringBuilder()
                currentParagraphBlocks = mutableListOf()

                elements.add(StructuralElement(
                    type = headings[index]!!,
                    text = block.text.trim(),
                    blocks = listOf(block),
                    pageIndex = block.pageIndex,
                    y = block.y,
                    isBold = block.isBold,
                    fontSize = block.fontSize
                ))
                continue
            }

            // Check for list item
            val listMarker = detectListMarker(block.text)
            if (listMarker != null) {
                flushParagraph(currentText, currentParagraphBlocks, elements)
                currentText = StringBuilder()
                currentParagraphBlocks = mutableListOf()

                elements.add(StructuralElement(
                    type = StructureType.LIST_ITEM,
                    text = block.text.removePrefix(listMarker).trim(),
                    blocks = listOf(block),
                    pageIndex = block.pageIndex,
                    y = block.y,
                    fontSize = block.fontSize
                ))
                continue
            }

            // Decide: merge with current paragraph or start new one
            if (currentParagraphBlocks.isNotEmpty()) {
                val prevBlock = currentParagraphBlocks.last()
                val shouldBreak = shouldStartNewParagraph(prevBlock, block)

                if (shouldBreak) {
                    flushParagraph(currentText, currentParagraphBlocks, elements)
                    currentText = StringBuilder()
                    currentParagraphBlocks = mutableListOf()
                }
            }

            // Merge with current paragraph
            if (currentText.isNotEmpty()) {
                val prevText = currentText.toString()
                // Handle hyphenated word splits: "docu-" + "ment" → "document"
                if (prevText.endsWith("-")) {
                    currentText.deleteCharAt(currentText.length - 1)
                    // Don't add space — join directly
                } else {
                    currentText.append(' ')
                }
            }

            currentText.append(block.text.trim())
            currentParagraphBlocks.add(block)
        }

        flushParagraph(currentText, currentParagraphBlocks, elements)
        return elements
    }

    /**
     * Determine if a new paragraph should start before this block.
     *
     * Heuristics:
     * 1. Large vertical gap → new paragraph
     * 2. Previous line ends with terminal punctuation → likely paragraph end
     * 3. Current line starts with uppercase after punctuation → new paragraph
     * 4. Significant indentation change → new paragraph
     */
    private fun shouldStartNewParagraph(prev: TextBlock, current: TextBlock): Boolean {
        val verticalGap = current.y - (prev.y + prev.height)
        val avgHeight = (prev.height + current.height) / 2f

        // Large vertical gap
        if (verticalGap > avgHeight * PARAGRAPH_GAP_FACTOR) return true

        val prevText = prev.text.trim()
        val currentText = current.text.trim()

        // Previous ends with terminal punctuation and current starts with uppercase
        if (prevText.isNotEmpty() && prevText.last() in TERMINAL_PUNCTUATION) {
            if (currentText.isNotEmpty() && currentText[0].isUpperCase()) {
                return true
            }
        }

        // Significant indentation change (new paragraph or block quote)
        val indentDiff = Math.abs(current.x - prev.x)
        if (indentDiff > prev.fontSize * 2) return true

        // Font size changed significantly
        if (Math.abs(current.fontSize - prev.fontSize) > 2f) return true

        return false
    }

    private fun flushParagraph(
        text: StringBuilder,
        blocks: MutableList<TextBlock>,
        elements: MutableList<StructuralElement>
    ) {
        val trimmed = text.toString().trim()
        if (trimmed.isEmpty() || blocks.isEmpty()) return

        val firstBlock = blocks.first()
        elements.add(StructuralElement(
            type = StructureType.PARAGRAPH,
            text = trimmed,
            blocks = blocks.toList(),
            pageIndex = firstBlock.pageIndex,
            y = firstBlock.y,
            isBold = firstBlock.isBold,
            isItalic = firstBlock.isItalic,
            fontSize = firstBlock.fontSize,
            indentLevel = calculateIndentLevel(firstBlock)
        ))
    }

    private fun detectListMarker(text: String): String? {
        val trimmed = text.trim()
        // Check bullet markers
        for (marker in LIST_MARKERS) {
            if (trimmed.startsWith(marker)) return marker
        }
        // Check numbered list: "1.", "2)", "a.", "a)"
        if (trimmed.matches(Regex("^\\d{1,3}[.):]\\s.*"))) return trimmed.substring(0, trimmed.indexOf(' ') + 1)
        if (trimmed.matches(Regex("^[a-zA-Z][.):]\\s.*"))) return trimmed.substring(0, trimmed.indexOf(' ') + 1)
        return null
    }

    private fun calculateIndentLevel(block: TextBlock): Int {
        // Rough indent detection: every 36pt (~0.5 inch) is one level
        return (block.x / 36f).toInt().coerceIn(0, 5)
    }
}
