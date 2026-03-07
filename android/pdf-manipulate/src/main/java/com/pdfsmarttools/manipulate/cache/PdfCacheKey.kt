package com.pdfsmarttools.manipulate.cache

import java.io.File

/**
 * Composite cache key for parsed PDF documents.
 *
 * A cached entry is valid only when ALL three components match:
 * - [path]: absolute file path
 * - [size]: file size in bytes
 * - [lastModified]: file last-modified timestamp
 *
 * If any component changes (e.g., file is re-saved), the key no longer matches
 * and the stale cache entry is automatically invalidated.
 */
data class PdfCacheKey(
    val path: String,
    val size: Long,
    val lastModified: Long
) {
    companion object {
        /**
         * Create a cache key from a [File].
         * Returns `null` if the file does not exist.
         */
        fun fromFile(file: File): PdfCacheKey? {
            if (!file.exists()) return null
            return PdfCacheKey(
                path = file.absolutePath,
                size = file.length(),
                lastModified = file.lastModified()
            )
        }

        /**
         * Create a cache key from a file path string.
         * Returns `null` if the file does not exist or path is blank.
         */
        fun fromPath(path: String): PdfCacheKey? {
            if (path.isBlank() || path.startsWith("content://")) return null
            return fromFile(File(path))
        }
    }
}
