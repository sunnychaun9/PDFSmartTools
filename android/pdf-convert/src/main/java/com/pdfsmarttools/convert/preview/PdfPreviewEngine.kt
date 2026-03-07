package com.pdfsmarttools.convert.preview

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.pdfsmarttools.core.memory.BitmapPool
import com.pdfsmarttools.core.memory.MemoryBudget
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Production-grade PDF Preview Engine — fast page thumbnail and full-page rendering.
 *
 * Uses [android.graphics.pdf.PdfRenderer] (native Android API) for optimal
 * rendering performance. Does NOT use PDFBox.
 *
 * Production features:
 * - Thread-safe rendering via dedicated 2-thread executor pool
 * - Render queue with max 2 concurrent renders (Semaphore-bounded)
 * - Cancellable render operations
 * - Progressive thumbnail rendering (low-res → full-res)
 * - Memory budget enforcement (total preview bitmaps ≤ 48MB)
 * - BitmapPool for efficient reuse
 * - Structured error handling for corrupted/encrypted PDFs
 * - Reusable across preview, split, extract, merge, and organize tools
 *
 * Lifecycle:
 * ```
 * openPdf(filePath) → renderPageThumbnail/renderFullPage → cancelAll() → close()
 * ```
 */
class PdfPreviewEngine {

    companion object {
        private const val TAG = "PdfPreviewEngine"

        /** Default thumbnail dimension (px). */
        const val DEFAULT_THUMBNAIL_WIDTH = 200
        const val DEFAULT_THUMBNAIL_HEIGHT = 280

        /** Low-res progressive thumbnail (px). */
        const val LOW_RES_THUMBNAIL_WIDTH = 100
        const val LOW_RES_THUMBNAIL_HEIGHT = 140

        /** High-res thumbnail for upgraded progressive render (px). */
        const val HIGH_RES_THUMBNAIL_WIDTH = 300
        const val HIGH_RES_THUMBNAIL_HEIGHT = 420

        /** Max pixels per bitmap to prevent OOM. */
        private const val MAX_BITMAP_PIXELS = 25_000_000L

        /** Max concurrent render operations. */
        private const val MAX_CONCURRENT_RENDERS = 2

        /** Total preview bitmap memory budget (48MB). */
        private const val MAX_PREVIEW_MEMORY_BYTES = 48L * 1024 * 1024

        /** Background pre-generation: first batch covers pages 0–11. */
        private const val BG_INITIAL_BATCH_SIZE = 12

        /** Background pre-generation: subsequent batch size. */
        private const val BG_BATCH_SIZE = 8

        /** Sleep between background batches to prevent CPU spikes. */
        private const val BG_BATCH_SLEEP_MS = 20L
    }

    private var renderer: PdfRenderer? = null
    private var fileDescriptor: ParcelFileDescriptor? = null
    private var currentFilePath: String? = null
    private val bitmapPool = BitmapPool(maxPoolSize = 4)

    /** Dedicated thread pool for rendering — never blocks UI thread. */
    private val renderExecutor = Executors.newFixedThreadPool(2) { runnable ->
        Thread(runnable, "PdfPreviewRender").apply { isDaemon = true }
    }

    /** Semaphore to limit concurrent render operations. */
    private val renderSemaphore = Semaphore(MAX_CONCURRENT_RENDERS)

    /** Flag to cancel all pending renders. */
    private val cancelled = AtomicBoolean(false)

    /** Dedicated single-thread executor for background thumbnail pre-generation. */
    private var backgroundThumbnailExecutor: ExecutorService? = null

    /** Flag to cancel background pre-generation independently. */
    private val backgroundCancelled = AtomicBoolean(false)

    /** Counter for background thumbnails generated. */
    private val backgroundThumbnailsGenerated = AtomicInteger(0)

    /** Tracks total memory used by preview bitmaps. */
    @Volatile
    private var totalBitmapMemory = 0L

    /** Whether a PDF is currently open. */
    val isOpen: Boolean get() = renderer != null

    /** Total page count. Available after [openPdf]. */
    val pageCount: Int get() = renderer?.pageCount ?: 0

