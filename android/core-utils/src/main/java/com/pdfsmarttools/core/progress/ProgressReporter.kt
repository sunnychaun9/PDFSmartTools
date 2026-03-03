package com.pdfsmarttools.core.progress

/**
 * Decoupled progress reporting interface.
 * Implementations can emit events to React Native, log, or no-op.
 */
interface ProgressReporter {

    /**
     * Report progress with item tracking.
     *
     * @param progress Percentage (0-100)
     * @param currentItem Current item number (1-indexed)
     * @param totalItems Total number of items
     * @param status Human-readable status message
     */
    fun onProgress(progress: Int, currentItem: Int, totalItems: Int, status: String = "")

    /**
     * Report a named stage without item tracking.
     *
     * @param progress Percentage (0-100)
     * @param status Human-readable status message
     */
    fun onStage(progress: Int, status: String)

    /**
     * Report completion.
     */
    fun onComplete(status: String = "Complete!")

    companion object {
        /** No-op reporter for when progress isn't needed. */
        val NOOP: ProgressReporter = object : ProgressReporter {
            override fun onProgress(progress: Int, currentItem: Int, totalItems: Int, status: String) {}
            override fun onStage(progress: Int, status: String) {}
            override fun onComplete(status: String) {}
        }
    }
}
