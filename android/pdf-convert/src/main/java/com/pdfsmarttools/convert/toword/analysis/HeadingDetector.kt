package com.pdfsmarttools.convert.toword.analysis

/**
 * Font-based heading hierarchy detector.
 *
 * Algorithm:
 * 1. Calculate average font size across all text blocks on the page
 * 2. Classify blocks by their font size relative to the average:
 *    - > 1.6x average → Heading 1
 *    - > 1.3x average → Heading 2
 *    - > 1.15x average → Heading 3
 * 3. Additional heuristics: bold weight, short length, no trailing punctuation
 */
class HeadingDetector {

    companion object {
        private const val H1_THRESHOLD = 1.6f
        private const val H2_THRESHOLD = 1.3f
        private const val H3_THRESHOLD = 1.15f
        private const val MAX_HEADING_LENGTH = 120
    }

    /**
     * Detect headings from text blocks.
     *
     * @param blocks All text blocks on the page.
     * @param averageFontSize Pre-calculated average font size for the page.
     * @return Set of block indices that are headings, mapped to their heading level.
     */
    fun detectHeadings(blocks: List<TextBlock>, averageFontSize: Float): Map<Int, StructureType> {
        if (blocks.isEmpty() || averageFontSize <= 0f) return emptyMap()

        val headings = mutableMapOf<Int, StructureType>()

        for ((index, block) in blocks.withIndex()) {
            val level = classifyHeading(block, averageFontSize) ?: continue
            headings[index] = level
        }

        return headings
    }

    /**
     * Classify a single text block as a heading level or null (not a heading).
     *
     * Heuristics:
     * - Font size significantly larger than average
     * - Text is relatively short (< 120 chars)
     * - Does not end with sentence punctuation (., ,, ;)
     * - Bold font adds confidence
     */
    private fun classifyHeading(block: TextBlock, averageFontSize: Float): StructureType? {
        val ratio = block.fontSize / averageFontSize
        val text = block.text.trim()

        // Too long for a heading
        if (text.length > MAX_HEADING_LENGTH) return null

        // Must have some text
        if (text.length < 2) return null

        // Font-size based detection
        val sizeLevel = when {
            ratio >= H1_THRESHOLD -> StructureType.HEADING1
            ratio >= H2_THRESHOLD -> StructureType.HEADING2
            ratio >= H3_THRESHOLD -> StructureType.HEADING3
            else -> null
        }

        if (sizeLevel != null) return sizeLevel

        // Bold + slightly larger + short → Heading 3
        if (block.isBold && ratio >= 1.05f && text.length < 80 && !endsWithSentencePunctuation(text)) {
            return StructureType.HEADING3
        }

        // All caps + short → Heading 2
        if (text == text.uppercase() && text.any { it.isLetter() } && text.length < 60) {
            return StructureType.HEADING2
        }

        return null
    }

    private fun endsWithSentencePunctuation(text: String): Boolean {
        val last = text.lastOrNull() ?: return false
        return last in listOf('.', ',', ';', ':', ')')
    }
}
