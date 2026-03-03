package com.pdfsmarttools.debug

import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget

/**
 * Simulates low-memory conditions by inflating MemoryBudget's reserved bytes.
 *
 * Strategy: Uses the existing public API [MemoryBudget.reserveMemory] to artificially
 * inflate reserved bytes, which reduces the value returned by [MemoryBudget.availableMemoryMb].
 * The orchestrator's enforceMemoryPolicy() calls that same method, so it sees the
 * artificially reduced availability and triggers PdfError.OutOfMemory.
 *
 * No production code is modified. Fully reversible via [reset].
 */
class DebugMemorySimulator {

    private companion object {
        const val TAG = "DebugMemorySim"
    }

    private var reservedForSimulation: Long = 0L
    private var simulationActive = false

    /**
     * Enable low-memory simulation by reducing available memory to [targetAvailableMb].
     *
     * @param targetAvailableMb The desired available memory in MB after simulation.
     *        For example, setting 5 means the orchestrator will see only ~5MB free.
     */
    fun enable(targetAvailableMb: Int) {
        reset()

        val actualAvailableMb = MemoryBudget.availableMemoryMb()
        val reserveAmountBytes = ((actualAvailableMb - targetAvailableMb) * 1024L * 1024L)
            .coerceAtLeast(0)

        if (reserveAmountBytes > 0) {
            MemoryBudget.reserveMemory(reserveAmountBytes)
            reservedForSimulation = reserveAmountBytes
            simulationActive = true
            Log.d(TAG, "Memory simulation enabled: reserved ${reserveAmountBytes / (1024 * 1024)}MB, " +
                    "target=${targetAvailableMb}MB, actual now=${MemoryBudget.availableMemoryMb()}MB")
        } else {
            Log.d(TAG, "Memory already at or below target: ${actualAvailableMb}MB <= ${targetAvailableMb}MB")
        }
    }

    /**
     * Reset simulation, restoring normal memory availability.
     */
    fun reset() {
        if (simulationActive) {
            MemoryBudget.releaseMemory(reservedForSimulation)
            Log.d(TAG, "Memory simulation reset: released ${reservedForSimulation / (1024 * 1024)}MB, " +
                    "available now=${MemoryBudget.availableMemoryMb()}MB")
            reservedForSimulation = 0L
            simulationActive = false
        }
    }

    val isActive: Boolean get() = simulationActive
}
