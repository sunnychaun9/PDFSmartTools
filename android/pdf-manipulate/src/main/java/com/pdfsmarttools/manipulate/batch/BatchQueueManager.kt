package com.pdfsmarttools.manipulate.batch

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages a queue of batch jobs.
 * Jobs run sequentially; files within each job are processed in parallel by TurboBatchPdfEngine.
 */
class BatchQueueManager {

    companion object {
        private const val TAG = "BatchQueueManager"
    }

    private val mutex = Mutex()
    private val activeJobs = ConcurrentHashMap<String, BatchJobState>()
    private val jobCoroutines = ConcurrentHashMap<String, Job>()

    fun getJobState(jobId: String): BatchJobState? = activeJobs[jobId]

    fun getAllJobs(): List<BatchJobState> = activeJobs.values.toList()

    suspend fun enqueueBatchJob(job: BatchJob): BatchJobState = mutex.withLock {
        val state = BatchJobState(job)
        activeJobs[job.jobId] = state
        Log.d(TAG, "Enqueued batch job ${job.jobId}: ${job.operationType} with ${job.totalFiles} files")
        state
    }

    fun registerJobCoroutine(jobId: String, coroutine: Job) {
        jobCoroutines[jobId] = coroutine
    }

    suspend fun cancelBatchJob(jobId: String): Boolean = mutex.withLock {
        val state = activeJobs[jobId] ?: return@withLock false
        if (state.status == BatchJobStatus.COMPLETED || state.status == BatchJobStatus.CANCELLED) {
            return@withLock false
        }
        state.status = BatchJobStatus.CANCELLED
        state.endTimeMs = System.currentTimeMillis()
        jobCoroutines[jobId]?.cancel(CancellationException("Batch job cancelled by user"))
        Log.d(TAG, "Cancelled batch job $jobId")
        true
    }

    suspend fun pauseBatchJob(jobId: String): Boolean = mutex.withLock {
        val state = activeJobs[jobId] ?: return@withLock false
        if (state.status != BatchJobStatus.RUNNING) return@withLock false
        state.status = BatchJobStatus.PAUSED
        Log.d(TAG, "Paused batch job $jobId")
        true
    }

    suspend fun resumeBatchJob(jobId: String): Boolean = mutex.withLock {
        val state = activeJobs[jobId] ?: return@withLock false
        if (state.status != BatchJobStatus.PAUSED) return@withLock false
        state.status = BatchJobStatus.RUNNING
        Log.d(TAG, "Resumed batch job $jobId")
        true
    }

    fun markJobStarted(jobId: String) {
        activeJobs[jobId]?.let {
            it.status = BatchJobStatus.RUNNING
            it.startTimeMs = System.currentTimeMillis()
        }
    }

    fun markJobCompleted(jobId: String) {
        activeJobs[jobId]?.let {
            if (it.status != BatchJobStatus.CANCELLED) {
                it.status = if (it.failedCount == it.job.totalFiles) {
                    BatchJobStatus.FAILED
                } else {
                    BatchJobStatus.COMPLETED
                }
            }
            it.endTimeMs = System.currentTimeMillis()
        }
        jobCoroutines.remove(jobId)
    }

    fun updateProgress(jobId: String, completedCount: Int, failedCount: Int, currentFile: String) {
        activeJobs[jobId]?.let {
            it.completedCount = completedCount
            it.failedCount = failedCount
            it.currentFile = currentFile
        }
    }

    fun addError(jobId: String, error: BatchFileError) {
        activeJobs[jobId]?.errors?.add(error)
    }

    fun removeJob(jobId: String) {
        activeJobs.remove(jobId)
        jobCoroutines.remove(jobId)
    }
}