    /** The currently opened file path. */
    val filePath: String? get() = currentFilePath

    /** Current render queue depth (approximate). */
    val activeRenders: Int get() = MAX_CONCURRENT_RENDERS - renderSemaphore.availablePermits()

    /**
     * Open a PDF file for preview rendering.
     *
     * Handles corrupted/encrypted PDFs with structured errors.
     *
     * @param filePath Absolute path to the PDF file.
     * @throws IllegalArgumentException if file doesn't exist.
     * @throws PdfPreviewException for corrupted or encrypted PDFs.
     */
    fun openPdf(filePath: String) {
        synchronized(this) {
            if (renderer != null) {
                close()
            }

            val file = File(filePath)
            if (!file.exists()) throw IllegalArgumentException("PDF file not found: $filePath")

            try {
                val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val pdfRenderer = PdfRenderer(fd)

                this.fileDescriptor = fd
                this.renderer = pdfRenderer
                this.currentFilePath = filePath
                this.cancelled.set(false)
                this.totalBitmapMemory = 0L

                Log.d(TAG, "Opened: ${file.name}, ${pdfRenderer.pageCount} pages")
            } catch (e: SecurityException) {
                throw PdfPreviewException("PDF_ENCRYPTED", "PDF is password-protected: ${file.name}", e)
            } catch (e: Exception) {
                throw PdfPreviewException("PDF_OPEN_FAILED", "Failed to open PDF: ${e.message}", e)
            }
        }
    }

    /**
     * Get the page count without keeping the file open.
     */
    fun getPageCountStatic(filePath: String): Int {
        val file = File(filePath)
        if (!file.exists()) return 0

        val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        return try {
            val r = PdfRenderer(fd)
            val count = r.pageCount
            r.close()
            count
        } catch (e: Exception) {
            Log.e(TAG, "getPageCountStatic failed: ${e.message}")
            0
        } finally {
            fd.close()
        }
    }

    /**
     * Render a page thumbnail on the render executor (thread-safe).
     *
     * Respects the render semaphore (max 2 concurrent) and cancellation flag.
     * Enforces 48MB total bitmap memory budget.
     *
     * @param pageIndex 0-based page index.
     * @param width Target thumbnail width in pixels.
     * @param height Target thumbnail height in pixels.
     * @param outputFile File to write the JPEG thumbnail to.
     * @param quality JPEG quality (1-100).
     * @return [ThumbnailResult] with path and dimensions.
     */
    fun renderPageThumbnail(
        pageIndex: Int,
        width: Int = DEFAULT_THUMBNAIL_WIDTH,
        height: Int = DEFAULT_THUMBNAIL_HEIGHT,
        outputFile: File,
        quality: Int = 80
    ): ThumbnailResult {
        val startTime = System.currentTimeMillis()
        val pdfRenderer = renderer ?: throw PdfPreviewException("NO_PDF_OPEN", "No PDF open")
        require(pageIndex in 0 until pdfRenderer.pageCount) {
            "Page index $pageIndex out of range [0, ${pdfRenderer.pageCount})"
        }

        if (cancelled.get()) throw PdfPreviewException("CANCELLED", "Rendering was cancelled")

        renderSemaphore.acquire()
        try {
            if (cancelled.get()) throw PdfPreviewException("CANCELLED", "Rendering was cancelled")

            return synchronized(this) {
                renderThumbnailInternal(pdfRenderer, pageIndex, width, height, outputFile, quality)
            }.also {
                val elapsed = System.currentTimeMillis() - startTime
                PdfPreviewMetrics.recordThumbnailRender(elapsed)
            }
        } finally {
            renderSemaphore.release()
        }
    }

    /**
     * Render a page thumbnail as a suspend function (coroutine-friendly).
     */
    suspend fun renderPageThumbnailAsync(
        pageIndex: Int,
        width: Int = DEFAULT_THUMBNAIL_WIDTH,
        height: Int = DEFAULT_THUMBNAIL_HEIGHT,
        outputFile: File,
        quality: Int = 80
    ): ThumbnailResult = suspendCancellableCoroutine { cont ->
        renderExecutor.execute {
            try {
                val result = renderPageThumbnail(pageIndex, width, height, outputFile, quality)
                cont.resume(result)
            } catch (e: Exception) {
                cont.resumeWithException(e)
            }
        }
    }

