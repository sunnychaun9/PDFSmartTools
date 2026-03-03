@file:Suppress("unused")
package com.pdfsmarttools.common

import android.content.Context
import android.os.ParcelFileDescriptor
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import java.io.File

/**
 * Delegates to PdfBoxFacade in :pdf-core. This file exists for backward compatibility
 * during the incremental migration. Once all engines are moved to feature modules,
 * this file can be deleted.
 */
object PdfBoxHelper {

    fun ensureInitialized(context: Context) = PdfBoxFacade.ensureInitialized(context)

    fun resolveInputFile(context: Context, path: String, prefix: String): File {
        return com.pdfsmarttools.pdfcore.DefaultFileResolver(context).resolveInputFile(path, prefix)
    }

    fun resolveToFileDescriptor(context: Context, path: String): ParcelFileDescriptor {
        return com.pdfsmarttools.pdfcore.DefaultFileResolver(context).resolveToFileDescriptor(path)
    }

    fun atomicSave(document: com.tom_roush.pdfbox.pdmodel.PDDocument, outputFile: File) =
        PdfBoxFacade.atomicSave(document, outputFile)

    fun validateOutput(outputFile: File, expectedPageCount: Int): ValidationResult {
        val result = PdfBoxFacade.validateOutput(outputFile, expectedPageCount)
        return ValidationResult(result.valid, result.pageCount, result.fileSize, result.errorMessage)
    }

    fun addWatermarkToPage(
        document: com.tom_roush.pdfbox.pdmodel.PDDocument,
        page: com.tom_roush.pdfbox.pdmodel.PDPage
    ) = PdfBoxFacade.addWatermarkToPage(document, page)

    fun logMetrics(metrics: OperationMetrics) {
        PdfBoxFacade.logMetrics(com.pdfsmarttools.pdfcore.OperationMetrics(
            operationName = metrics.operationName,
            fileCount = metrics.fileCount,
            pageCount = metrics.pageCount,
            inputSizeBytes = metrics.inputSizeBytes,
            outputSizeBytes = metrics.outputSizeBytes,
            durationMs = metrics.durationMs
        ))
    }

    fun currentMemoryMb(): Long = PdfBoxFacade.currentMemoryMb()
}

data class ValidationResult(
    val valid: Boolean,
    val pageCount: Int,
    val fileSize: Long,
    val errorMessage: String?
)

data class OperationMetrics(
    val operationName: String,
    val fileCount: Int,
    val pageCount: Int,
    val inputSizeBytes: Long,
    val outputSizeBytes: Long,
    val durationMs: Long
)
