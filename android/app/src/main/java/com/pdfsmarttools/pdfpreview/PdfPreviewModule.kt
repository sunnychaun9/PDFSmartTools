package com.pdfsmarttools.pdfpreview

import android.util.Log
import com.facebook.react.bridge.*
import com.pdfsmarttools.convert.preview.PdfPreviewEngine
import com.pdfsmarttools.convert.preview.PdfPreviewException
import com.pdfsmarttools.convert.preview.PdfPreviewMetrics
import com.pdfsmarttools.convert.preview.PdfThumbnailCache
import kotlinx.coroutines.*
import java.io.File

/**
 * Production-grade React Native bridge for PDF Preview Engine.
 *
 * Features:
 * - Open/close PDFs with structured error handling
 * - Thumbnail rendering with LRU + disk cache
 * - Progressive thumbnail rendering (low-res → high-res)
 * - Full page rendering with scale control
 * - Prefetch thumbnails for scroll-ahead
 * - Cancel all rendering on unmount
 * - Engine stats and performance metrics
 * - Page info API (dimensions, aspect ratio)
 *
 * All rendering runs on Dispatchers.IO via coroutines. The engine internally
 * uses a 2-thread executor pool with semaphore-bounded concurrency.
 */
class PdfPreviewModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PdfPreview"

    private companion object {
        const val TAG = "PdfPreviewModule"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfPreviewEngine()
    private var prefetchJob: Job? = null

    init {
        // Initialize disk cache
        PdfThumbnailCache.initDiskCache(reactContext.cacheDir)
    }

    private fun thumbnailDir(): File {
        val dir = File(reactContext.cacheDir, "pdf_preview_thumbnails")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun fullPageDir(): File {
        val dir = File(reactContext.cacheDir, "pdf_preview_fullpage")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun rejectWithStructuredError(promise: Promise, e: Exception) {
        when (e) {
            is PdfPreviewException -> promise.reject(e.code, e.message, e)
            is OutOfMemoryError -> promise.reject("OUT_OF_MEMORY", e.message)
            is SecurityException -> promise.reject("PDF_ENCRYPTED", "PDF is password-protected", e)
            else -> promise.reject("PDF_RENDER_ERROR", e.message, e)
        }
    }

    // ── Core Operations ─────────────────────────────────────────────────────

    @ReactMethod
    fun openPdf(filePath: String, promise: Promise) {
        scope.launch {
            try {
                engine.openPdf(filePath)

                val result = Arguments.createMap().apply {
                    putInt("pageCount", engine.pageCount)
                    putString("filePath", filePath)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "openPdf failed", e)
                rejectWithStructuredError(promise, e)
            }
        }
    }

    @ReactMethod
    fun getPageCount(promise: Promise) {
        try {
            promise.resolve(engine.pageCount)
        } catch (e: Exception) {
            rejectWithStructuredError(promise, e)
        }
    }

    @ReactMethod
    fun getPageCountForFile(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val count = engine.getPageCountStatic(filePath)
                promise.resolve(count)
            } catch (e: Exception) {
                Log.e(TAG, "getPageCountForFile failed", e)
                rejectWithStructuredError(promise, e)
            }
        }
    }

    // ── Background Thumbnail Pre-Generation ───────────────────────────────────

    /**
     * Start background thumbnail pre-generation.
     * Renders all page thumbnails in the background so scrolling is instant.
     * Call after openPdf().
     */
    @ReactMethod
    fun startThumbnailPreGeneration(promise: Promise) {
        try {
            val filePath = engine.filePath
            if (filePath == null || !engine.isOpen) {
                promise.reject("NO_PDF_OPEN", "No PDF open")
                return
            }

            engine.startBackgroundThumbnailGeneration(
                filePath = filePath,
                pageCount = engine.pageCount,
                thumbnailDir = thumbnailDir()
            )
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "startThumbnailPreGeneration failed", e)
            rejectWithStructuredError(promise, e)
        }
    }

    // ── Thumbnail Rendering ─────────────────────────────────────────────────

    @ReactMethod
    fun renderThumbnail(pageIndex: Int, promise: Promise) {
        scope.launch {
            try {
                val filePath = engine.filePath
                    ?: throw PdfPreviewException("NO_PDF_OPEN", "No PDF open")

                val width = PdfPreviewEngine.DEFAULT_THUMBNAIL_WIDTH
                val height = PdfPreviewEngine.DEFAULT_THUMBNAIL_HEIGHT

                // Check cache first
                val cached = PdfThumbnailCache.get(filePath, pageIndex, width, height)
                if (cached != null && File(cached).exists()) {
                    val result = Arguments.createMap().apply {
                        putString("path", cached)
                        putInt("width", width)
                        putInt("height", height)
                        putInt("pageIndex", pageIndex)
                        putBoolean("fromCache", true)
                    }
                    promise.resolve(result)
                    return@launch
                }

                val outputFile = File(thumbnailDir(), "thumb_${pageIndex}_${System.currentTimeMillis()}.jpg")
                val thumbnailResult = engine.renderPageThumbnailAsync(
                    pageIndex = pageIndex,
                    outputFile = outputFile
                )

                // Cache the result
                PdfThumbnailCache.put(filePath, pageIndex, width, height, thumbnailResult.path)

                val result = Arguments.createMap().apply {
                    putString("path", thumbnailResult.path)
                    putInt("width", thumbnailResult.width)
                    putInt("height", thumbnailResult.height)
                    putInt("pageIndex", thumbnailResult.pageIndex)
                    putBoolean("fromCache", false)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "renderThumbnail failed for page $pageIndex", e)
                rejectWithStructuredError(promise, e)
            }
        }
    }

    /**
     * Progressive thumbnail: renders low-res first, then high-res.
     * Returns the low-res path immediately; high-res path included when ready.
     */
    @ReactMethod
    fun renderThumbnailProgressive(pageIndex: Int, promise: Promise) {
        scope.launch {
            try {
                val filePath = engine.filePath
                    ?: throw PdfPreviewException("NO_PDF_OPEN", "No PDF open")

                // Check high-res cache first
                val cachedHigh = PdfThumbnailCache.get(
                    filePath, pageIndex,
                    PdfPreviewEngine.HIGH_RES_THUMBNAIL_WIDTH,
                    PdfPreviewEngine.HIGH_RES_THUMBNAIL_HEIGHT
                )
                if (cachedHigh != null && File(cachedHigh).exists()) {
                    val result = Arguments.createMap().apply {
                        putString("lowResPath", cachedHigh)
                        putString("highResPath", cachedHigh)
                        putInt("pageIndex", pageIndex)
                        putBoolean("fromCache", true)
                    }
                    promise.resolve(result)
                    return@launch
                }

                val ts = System.currentTimeMillis()
                val lowResFile = File(thumbnailDir(), "thumb_low_${pageIndex}_${ts}.jpg")
                val highResFile = File(thumbnailDir(), "thumb_high_${pageIndex}_${ts}.jpg")

                val (lowRes, highRes) = engine.renderThumbnailProgressive(
                    pageIndex = pageIndex,
                    lowResFile = lowResFile,
                    highResFile = highResFile
                )

                // Cache high-res
                PdfThumbnailCache.put(
                    filePath, pageIndex,
                    PdfPreviewEngine.HIGH_RES_THUMBNAIL_WIDTH,
                    PdfPreviewEngine.HIGH_RES_THUMBNAIL_HEIGHT,
                    highRes.path
                )

                val result = Arguments.createMap().apply {
                    putString("lowResPath", lowRes.path)
                    putString("highResPath", highRes.path)
                    putInt("pageIndex", pageIndex)
                    putBoolean("fromCache", false)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "renderThumbnailProgressive failed for page $pageIndex", e)
                rejectWithStructuredError(promise, e)
            }
        }
    }

    // ── Full Page Rendering ─────────────────────────────────────────────────

    @ReactMethod
    fun renderPage(pageIndex: Int, scale: Double, promise: Promise) {
        scope.launch {
            try {
                val outputFile = File(fullPageDir(), "page_${pageIndex}_${System.currentTimeMillis()}.jpg")
                val pageResult = engine.renderFullPageAsync(
                    pageIndex = pageIndex,
                    scale = scale.toFloat(),
                    outputFile = outputFile
                )

                val result = Arguments.createMap().apply {
                    putString("path", pageResult.path)
                    putInt("width", pageResult.width)
                    putInt("height", pageResult.height)
                    putInt("pageIndex", pageResult.pageIndex)
                    putInt("pageWidth", pageResult.pageWidth)
                    putInt("pageHeight", pageResult.pageHeight)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "renderPage failed for page $pageIndex", e)
                rejectWithStructuredError(promise, e)
            }
        }
    }

    // ── Page Info ────────────────────────────────────────────────────────────

    @ReactMethod
    fun getPageInfo(pageIndex: Int, promise: Promise) {
        scope.launch {
            try {
                val info = engine.getPageInfo(pageIndex)
                val result = Arguments.createMap().apply {
                    putInt("width", info.width)
                    putInt("height", info.height)
                    putDouble("aspectRatio", info.aspectRatio.toDouble())
                    putInt("rotation", info.rotation)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                rejectWithStructuredError(promise, e)
            }
        }
    }

    @ReactMethod
    fun getPageDimensions(pageIndex: Int, promise: Promise) {
        scope.launch {
            try {
                val dims = engine.getPageDimensions(pageIndex)
                val result = Arguments.createMap().apply {
                    putInt("width", dims.first)
                    putInt("height", dims.second)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                rejectWithStructuredError(promise, e)
            }
        }
    }

    // ── Prefetch & Cancel ───────────────────────────────────────────────────

    /**
     * Prefetch thumbnails for a range of pages.
     * Used for scroll-ahead: when user scrolls near pages, prefetch next batch.
     */
    @ReactMethod
    fun prefetchThumbnails(startPage: Int, endPage: Int, promise: Promise) {
        prefetchJob?.cancel()
        prefetchJob = scope.launch {
            try {
                val filePath = engine.filePath
                    ?: throw PdfPreviewException("NO_PDF_OPEN", "No PDF open")

                val clampedStart = startPage.coerceIn(0, engine.pageCount - 1)
                val clampedEnd = endPage.coerceIn(0, engine.pageCount - 1)
                var prefetched = 0

                for (i in clampedStart..clampedEnd) {
                    if (!isActive) break

                    val width = PdfPreviewEngine.DEFAULT_THUMBNAIL_WIDTH
                    val height = PdfPreviewEngine.DEFAULT_THUMBNAIL_HEIGHT

                    // Skip if already cached
                    val cached = PdfThumbnailCache.get(filePath, i, width, height)
                    if (cached != null && File(cached).exists()) {
                        prefetched++
                        continue
                    }

                    val outputFile = File(thumbnailDir(), "prefetch_${i}_${System.currentTimeMillis()}.jpg")
                    val result = engine.renderPageThumbnailAsync(
                        pageIndex = i,
                        outputFile = outputFile
                    )
                    PdfThumbnailCache.put(filePath, i, width, height, result.path)
                    prefetched++
                }

                val result = Arguments.createMap().apply {
                    putInt("prefetched", prefetched)
                    putInt("startPage", clampedStart)
                    putInt("endPage", clampedEnd)
                }
                promise.resolve(result)
            } catch (e: CancellationException) {
                promise.reject("CANCELLED", "Prefetch was cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "prefetchThumbnails failed", e)
                rejectWithStructuredError(promise, e)
            }
        }
    }

    /**
     * Cancel all pending render operations.
     * Called when leaving the preview screen.
     */
    @ReactMethod
    fun cancelAllRendering(promise: Promise) {
        try {
            prefetchJob?.cancel()
            engine.cancelAll() // Also stops background generation
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    // ── Diagnostics ─────────────────────────────────────────────────────────

    /**
     * Get engine diagnostics: open pages, pool size, cache size, memory.
     */
    @ReactMethod
    fun getEngineStats(promise: Promise) {
        try {
            val stats = engine.getStats()
            val result = Arguments.createMap().apply {
                putBoolean("isOpen", stats.isOpen)
                putInt("pageCount", stats.pageCount)
                putInt("activeRenders", stats.activeRenders)
                putInt("bitmapPoolSize", stats.bitmapPoolSize)
                putInt("thumbnailCacheSize", stats.thumbnailCacheSize)
                putDouble("memoryUsedMB", stats.memoryUsedMb.toDouble())
                putDouble("diskCacheMB", PdfThumbnailCache.diskCacheSizeBytes.toDouble() / (1024 * 1024))
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STATS_ERROR", e.message, e)
        }
    }

    /**
     * Get performance metrics: render times, cache hit ratio, errors.
     */
    @ReactMethod
    fun getPreviewMetrics(promise: Promise) {
        try {
            val metrics = PdfPreviewMetrics.snapshot()
            val result = Arguments.createMap().apply {
                putInt("thumbnailRenderCount", metrics.thumbnailRenderCount)
                putDouble("avgThumbnailRenderMs", metrics.avgThumbnailRenderMs.toDouble())
                putInt("fullPageRenderCount", metrics.fullPageRenderCount)
                putDouble("avgFullPageRenderMs", metrics.avgFullPageRenderMs.toDouble())
                putInt("cacheHits", metrics.cacheHits)
                putInt("cacheMisses", metrics.cacheMisses)
                putInt("cacheHitRatePercent", metrics.cacheHitRatePercent)
                putInt("renderErrors", metrics.renderErrors)
                putDouble("peakMemoryUsedMb", metrics.peakMemoryUsedMb.toDouble())
                putInt("backgroundThumbnailsGenerated", metrics.backgroundThumbnailsGenerated)
                putDouble("backgroundQueueDurationMs", metrics.backgroundQueueDurationMs.toDouble())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("METRICS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getCacheStats(promise: Promise) {
        try {
            val result = Arguments.createMap().apply {
                putInt("size", PdfThumbnailCache.size)
                putInt("hitCount", PdfThumbnailCache.hitCount)
                putInt("missCount", PdfThumbnailCache.missCount)
                putDouble("diskCacheMB", PdfThumbnailCache.diskCacheSizeBytes.toDouble() / (1024 * 1024))
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STATS_ERROR", e.message, e)
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @ReactMethod
    fun closePdf(promise: Promise) {
        scope.launch {
            try {
                prefetchJob?.cancel()
                engine.close()
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "closePdf failed", e)
                rejectWithStructuredError(promise, e)
            }
        }
    }

    @ReactMethod
    fun clearThumbnailCache(promise: Promise) {
        scope.launch {
            try {
                PdfThumbnailCache.clear()
                thumbnailDir().listFiles()?.forEach { it.delete() }
                fullPageDir().listFiles()?.forEach { it.delete() }
                PdfPreviewMetrics.reset()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", e.message, e)
            }
        }
    }

    override fun invalidate() {
        super.invalidate()
        prefetchJob?.cancel()
        engine.close()
        scope.cancel()
        PdfThumbnailCache.clear()
        PdfPreviewMetrics.reset()
    }
}
