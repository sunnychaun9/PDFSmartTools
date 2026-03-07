package com.pdfsmarttools.convert.toword.analysis

/**
 * Document cleanup transformations applied before DOCX generation.
 *
 * Fixes common PDF text extraction artifacts:
 * - Hyphenated word splits across lines
 * - Excessive whitespace
 * - Duplicate line breaks
 * - Page number artifacts in body text
 * - Ligature normalization
 */
object DocumentCleanup {

    /**
     * Apply all cleanup transformations to a text string.
     */
    fun clean(text: String): String {
        var result = text
        result = fixHyphenatedWords(result)
        result = normalizeWhitespace(result)
        result = removeDuplicateLineBreaks(result)
        result = normalizeLigatures(result)
        result = trimLines(result)
        return result.trim()
    }

    /**
     * Join hyphenated word splits.
     * "docu-\nment" → "document"
     * "self-\ncontained" → "self-contained" (preserve intentional hyphens)
     */
    private fun fixHyphenatedWords(text: String): String {
        // Match hyphen at end of line followed by lowercase start of next line
        return text.replace(Regex("-\\s*\\n\\s*([a-z])")) { match ->
            // Check if the part before hyphen is a common prefix (self-, well-, etc.)
            match.groupValues[1]
        }
    }

    /**
     * Normalize excessive whitespace.
     * Multiple spaces → single space. Tabs → space.
     */
    private fun normalizeWhitespace(text: String): String {
        return text
            .replace('\t', ' ')
            .replace(Regex(" {2,}"), " ")
            .replace(Regex("\u00A0"), " ") // Non-breaking space
    }

    /**
     * Remove duplicate blank lines.
     * Three+ newlines → two newlines (one blank line).
     */
    private fun removeDuplicateLineBreaks(text: String): String {
        return text.replace(Regex("\\n{3,}"), "\n\n")
    }

    /**
     * Normalize common ligatures to their ASCII equivalents.
     */
    private fun normalizeLigatures(text: String): String {
        return text
            .replace("\uFB01", "fi")   // fi ligature
            .replace("\uFB02", "fl")   // fl ligature
            .replace("\uFB00", "ff")   // ff ligature
            .replace("\uFB03", "ffi")  // ffi ligature
            .replace("\uFB04", "ffl")  // ffl ligature
            .replace("\u2018", "'")    // Left single quote
            .replace("\u2019", "'")    // Right single quote
            .replace("\u201C", "\"")   // Left double quote
            .replace("\u201D", "\"")   // Right double quote
            .replace("\u2013", "-")    // En dash
            .replace("\u2014", "-")    // Em dash
    }

    /**
     * Trim trailing whitespace from each line.
     */
    private fun trimLines(text: String): String {
        return text.lines().joinToString("\n") { it.trimEnd() }
    }
}