    /**
     * Progressive thumbnail rendering: first low-res, then full-res.
     *
     * Returns two results: [0] = low-res (fast), [1] = high-res (quality).
     * Caller can display low-res immediately and swap to high-res when ready.
     */
    fun renderThumbnailProgressive(
        pageIndex: Int,
        lowResFile: File,
        highResFile: File
    ): Pair<ThumbnailResult, ThumbnailResult> {
        // Phase 1: Low-res (100px wide, fast)
        val lowRes = renderPageThumbnail(
            pageIndex = pageIndex,
            width = LOW_RES_THUMBNAIL_WIDTH,
            height = LOW_RES_THUMBNAIL_HEIGHT,
            outputFile = lowResFile,
            quality = 60
        )

        // Phase 2: High-res (300px wide, quality)
        val highRes = renderPageThumbnail(
            pageIndex = pageIndex,
            width = HIGH_RES_THUMBNAIL_WIDTH,
            height = HIGH_RES_THUMBNAIL_HEIGHT,
            outputFile = highResFile,
            quality = 85
        )

        return lowRes to highRes
    }

    private fun renderThumbnailInternal(
        pdfRenderer: PdfRenderer,
        pageIndex: Int,
        width: Int,
        height: Int,
        outputFile: File,
        quality: Int
    ): ThumbnailResult {
        val page = pdfRenderer.openPage(pageIndex)
        try {
            val pageAspect = page.width.toFloat() / page.height.toFloat()
            val targetAspect = width.toFloat() / height.toFloat()

            val (renderWidth, renderHeight) = if (pageAspect > targetAspect) {
                width to (width / pageAspect).toInt()
            } else {
                (height * pageAspect).toInt() to height
            }

            val bitmapBytes = renderWidth.toLong() * renderHeight * 2
            enforceBitmapMemoryBudget(bitmapBytes)

            if (!MemoryBudget.canAllocateBitmap(renderWidth, renderHeight, 2)) {
                throw OutOfMemoryError("Not enough memory for thumbnail ${renderWidth}x${renderHeight}")
            }

            val bitmap = bitmapPool.acquire(renderWidth, renderHeight, Bitmap.Config.RGB_565)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

            outputFile.parentFile?.mkdirs()
            FileOutputStream(outputFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            }
            bitmapPool.release(bitmap)

            trackBitmapMemory(bitmapBytes)

            return ThumbnailResult(
                path = outputFile.absolutePath,
                width = renderWidth,
                height = renderHeight,
                pageIndex = pageIndex
            )
        } catch (e: Exception) {
            PdfPreviewMetrics.recordError()
            throw PdfPreviewException(
                "PDF_RENDER_ERROR",
                "Failed to render page $pageIndex: ${e.message}",
                e
            )
        } finally {
            page.close()
        }
    }

    /**
     * Render a full-resolution page and save to a file.
     *
     * Thread-safe via render semaphore and synchronized renderer access.
     */
    fun renderFullPage(
        pageIndex: Int,
        scale: Float = 1.5f,
        outputFile: File,
        format: String = "jpeg",
        quality: Int = 90
    ): FullPageResult {
        val startTime = System.currentTimeMillis()
        val pdfRenderer = renderer ?: throw PdfPreviewException("NO_PDF_OPEN", "No PDF open")
        require(pageIndex in 0 until pdfRenderer.pageCount) {
            "Page index $pageIndex out of range [0, ${pdfRenderer.pageCount})"
        }

        if (cancelled.get()) throw PdfPreviewException("CANCELLED", "Rendering was cancelled")

        renderSemaphore.acquire()
        try {
            if (cancelled.get()) throw PdfPreviewException("CANCELLED", "Rendering was cancelled")

            return synchronized(this) {
                renderFullPageInternal(pdfRenderer, pageIndex, scale, outputFile, format, quality)
            }.also {
                val elapsed = System.currentTimeMillis() - startTime
                PdfPreviewMetrics.recordFullPageRender(elapsed)
            }
        } finally {
            renderSemaphore.release()
        }
    }

