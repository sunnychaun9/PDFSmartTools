package com.pdfsmarttools.manipulate.batch

import java.util.UUID

/**
 * Represents a single batch processing job.
 * Jobs run sequentially; files within a job run in parallel.
 */
data class BatchJob(
    val jobId: String = UUID.randomUUID().toString().take(12),
    val operationType: BatchOperationType,
    val filePaths: List<String>,
    val outputDir: String,
    val isPro: Boolean,
    val options: BatchJobOptions = BatchJobOptions()
) {
    val totalFiles: Int get() = filePaths.size
}

enum class BatchOperationType {
    COMPRESS,
    MERGE,
    SPLIT
}

data class BatchJobOptions(
    val compressionLevel: String = "medium",
    val chunkSize: Int = DEFAULT_CHUNK_SIZE,
    val splitRanges: List<String> = emptyList(),
    /** Enable streaming mode for large file processing. Auto-enabled for files >30MB. */
    val useStreaming: Boolean = false
) {
    companion object {
        const val DEFAULT_CHUNK_SIZE = 10
    }
}

/**
 * Mutable state tracked for a running batch job.
 */
class BatchJobState(val job: BatchJob) {
    @Volatile var status: BatchJobStatus = BatchJobStatus.QUEUED
    @Volatile var completedCount: Int = 0
    @Volatile var failedCount: Int = 0
    @Volatile var currentFile: String = ""
    @Volatile var startTimeMs: Long = 0L
    @Volatile var endTimeMs: Long = 0L
    val errors: MutableList<BatchFileError> = mutableListOf()

    val elapsedMs: Long get() = when {
        startTimeMs == 0L -> 0L
        endTimeMs > 0L -> endTimeMs - startTimeMs
        else -> System.currentTimeMillis() - startTimeMs
    }
}

enum class BatchJobStatus {
    QUEUED,
    RUNNING,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED
}

data class BatchFileError(
    val filePath: String,
    val errorCode: String,
    val errorMessage: String
)
