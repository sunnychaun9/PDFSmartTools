package com.pdfsmarttools.core.memory

import android.util.Log

/**
 * Memory budget system for bitmap-heavy operations.
 * Tracks active allocations and provides pre-allocation checks
 * to prevent OOM crashes on mid-range devices (3-4GB RAM).
 */
object MemoryBudget {

    private const val TAG = "MemoryBudget"

    /** Reserve 20% of max heap for non-bitmap use (GC overhead, native bridges, etc.) */
    private const val HEAP_RESERVE_FRACTION = 0.20

    private var reservedBytes: Long = 0L
    private val lock = Any()

    /**
     * Available memory in bytes (maxMemory - used - reserve).
     */
    fun availableBytes(): Long {
        val runtime = Runtime.getRuntime()
        val maxMemory = runtime.maxMemory()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        val reserve = (maxMemory * HEAP_RESERVE_FRACTION).toLong()
        return (maxMemory - usedMemory - reserve - reservedBytes).coerceAtLeast(0)
    }

    /**
     * Available memory in megabytes.
     */
    fun availableMemoryMb(): Long = availableBytes() / (1024 * 1024)

    /**
     * Check if a bitmap of the given dimensions can be allocated within budget.
     *
     * @param width Bitmap width in pixels
     * @param height Bitmap height in pixels
     * @param bytesPerPixel 4 for ARGB_8888, 2 for RGB_565
     * @return true if allocation fits in budget
     */
    fun canAllocateBitmap(width: Int, height: Int, bytesPerPixel: Int = 4): Boolean {
        val required = width.toLong() * height.toLong() * bytesPerPixel
        val available = availableBytes()
        val canAllocate = required <= available
        if (!canAllocate) {
            Log.w(TAG, "Bitmap ${width}x${height} (${required / 1024}KB) exceeds budget (${available / 1024}KB available)")
        }
        return canAllocate
    }

    /**
     * Reserve memory for an upcoming allocation.
     * Call [releaseMemory] when the allocation is freed.
     */
    fun reserveMemory(bytes: Long) {
        synchronized(lock) {
            reservedBytes += bytes
        }
    }

    /**
     * Release previously reserved memory.
     */
    fun releaseMemory(bytes: Long) {
        synchronized(lock) {
            reservedBytes = (reservedBytes - bytes).coerceAtLeast(0)
        }
    }

    /**
     * Reset all reservations (call at operation start/end).
     */
    fun reset() {
        synchronized(lock) {
            reservedBytes = 0
        }
    }

    /**
     * Get current heap usage as a percentage of maxMemory.
     */
    fun heapUsagePercent(): Int {
        val runtime = Runtime.getRuntime()
        val used = runtime.totalMemory() - runtime.freeMemory()
        return ((used * 100) / runtime.maxMemory()).toInt()
    }
}