    /**
     * Render a full page as a suspend function (coroutine-friendly).
     */
    suspend fun renderFullPageAsync(
        pageIndex: Int,
        scale: Float = 1.5f,
        outputFile: File,
        format: String = "jpeg",
        quality: Int = 90
    ): FullPageResult = suspendCancellableCoroutine { cont ->
        renderExecutor.execute {
            try {
                val result = renderFullPage(pageIndex, scale, outputFile, format, quality)
                cont.resume(result)
            } catch (e: Exception) {
                cont.resumeWithException(e)
            }
        }
    }

    private fun renderFullPageInternal(
        pdfRenderer: PdfRenderer,
        pageIndex: Int,
        scale: Float,
        outputFile: File,
        format: String,
        quality: Int
    ): FullPageResult {
        val page = pdfRenderer.openPage(pageIndex)
        try {
            var renderWidth = (page.width * scale).toInt()
            var renderHeight = (page.height * scale).toInt()

            // Cap to prevent OOM
            val pixelCount = renderWidth.toLong() * renderHeight.toLong()
            if (pixelCount > MAX_BITMAP_PIXELS) {
                val reduction = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                renderWidth = (renderWidth * reduction).toInt()
                renderHeight = (renderHeight * reduction).toInt()
            }

            val isPng = format.lowercase() == "png"
            val config = if (isPng) Bitmap.Config.ARGB_8888 else Bitmap.Config.RGB_565
            val bytesPerPixel = if (isPng) 4 else 2

            if (!MemoryBudget.canAllocateBitmap(renderWidth, renderHeight, bytesPerPixel)) {
                renderWidth /= 2
                renderHeight /= 2
                if (!MemoryBudget.canAllocateBitmap(renderWidth, renderHeight, bytesPerPixel)) {
                    throw OutOfMemoryError("Not enough memory for page ${renderWidth}x${renderHeight}")
                }
            }

            val bitmapBytes = renderWidth.toLong() * renderHeight * bytesPerPixel
            enforceBitmapMemoryBudget(bitmapBytes)

            val bitmap = bitmapPool.acquire(renderWidth, renderHeight, config)
            if (!isPng) bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

            outputFile.parentFile?.mkdirs()
            val compressFormat = if (isPng) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
            val effectiveQuality = if (isPng) 100 else quality

            FileOutputStream(outputFile).use { out ->
                bitmap.compress(compressFormat, effectiveQuality, out)
            }
            bitmapPool.release(bitmap)

            trackBitmapMemory(bitmapBytes)

            return FullPageResult(
                path = outputFile.absolutePath,
                width = renderWidth,
                height = renderHeight,
                pageIndex = pageIndex,
                pageWidth = page.width,
                pageHeight = page.height
            )
        } catch (e: OutOfMemoryError) {
            PdfPreviewMetrics.recordError()
            throw e
        } catch (e: Exception) {
            PdfPreviewMetrics.recordError()
            throw PdfPreviewException(
                "PDF_RENDER_ERROR",
                "Failed to render page $pageIndex: ${e.message}",
                e
            )
        } finally {
            page.close()
        }
    }

    /**
     * Get page info including dimensions, aspect ratio, and rotation.
     */
    fun getPageInfo(pageIndex: Int): PageInfo {
        val pdfRenderer = renderer ?: throw PdfPreviewException("NO_PDF_OPEN", "No PDF open")
        require(pageIndex in 0 until pdfRenderer.pageCount) {
            "Page index $pageIndex out of range [0, ${pdfRenderer.pageCount})"
        }

        val page = pdfRenderer.openPage(pageIndex)
        try {
            return PageInfo(
                width = page.width,
                height = page.height,
                aspectRatio = page.width.toFloat() / page.height.toFloat(),
                rotation = 0 // PdfRenderer doesn't expose rotation directly
            )
        } finally {
            page.close()
        }
    }

