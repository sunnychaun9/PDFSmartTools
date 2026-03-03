package com.pdfsmarttools.debug

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileOutputStream

/**
 * Simulates storage-full conditions by writing a large filler file to cacheDir.
 *
 * Strategy: Writes 1MB chunks to a filler file until cacheDir.usableSpace < 1MB.
 * Leaves 1MB reserve so the OS process doesn't crash.
 *
 * The filler file is on the same partition as engine output, creating genuine disk pressure.
 */
class DebugStorageSimulator {

    private companion object {
        const val TAG = "DebugStorageSim"
        const val FILLER_FILE_NAME = "debug_storage_filler.dat"
        const val CHUNK_SIZE = 1024 * 1024 // 1MB
        const val SAFETY_RESERVE_BYTES = 1L * 1024 * 1024 // 1MB safety reserve
    }

    private var fillerFile: File? = null

    /**
     * Fill storage until less than 1MB remains on the cache partition.
     *
     * @return The size of the filler file created, in bytes.
     */
    fun fillStorage(context: Context): Long {
        cleanup(context)

        val filler = File(context.cacheDir, FILLER_FILE_NAME)
        fillerFile = filler

        val chunk = ByteArray(CHUNK_SIZE)
        var totalWritten = 0L

        try {
            FileOutputStream(filler).use { fos ->
                while (context.cacheDir.usableSpace > SAFETY_RESERVE_BYTES + CHUNK_SIZE) {
                    fos.write(chunk)
                    totalWritten += CHUNK_SIZE
                    if (totalWritten % (100L * CHUNK_SIZE) == 0L) {
                        Log.d(TAG, "Written ${totalWritten / (1024 * 1024)}MB, " +
                                "remaining=${context.cacheDir.usableSpace / (1024 * 1024)}MB")
                    }
                }
                fos.flush()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Storage fill stopped: ${e.message}")
        }

        Log.d(TAG, "Storage simulation active: filler=${totalWritten / (1024 * 1024)}MB, " +
                "remaining=${context.cacheDir.usableSpace / (1024 * 1024)}MB")

        return totalWritten
    }

    /**
     * Delete the filler file and restore storage.
     */
    fun cleanup(context: Context) {
        val filler = fillerFile ?: File(context.cacheDir, FILLER_FILE_NAME)
        if (filler.exists()) {
            val size = filler.length()
            filler.delete()
            Log.d(TAG, "Storage simulation cleaned up: freed ${size / (1024 * 1024)}MB")
        }
        fillerFile = null
    }
}
