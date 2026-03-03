package com.pdfsmarttools.common

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.di.ModuleProvider
import com.pdfsmarttools.pdfcore.model.CompressionLevel

/**
 * WorkManager CoroutineWorker for long-running PDF operations.
 * Runs as a foreground service with persistent notification showing progress.
 * Survives app backgrounding without losing the operation.
 * Delegates to use cases via ModuleProvider (no direct engine references).
 */
class PdfWorker(
    private val appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "PdfWorker"
        const val CHANNEL_ID = "pdf_operations"
        const val NOTIFICATION_ID = 1001

        // Input data keys
        const val KEY_OPERATION = "operation"
        const val KEY_INPUT_PATH = "input_path"
        const val KEY_INPUT_PATHS = "input_paths"
        const val KEY_OUTPUT_PATH = "output_path"
        const val KEY_COMPRESSION_LEVEL = "compression_level"
        const val KEY_IS_PRO = "is_pro"

        // Output data keys
        const val KEY_RESULT_PATH = "result_path"
        const val KEY_RESULT_SIZE = "result_size"
        const val KEY_PAGE_COUNT = "page_count"
        const val KEY_ERROR = "error"

        // Operation types
        const val OP_COMPRESS = "compress"
        const val OP_MERGE = "merge"
    }

    override suspend fun doWork(): Result {
        val operation = inputData.getString(KEY_OPERATION) ?: return Result.failure(
            workDataOf(KEY_ERROR to "No operation specified")
        )

        createNotificationChannel()
        setForeground(createForegroundInfo("Processing PDF...", 0))

        return try {
            when (operation) {
                OP_COMPRESS -> doCompress()
                OP_MERGE -> doMerge()
                else -> Result.failure(workDataOf(KEY_ERROR to "Unknown operation: $operation"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Worker failed: ${e.message}", e)
            Result.failure(workDataOf(KEY_ERROR to (e.message ?: "Unknown error")))
        }
    }

    private suspend fun doCompress(): Result {
        val inputPath = inputData.getString(KEY_INPUT_PATH)
            ?: return Result.failure(workDataOf(KEY_ERROR to "No input path"))
        val outputPath = inputData.getString(KEY_OUTPUT_PATH)
            ?: return Result.failure(workDataOf(KEY_ERROR to "No output path"))
        val levelStr = inputData.getString(KEY_COMPRESSION_LEVEL) ?: "MEDIUM"
        val isPro = inputData.getBoolean(KEY_IS_PRO, false)

        val level = try {
            CompressionLevel.valueOf(levelStr)
        } catch (_: Exception) {
            CompressionLevel.MEDIUM
        }

        val progressReporter = WorkerProgressReporter { message, progress ->
            setForegroundAsync(createForegroundInfo(message, progress))
        }

        val useCase = ModuleProvider.provideCompressPdfUseCase()
        val pdfResult = useCase(appContext, inputPath, outputPath, level, isPro, progressReporter)

        return when (pdfResult) {
            is PdfResult.Success -> Result.success(workDataOf(
                KEY_RESULT_PATH to pdfResult.data.outputPath,
                KEY_RESULT_SIZE to pdfResult.data.compressedSize,
                KEY_PAGE_COUNT to pdfResult.data.pageCount
            ))
            is PdfResult.Failure -> Result.failure(workDataOf(
                KEY_ERROR to pdfResult.error.message
            ))
        }
    }

    private suspend fun doMerge(): Result {
        val inputPathsStr = inputData.getString(KEY_INPUT_PATHS)
            ?: return Result.failure(workDataOf(KEY_ERROR to "No input paths"))
        val outputPath = inputData.getString(KEY_OUTPUT_PATH)
            ?: return Result.failure(workDataOf(KEY_ERROR to "No output path"))
        val isPro = inputData.getBoolean(KEY_IS_PRO, false)

        val inputPaths = inputPathsStr.split("|")

        val progressReporter = WorkerProgressReporter { message, progress ->
            setForegroundAsync(createForegroundInfo(message, progress))
        }

        val useCase = ModuleProvider.provideMergePdfsUseCase()
        val pdfResult = useCase(appContext, inputPaths, outputPath, isPro, progressReporter)

        return when (pdfResult) {
            is PdfResult.Success -> Result.success(workDataOf(
                KEY_RESULT_PATH to pdfResult.data.outputPath,
                KEY_RESULT_SIZE to pdfResult.data.outputSize,
                KEY_PAGE_COUNT to pdfResult.data.totalPages
            ))
            is PdfResult.Failure -> Result.failure(workDataOf(
                KEY_ERROR to pdfResult.error.message
            ))
        }
    }

    /**
     * ProgressReporter for WorkManager that updates the foreground notification.
     */
    private class WorkerProgressReporter(
        private val updateNotification: (String, Int) -> Unit
    ) : ProgressReporter {
        override fun onProgress(progress: Int, currentItem: Int, totalItems: Int, status: String) {
            updateNotification(status, progress)
        }
        override fun onStage(progress: Int, status: String) {
            updateNotification(status, progress)
        }
        override fun onComplete(status: String) {
            updateNotification(status, 100)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PDF Operations",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows progress for long-running PDF operations"
            }
            val manager = appContext.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createForegroundInfo(message: String, progress: Int): ForegroundInfo {
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setContentTitle("PDF Smart Tools")
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .setProgress(100, progress.coerceIn(0, 100), progress <= 0)
            .build()

        return ForegroundInfo(NOTIFICATION_ID, notification)
    }
}
