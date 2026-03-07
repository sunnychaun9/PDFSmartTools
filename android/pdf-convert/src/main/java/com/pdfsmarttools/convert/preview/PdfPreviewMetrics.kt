package com.pdfsmarttools.convert.preview

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Performance metrics for the PDF Preview Engine.
 *
 * Tracks render times, cache performance, and memory usage
 * via atomic counters for thread safety.
 */
object PdfPreviewMetrics {

    private val thumbnailRenderCount = AtomicInteger(0)
    private val thumbnailRenderTotalMs = AtomicLong(0)
    private val fullPageRenderCount = AtomicInteger(0)
    private val fullPageRenderTotalMs = AtomicLong(0)
    private val cacheHits = AtomicInteger(0)
    private val cacheMisses = AtomicInteger(0)
    private val renderErrors = AtomicInteger(0)
    private val peakMemoryUsedBytes = AtomicLong(0)
    private val backgroundThumbnailsGenerated = AtomicInteger(0)
    private val backgroundQueueDurationMs = AtomicLong(0)

    fun recordThumbnailRender(durationMs: Long) {
        thumbnailRenderCount.incrementAndGet()
        thumbnailRenderTotalMs.addAndGet(durationMs)
    }

    fun recordFullPageRender(durationMs: Long) {
        fullPageRenderCount.incrementAndGet()
        fullPageRenderTotalMs.addAndGet(durationMs)
    }

    fun recordCacheHit() { cacheHits.incrementAndGet() }
    fun recordCacheMiss() { cacheMisses.incrementAndGet() }
    fun recordError() { renderErrors.incrementAndGet() }

    fun recordBackgroundGeneration(count: Int, durationMs: Long) {
        backgroundThumbnailsGenerated.addAndGet(count)
        backgroundQueueDurationMs.addAndGet(durationMs)
    }

    fun recordMemoryUsage(bytes: Long) {
        var current = peakMemoryUsedBytes.get()
        while (bytes > current) {
            if (peakMemoryUsedBytes.compareAndSet(current, bytes)) break
            current = peakMemoryUsedBytes.get()
        }
    }

    val avgThumbnailRenderMs: Long
        get() {
            val count = thumbnailRenderCount.get()
            return if (count > 0) thumbnailRenderTotalMs.get() / count else 0
        }

    val avgFullPageRenderMs: Long
        get() {
            val count = fullPageRenderCount.get()
            return if (count > 0) fullPageRenderTotalMs.get() / count else 0
        }

    val cacheHitRatePercent: Int
        get() {
            val total = cacheHits.get() + cacheMisses.get()
            return if (total > 0) (cacheHits.get() * 100) / total else 0
        }

    fun snapshot(): PreviewMetricsSnapshot = PreviewMetricsSnapshot(
        thumbnailRenderCount = thumbnailRenderCount.get(),
        avgThumbnailRenderMs = avgThumbnailRenderMs,
        fullPageRenderCount = fullPageRenderCount.get(),
        avgFullPageRenderMs = avgFullPageRenderMs,
        cacheHits = cacheHits.get(),
        cacheMisses = cacheMisses.get(),
        cacheHitRatePercent = cacheHitRatePercent,
        renderErrors = renderErrors.get(),
        peakMemoryUsedMb = peakMemoryUsedBytes.get() / (1024 * 1024),
        backgroundThumbnailsGenerated = backgroundThumbnailsGenerated.get(),
        backgroundQueueDurationMs = backgroundQueueDurationMs.get()
    )

    fun reset() {
        thumbnailRenderCount.set(0)
        thumbnailRenderTotalMs.set(0)
        fullPageRenderCount.set(0)
        fullPageRenderTotalMs.set(0)
        cacheHits.set(0)
        cacheMisses.set(0)
        renderErrors.set(0)
        peakMemoryUsedBytes.set(0)
        backgroundThumbnailsGenerated.set(0)
        backgroundQueueDurationMs.set(0)
    }
}

data class PreviewMetricsSnapshot(
    val thumbnailRenderCount: Int,
    val avgThumbnailRenderMs: Long,
    val fullPageRenderCount: Int,
    val avgFullPageRenderMs: Long,
    val cacheHits: Int,
    val cacheMisses: Int,
    val cacheHitRatePercent: Int,
    val renderErrors: Int,
    val peakMemoryUsedMb: Long,
    val backgroundThumbnailsGenerated: Int = 0,
    val backgroundQueueDurationMs: Long = 0
)