    /**
     * Get page dimensions (width, height in PDF points) for a specific page.
     */
    fun getPageDimensions(pageIndex: Int): Pair<Int, Int> {
        val info = getPageInfo(pageIndex)
        return Pair(info.width, info.height)
    }

    /**
     * Start background thumbnail pre-generation for all pages.
     *
     * Phase 1: Renders pages 0–11 immediately (first visible screen).
     * Phase 2: Renders remaining pages in batches of 8 with 20ms sleep between batches.
     *
     * Skips pages already in cache. Respects memory budget and cancellation.
     * Runs on a dedicated single-thread executor — never blocks the UI or render threads.
     *
     * @param filePath The PDF file path (for cache key lookups).
     * @param pageCount Total number of pages in the PDF.
     * @param thumbnailDir Directory to write thumbnail files to.
     */
    fun startBackgroundThumbnailGeneration(
        filePath: String,
        pageCount: Int,
        thumbnailDir: File
    ) {
        // Cancel any previous background generation
        stopBackgroundThumbnailGeneration()

        backgroundCancelled.set(false)
        backgroundThumbnailsGenerated.set(0)

        val executor = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "PdfBgThumbnailGen").apply {
                isDaemon = true
                priority = Thread.MIN_PRIORITY
            }
        }
        backgroundThumbnailExecutor = executor

        val startTime = System.currentTimeMillis()

        executor.execute {
            try {
                val width = DEFAULT_THUMBNAIL_WIDTH
                val height = DEFAULT_THUMBNAIL_HEIGHT

                // Phase 1: pages 0–11 (initial visible screen)
                val phase1End = BG_INITIAL_BATCH_SIZE.coerceAtMost(pageCount)
                for (i in 0 until phase1End) {
                    if (backgroundCancelled.get() || cancelled.get()) break
                    renderBackgroundThumbnail(filePath, i, width, height, thumbnailDir)
                }

                // Phase 2: remaining pages in batches of 8
                var batchStart = phase1End
                while (batchStart < pageCount) {
                    if (backgroundCancelled.get() || cancelled.get()) break

                    // Check memory pressure
                    if (!MemoryBudget.canAllocateBitmap(width, height, 2)) {
                        Log.d(TAG, "Background generation paused: memory pressure at page $batchStart")
                        break
                    }

                    val batchEnd = (batchStart + BG_BATCH_SIZE).coerceAtMost(pageCount)
                    for (i in batchStart until batchEnd) {
                        if (backgroundCancelled.get() || cancelled.get()) break
                        renderBackgroundThumbnail(filePath, i, width, height, thumbnailDir)
                    }

                    batchStart = batchEnd

                    // Sleep between batches to prevent CPU spikes
                    if (batchStart < pageCount && !backgroundCancelled.get()) {
                        try { Thread.sleep(BG_BATCH_SLEEP_MS) } catch (_: InterruptedException) { break }
                    }
                }

                val durationMs = System.currentTimeMillis() - startTime
                val generated = backgroundThumbnailsGenerated.get()
                PdfPreviewMetrics.recordBackgroundGeneration(generated, durationMs)
                Log.d(TAG, "Background generation complete: $generated/$pageCount thumbnails in ${durationMs}ms")
            } catch (e: Exception) {
                Log.e(TAG, "Background generation failed: ${e.message}")
            }
        }
    }

    private fun renderBackgroundThumbnail(
        filePath: String,
        pageIndex: Int,
        width: Int,
        height: Int,
        thumbnailDir: File
    ) {
        try {
            // Skip if already cached
            val cached = PdfThumbnailCache.get(filePath, pageIndex, width, height)
            if (cached != null && File(cached).exists()) return

            // Check memory budget before rendering
            if (!MemoryBudget.canAllocateBitmap(width, height, 2)) return

            val outputFile = File(thumbnailDir, "bg_thumb_${pageIndex}_${System.currentTimeMillis()}.jpg")
            val result = renderPageThumbnail(
                pageIndex = pageIndex,
                width = width,
                height = height,
                outputFile = outputFile
            )

            PdfThumbnailCache.put(filePath, pageIndex, width, height, result.path)
            backgroundThumbnailsGenerated.incrementAndGet()
        } catch (e: PdfPreviewException) {
            if (e.code == "CANCELLED") return
            Log.w(TAG, "Background thumbnail failed for page $pageIndex: ${e.message}")
        } catch (_: Exception) {}
    }

    /**
     * Stop background thumbnail pre-generation.
     */
    fun stopBackgroundThumbnailGeneration() {
        backgroundCancelled.set(true)
        backgroundThumbnailExecutor?.shutdownNow()
        backgroundThumbnailExecutor = null
    }

    /**
     * Cancel all pending and active render operations, including background generation.
     */
    fun cancelAll() {
        cancelled.set(true)
        stopBackgroundThumbnailGeneration()
        Log.d(TAG, "All rendering cancelled")
    }

    /**
     * Get current engine diagnostics.
     */
    fun getStats(): EngineStats {
        return EngineStats(
            isOpen = isOpen,
            pageCount = pageCount,
            activeRenders = activeRenders,
            bitmapPoolSize = bitmapPool.poolSize,
            thumbnailCacheSize = PdfThumbnailCache.size,
            memoryUsedMb = totalBitmapMemory / (1024 * 1024),
            metrics = PdfPreviewMetrics.snapshot()
        )
    }

    /**
     * Enforce 48MB bitmap memory budget.
     * When exceeded, triggers eviction of oldest thumbnails from cache.
     */
    private fun enforceBitmapMemoryBudget(requiredBytes: Long) {
        if (totalBitmapMemory + requiredBytes > MAX_PREVIEW_MEMORY_BYTES) {
            // Evict oldest thumbnails to make room
            PdfThumbnailCache.trimToSize(PdfThumbnailCache.size / 2)
            bitmapPool.clear()
            totalBitmapMemory = 0L
            System.gc()
            Log.d(TAG, "Bitmap memory budget enforced: evicted thumbnails, cleared pool")
        }

        PdfPreviewMetrics.recordMemoryUsage(totalBitmapMemory + requiredBytes)
    }

    private fun trackBitmapMemory(bytes: Long) {
        totalBitmapMemory += bytes
    }

    /**
     * Close the PDF and release all resources.
     * Safe to call multiple times.
     */
    fun close() {
        synchronized(this) {
            cancelled.set(true)
            stopBackgroundThumbnailGeneration()
            try { renderer?.close() } catch (_: Exception) {}
            try { fileDescriptor?.close() } catch (_: Exception) {}
            bitmapPool.clear()
            renderer = null
            fileDescriptor = null
            currentFilePath = null
            totalBitmapMemory = 0L
            Log.d(TAG, "Closed")
        }
    }

    /**
     * Shutdown the engine completely (including executor).
     * Call only when the engine will no longer be used.
     */
    fun shutdown() {
        close()
        renderExecutor.shutdownNow()
        Log.d(TAG, "Shutdown complete")
    }
}

data class ThumbnailResult(
    val path: String,
    val width: Int,
    val height: Int,
    val pageIndex: Int
)

data class FullPageResult(
    val path: String,
    val width: Int,
    val height: Int,
    val pageIndex: Int,
    val pageWidth: Int,
    val pageHeight: Int
)

data class PageInfo(
    val width: Int,
    val height: Int,
    val aspectRatio: Float,
    val rotation: Int
)

data class EngineStats(
    val isOpen: Boolean,
    val pageCount: Int,
    val activeRenders: Int,
    val bitmapPoolSize: Int,
    val thumbnailCacheSize: Int,
    val memoryUsedMb: Long,
    val metrics: PreviewMetricsSnapshot
)

/**
 * Structured error for preview operations.
 *
 * Error codes:
 * - PDF_OPEN_FAILED — corrupted or unreadable PDF
 * - PDF_ENCRYPTED — password-protected PDF
 * - PDF_RENDER_ERROR — page rendering failure
 * - NO_PDF_OPEN — engine not initialized
 * - CANCELLED — operation was cancelled
 */
class PdfPreviewException(
    val code: String,
    override val message: String,
    cause: Throwable? = null
) : Exception(message, cause)
