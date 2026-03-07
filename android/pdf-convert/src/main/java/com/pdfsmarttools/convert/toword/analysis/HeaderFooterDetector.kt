package com.pdfsmarttools.convert.toword.analysis

/**
 * Detects repeating headers and footers across pages.
 *
 * Algorithm:
 * - Collect text blocks from the top and bottom zones of each page.
 * - If a text block appears at nearly the same Y coordinate across 3+ pages,
 *   classify it as a header (top zone) or footer (bottom zone).
 * - Page numbers are detected via numeric patterns at consistent positions.
 */
class HeaderFooterDetector {

    companion object {
        /** Top zone: blocks within this fraction of page height from the top. */
        private const val TOP_ZONE_FRACTION = 0.08f

        /** Bottom zone: blocks within this fraction of page height from the bottom. */
        private const val BOTTOM_ZONE_FRACTION = 0.08f

        /** Minimum number of pages where text must repeat to be classified. */
        private const val MIN_REPEAT_PAGES = 3

        /** Y tolerance for matching positions across pages (in points). */
        private const val Y_TOLERANCE = 3.0f

        /** Page number regex patterns. */
        private val PAGE_NUMBER_PATTERNS = listOf(
            Regex("^\\d{1,4}$"),                    // "1", "23", "456"
            Regex("^Page\\s+\\d+", RegexOption.IGNORE_CASE),  // "Page 1"
            Regex("^-\\s*\\d+\\s*-$"),              // "- 1 -"
            Regex("^\\d+\\s*/\\s*\\d+$"),            // "1 / 10"
        )
    }

    data class HeaderFooterResult(
        val headerText: String?,
        val footerText: String?,
        val headerBlockIndices: Map<Int, Set<Int>>,    // pageIndex → block indices
        val footerBlockIndices: Map<Int, Set<Int>>,    // pageIndex → block indices
        val pageNumberIndices: Map<Int, Set<Int>>      // pageIndex → block indices
    )

    /**
     * Analyze multiple pages to detect repeating headers/footers.
     *
     * @param pageAnalyses List of (pageIndex, pageHeight, blocks) per page.
     */
    fun detect(
        pageAnalyses: List<Triple<Int, Float, List<TextBlock>>>
    ): HeaderFooterResult {
        if (pageAnalyses.size < MIN_REPEAT_PAGES) {
            return HeaderFooterResult(null, null, emptyMap(), emptyMap(), emptyMap())
        }

        val headerCandidates = mutableMapOf<String, MutableList<Pair<Int, Int>>>() // text → [(pageIndex, blockIndex)]
        val footerCandidates = mutableMapOf<String, MutableList<Pair<Int, Int>>>()
        val pageNumberIndices = mutableMapOf<Int, MutableSet<Int>>()

        for ((pageIndex, pageHeight, blocks) in pageAnalyses) {
            val topThreshold = pageHeight * TOP_ZONE_FRACTION
            val bottomThreshold = pageHeight * (1f - BOTTOM_ZONE_FRACTION)

            for ((blockIndex, block) in blocks.withIndex()) {
                val text = block.text.trim()
                if (text.isEmpty()) continue

                // Check for page numbers first
                if (isPageNumber(text)) {
                    pageNumberIndices.getOrPut(pageIndex) { mutableSetOf() }.add(blockIndex)
                    continue
                }

                // Normalize for comparison (remove numbers that might be page numbers)
                val normalized = normalizeForComparison(text)
                if (normalized.length < 2) continue

                if (block.y < topThreshold) {
                    headerCandidates.getOrPut(normalized) { mutableListOf() }
                        .add(pageIndex to blockIndex)
                } else if (block.y > bottomThreshold) {
                    footerCandidates.getOrPut(normalized) { mutableListOf() }
                        .add(pageIndex to blockIndex)
                }
            }
        }

        // Find repeating headers
        val headerText = headerCandidates.entries
            .filter { it.value.size >= MIN_REPEAT_PAGES }
            .maxByOrNull { it.value.size }?.key

        val headerBlockIndices = mutableMapOf<Int, MutableSet<Int>>()
        if (headerText != null) {
            for ((pageIdx, blockIdx) in headerCandidates[headerText]!!) {
                headerBlockIndices.getOrPut(pageIdx) { mutableSetOf() }.add(blockIdx)
            }
        }

        // Find repeating footers
        val footerText = footerCandidates.entries
            .filter { it.value.size >= MIN_REPEAT_PAGES }
            .maxByOrNull { it.value.size }?.key

        val footerBlockIndices = mutableMapOf<Int, MutableSet<Int>>()
        if (footerText != null) {
            for ((pageIdx, blockIdx) in footerCandidates[footerText]!!) {
                footerBlockIndices.getOrPut(pageIdx) { mutableSetOf() }.add(blockIdx)
            }
        }

        return HeaderFooterResult(
            headerText = headerText,
            footerText = footerText,
            headerBlockIndices = headerBlockIndices,
            footerBlockIndices = footerBlockIndices,
            pageNumberIndices = pageNumberIndices
        )
    }

    private fun isPageNumber(text: String): Boolean {
        return PAGE_NUMBER_PATTERNS.any { it.matches(text.trim()) }
    }

    /** Remove digits that are likely page numbers for comparison. */
    private fun normalizeForComparison(text: String): String {
        return text.replace(Regex("\\d+"), "").trim()
    }
}
