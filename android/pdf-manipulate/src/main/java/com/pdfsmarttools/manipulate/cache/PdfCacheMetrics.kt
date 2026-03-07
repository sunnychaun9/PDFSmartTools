package com.pdfsmarttools.manipulate.cache

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Thread-safe cache performance metrics.
 *
 * All counters use atomic operations for lock-free concurrent updates.
 * Metrics are cumulative from the last [reset] call.
 */
class PdfCacheMetrics {

    private val _hits = AtomicInteger(0)
    private val _misses = AtomicInteger(0)
    private val _evictions = AtomicInteger(0)
    private val _memoryPressureEvictions = AtomicInteger(0)
    private val _totalSavedMs = AtomicLong(0)

    /** Number of cache hits (document found and reused). */
    val hits: Int get() = _hits.get()

    /** Number of cache misses (document not found, had to parse). */
    val misses: Int get() = _misses.get()

    /** Number of LRU evictions (cache full, oldest removed). */
    val evictions: Int get() = _evictions.get()

    /** Number of evictions triggered by memory pressure. */
    val memoryPressureEvictions: Int get() = _memoryPressureEvictions.get()

    /** Estimated total milliseconds saved by cache hits. */
    val totalSavedMs: Long get() = _totalSavedMs.get()

    /** Total requests (hits + misses). */
    val totalRequests: Int get() = hits + misses

    /** Cache hit rate as a percentage [0, 100]. */
    val hitRatePercent: Int
        get() {
            val total = totalRequests
            return if (total > 0) ((hits * 100) / total) else 0
        }

    internal fun recordHit(savedMs: Long = 0L) {
        _hits.incrementAndGet()
        if (savedMs > 0) _totalSavedMs.addAndGet(savedMs)
    }

    internal fun recordMiss() {
        _misses.incrementAndGet()
    }

    internal fun recordEviction() {
        _evictions.incrementAndGet()
    }

    internal fun recordMemoryPressureEviction() {
        _memoryPressureEvictions.incrementAndGet()
    }

    /** Reset all counters to zero. */
    fun reset() {
        _hits.set(0)
        _misses.set(0)
        _evictions.set(0)
        _memoryPressureEvictions.set(0)
        _totalSavedMs.set(0)
    }

    /** Snapshot of current metrics for reporting. */
    fun snapshot(): CacheMetricsSnapshot = CacheMetricsSnapshot(
        hits = hits,
        misses = misses,
        evictions = evictions,
        memoryPressureEvictions = memoryPressureEvictions,
        totalSavedMs = totalSavedMs,
        hitRatePercent = hitRatePercent,
        totalRequests = totalRequests
    )

    override fun toString(): String =
        "CacheMetrics(hits=$hits, misses=$misses, evictions=$evictions, " +
                "memoryEvictions=$memoryPressureEvictions, hitRate=$hitRatePercent%, " +
                "savedMs=$totalSavedMs)"
}

/**
 * Immutable snapshot of cache metrics at a point in time.
 */
data class CacheMetricsSnapshot(
    val hits: Int,
    val misses: Int,
    val evictions: Int,
    val memoryPressureEvictions: Int,
    val totalSavedMs: Long,
    val hitRatePercent: Int,
    val totalRequests: Int
)
