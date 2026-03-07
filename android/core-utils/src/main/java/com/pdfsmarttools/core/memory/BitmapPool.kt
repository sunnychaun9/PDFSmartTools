package com.pdfsmarttools.core.memory

import android.graphics.Bitmap

/**
 * Simple bitmap pool for reusing bitmaps with matching dimensions.
 * Reduces allocation pressure during batch page processing where
 * consecutive pages often have the same dimensions.
 *
 * Not thread-safe — intended for use within a single coroutine/thread.
 */
class BitmapPool(private val maxPoolSize: Int = 3) {

    private val pool = mutableListOf<Bitmap>()

    /**
     * Get a bitmap with the specified dimensions and config.
     * Reuses a pooled bitmap if dimensions match, otherwise creates new.
     */
    fun acquire(width: Int, height: Int, config: Bitmap.Config): Bitmap {
        val index = pool.indexOfFirst {
            !it.isRecycled && it.width == width && it.height == height && it.config == config
        }

        if (index >= 0) {
            val bitmap = pool.removeAt(index)
            bitmap.eraseColor(0)
            return bitmap
        }

        return Bitmap.createBitmap(width, height, config)
    }

    /**
     * Return a bitmap to the pool for reuse.
     * If pool is full, the bitmap is recycled immediately.
     */
    fun release(bitmap: Bitmap) {
        if (bitmap.isRecycled) return

        if (pool.size < maxPoolSize) {
            pool.add(bitmap)
        } else {
            bitmap.recycle()
        }
    }

    /** Current number of bitmaps in the pool. */
    val poolSize: Int get() = pool.size

    /**
     * Recycle all pooled bitmaps and clear the pool.
     */
    fun clear() {
        pool.forEach { if (!it.isRecycled) it.recycle() }
        pool.clear()
    }
}
