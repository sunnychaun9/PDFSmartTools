package com.pdfsmarttools.manipulate.batch

/**
 * Final result of a batch processing job.
 */
data class BatchResult(
    val jobId: String,
    val operationType: BatchOperationType,
    val status: BatchJobStatus,
    val totalFiles: Int,
    val completedFiles: Int,
    val failedFiles: Int,
    val durationMs: Long,
    val outputPaths: List<String>,
    val errors: List<BatchFileError>
) {
    val successRate: Double get() = if (totalFiles > 0) {
        completedFiles.toDouble() / totalFiles
    } else 0.0
}

/**
 * Result of processing a single file within a batch.
 */
data class BatchFileResult(
    val inputPath: String,
    val outputPath: String,
    val success: Boolean,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val outputSize: Long = 0L
)
