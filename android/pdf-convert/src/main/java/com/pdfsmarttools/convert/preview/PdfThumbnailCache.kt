package com.pdfsmarttools.convert.preview

import android.util.Log
import android.util.LruCache
import java.io.File

/**
 * Production-grade LRU thumbnail cache for PDF page previews.
 *
 * Two-tier caching:
 * 1. **Memory cache** — LruCache for fast path lookups (max 50 entries)
 * 2. **Disk cache** — /cache/pdf_thumbnails/ for persistence (max 100MB)
 *
 * Cache key includes: filePath + fileLastModified + pageIndex + size
 * This ensures thumbnails auto-invalidate when the source PDF changes.
 *
 * Features:
 * - LRU eviction (max 50 in-memory thumbnails)
 * - Disk cache with 100MB limit and oldest-first eviction
 * - Auto-invalidation when source file changes
 * - Thread-safe via LruCache's synchronized access
 * - Deletes evicted thumbnail files from disk
 * - trimToSize() for memory budget enforcement
 */
object PdfThumbnailCache {

    private const val TAG = "PdfThumbnailCache"
    private const val MAX_ENTRIES = 50
    private const val MAX_DISK_CACHE_BYTES = 100L * 1024 * 1024 // 100MB

    private var diskCacheDir: File? = null

    private val cache = object : LruCache<String, CachedThumbnail>(MAX_ENTRIES) {
        override fun entryRemoved(
            evicted: Boolean,
            key: String,
            oldValue: CachedThumbnail,
            newValue: CachedThumbnail?
        ) {
            if (evicted && newValue == null) {
                try {
                    val file = File(oldValue.path)
                    if (file.exists()) file.delete()
                } catch (_: Exception) {}
                Log.d(TAG, "Evicted: $key")
            }
        }
    }

    /**
     * Initialize disk cache directory. Call once during app startup.
     * If not initialized, disk caching is skipped silently.
     */
    fun initDiskCache(cacheDir: File) {
        val dir = File(cacheDir, "pdf_thumbnails")
        if (!dir.exists()) dir.mkdirs()
        diskCacheDir = dir
        trimDiskCache()
    }

    /**
     * Get a cached thumbnail path, or null if not cached / stale.
     *
     * Checks memory cache first, then disk cache.
     * Cache key includes fileLastModified for auto-invalidation.
     */
    fun get(filePath: String, pageIndex: Int, width: Int, height: Int): String? {
        val sourceFile = File(filePath)
        if (!sourceFile.exists()) return null

        val key = makeKey(filePath, sourceFile.lastModified(), pageIndex, width, height)
        val cached = cache.get(key)

        if (cached != null) {
            // Validate thumbnail file still exists
            if (File(cached.path).exists()) {
                PdfPreviewMetrics.recordCacheHit()
                return cached.path
            }
            cache.remove(key)
        }

        // Check disk cache
        val diskFile = getDiskCacheFile(key)
        if (diskFile != null && diskFile.exists()) {
            // Promote to memory cache
            cache.put(key, CachedThumbnail(
                path = diskFile.absolutePath,
                sourceSize = sourceFile.length(),
                sourceLastModified = sourceFile.lastModified()
            ))
            PdfPreviewMetrics.recordCacheHit()
            return diskFile.absolutePath
        }

        PdfPreviewMetrics.recordCacheMiss()
        return null
    }

    /**
     * Store a rendered thumbnail in both memory and disk cache.
     */
    fun put(filePath: String, pageIndex: Int, width: Int, height: Int, thumbnailPath: String) {
        val sourceFile = File(filePath)
        if (!sourceFile.exists()) return

        val key = makeKey(filePath, sourceFile.lastModified(), pageIndex, width, height)
        cache.put(key, CachedThumbnail(
            path = thumbnailPath,
            sourceSize = sourceFile.length(),
            sourceLastModified = sourceFile.lastModified()
        ))

        // Copy to disk cache if initialized
        copyToDiskCache(key, thumbnailPath)
    }

    /**
     * Invalidate all cached thumbnails for a specific PDF file.
     */
    fun invalidate(filePath: String) {
        val snapshot = cache.snapshot()
        for (key in snapshot.keys) {
            // Key format starts with hash of filePath
            if (key.startsWith(filePath.hashCode().toString())) {
                cache.remove(key)
            }
        }
    }

    /**
     * Trim the cache to the specified size.
     * Used by the memory budget enforcer.
     */
    fun trimToSize(maxSize: Int) {
        cache.trimToSize(maxSize.coerceAtLeast(0))
    }

    /**
     * Clear all cached thumbnails and delete files.
     */
    fun clear() {
        cache.evictAll()
        // Clear disk cache
        diskCacheDir?.listFiles()?.forEach { it.delete() }
        Log.d(TAG, "Cache cleared (memory + disk)")
    }

    /** Current number of cached thumbnails. */
    val size: Int get() = cache.size()

    /** Cache hit/miss stats. */
    val hitCount: Int get() = cache.hitCount()
    val missCount: Int get() = cache.missCount()

    /** Disk cache size in bytes. */
    val diskCacheSizeBytes: Long
        get() = diskCacheDir?.listFiles()?.sumOf { it.length() } ?: 0L

    /**
     * Cache key includes lastModified to auto-invalidate on file change.
     * Format: `hash|lastModified|pageIndex|WxH`
     */
    private fun makeKey(filePath: String, lastModified: Long, pageIndex: Int, width: Int, height: Int): String {
        return "${filePath.hashCode()}|${lastModified}|${pageIndex}|${width}x${height}"
    }

    private fun getDiskCacheFile(key: String): File? {
        val dir = diskCacheDir ?: return null
        val fileName = "thumb_${key.hashCode()}.jpg"
        val file = File(dir, fileName)
        return if (file.exists()) file else null
    }

    private fun copyToDiskCache(key: String, sourcePath: String) {
        val dir = diskCacheDir ?: return
        try {
            val fileName = "thumb_${key.hashCode()}.jpg"
            val destFile = File(dir, fileName)
            if (!destFile.exists()) {
                File(sourcePath).copyTo(destFile, overwrite = false)
            }
            // Trim if disk cache exceeds limit
            trimDiskCache()
        } catch (e: Exception) {
            Log.w(TAG, "Disk cache write failed: ${e.message}")
        }
    }

    /**
     * Trim disk cache to MAX_DISK_CACHE_BYTES by deleting oldest files.
     */
    private fun trimDiskCache() {
        val dir = diskCacheDir ?: return
        try {
            val files = dir.listFiles() ?: return
            var totalSize = files.sumOf { it.length() }

            if (totalSize <= MAX_DISK_CACHE_BYTES) return

            // Sort by last modified (oldest first)
            val sorted = files.sortedBy { it.lastModified() }
            for (file in sorted) {
                if (totalSize <= MAX_DISK_CACHE_BYTES) break
                totalSize -= file.length()
                file.delete()
                Log.d(TAG, "Disk cache evicted: ${file.name}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Disk cache trim failed: ${e.message}")
        }
    }
}

private data class CachedThumbnail(
    val path: String,
    val sourceSize: Long,
    val sourceLastModified: Long
)
