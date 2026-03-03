package com.pdfsmarttools.pdfcore.model

/**
 * Value object representing a page range (1-indexed, inclusive).
 */
data class PageRange(val start: Int, val end: Int) {
    init {
        require(start >= 1) { "Start page must be >= 1" }
        require(end >= start) { "End page must be >= start page" }
    }

    val pageCount: Int get() = end - start + 1

    override fun toString(): String = if (start == end) "$start" else "$start-$end"
}
