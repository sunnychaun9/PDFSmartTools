package com.pdfsmarttools.manipulate.cache

import com.tom_roush.pdfbox.pdmodel.PDDocument

/**
 * A single cache entry holding a parsed PDF document and its metadata.
 *
 * The [document] is loaded in temp-file-only mode for minimal heap usage.
 * Callers may read pages, metadata, and structure from it without re-parsing.
 *
 * **Lifecycle:** The cache manager owns the document and will close it on eviction.
 * Callers must NOT close the document themselves.
 *
 * **Thread safety:** PDDocument is not thread-safe. The cache manager ensures
 * that only one caller accesses a cached document at a time via [PdfCacheManager.withDocument].
 */
class PdfCacheEntry(
    val key: PdfCacheKey,
    val document: PDDocument,
    val pageCount: Int,
    val fileSize: Long,
    val createdAt: Long = System.currentTimeMillis()
) {
    @Volatile
    var lastAccessed: Long = createdAt
        internal set

    /** Estimated memory footprint in bytes (base overhead + ~10KB per page for metadata). */
    val estimatedMemoryBytes: Long
        get() = BASE_OVERHEAD_BYTES + (pageCount * PER_PAGE_BYTES)

    /** Touch this entry to update last-accessed time (for LRU ordering). */
    internal fun touch() {
        lastAccessed = System.currentTimeMillis()
    }

    /** Close the underlying document and release resources. */
    internal fun close() {
        try {
            document.close()
        } catch (_: Exception) { }
    }

    companion object {
        /** Base overhead for a PDDocument loaded in temp-file mode. */
        private const val BASE_OVERHEAD_BYTES = 512L * 1024 // 512 KB

        /** Estimated per-page metadata overhead. */
        private const val PER_PAGE_BYTES = 10L * 1024 // 10 KB
    }
}
