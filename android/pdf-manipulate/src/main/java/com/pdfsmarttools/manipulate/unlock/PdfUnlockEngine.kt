package com.pdfsmarttools.manipulate.unlock

import android.content.Context
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import java.io.File

data class UnlockResult(
    val outputPath: String,
    val originalSize: Long,
    val unlockedSize: Long,
    val pageCount: Int
)

/**
 * Engine extracted from PdfUnlockModule.
 * Handles PDF decryption with user-provided password.
 */
class PdfUnlockEngine {

    fun unlockPdf(
        context: Context,
        inputPath: String,
        outputPath: String,
        password: String,
        onProgress: (Int, String) -> Unit
    ): UnlockResult {
        PdfBoxFacade.ensureInitialized(context)
        onProgress(0, "Initializing...")

        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found: $inputPath")

        onProgress(20, "Loading PDF...")

        val document = try {
            PdfBoxFacade.loadDocumentDefault(inputFile, password)
        } catch (e: Exception) {
            when {
                e.message?.contains("password", ignoreCase = true) == true ||
                e.message?.contains("decrypt", ignoreCase = true) == true ->
                    throw SecurityException("The password is incorrect")
                else -> throw e
            }
        }

        try {
            if (!document.isEncrypted) {
                document.close()
                val testDoc = PdfBoxFacade.loadDocumentDefault(inputFile)
                val wasEncrypted = testDoc.isEncrypted
                testDoc.close()
                if (!wasEncrypted) throw IllegalStateException("This PDF is not password-protected")
            }

            val pageCount = document.numberOfPages

            onProgress(50, "Removing encryption...")
            document.setAllSecurityToBeRemoved(true)

            onProgress(80, "Saving unlocked PDF...")
            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()
            document.save(outputFile)

            val originalSize = inputFile.length()
            val unlockedSize = outputFile.length()

            onProgress(100, "Complete!")
            return UnlockResult(outputPath, originalSize, unlockedSize, pageCount)
        } finally {
            document.close()
            System.gc()
        }
    }

    fun validatePdf(context: Context, inputPath: String): Triple<Boolean, Boolean, Int> {
        PdfBoxFacade.ensureInitialized(context)
        val file = File(inputPath)
        if (!file.exists()) throw IllegalArgumentException("PDF file not found: $inputPath")

        val document = try {
            PdfBoxFacade.loadDocumentDefault(file)
        } catch (e: Exception) {
            when {
                e.message?.contains("password", ignoreCase = true) == true ||
                e.message?.contains("encrypted", ignoreCase = true) == true ->
                    return Triple(true, true, 0)
                e.message?.contains("corrupt", ignoreCase = true) == true ->
                    throw IllegalStateException("PDF file is corrupt or invalid")
                else -> throw IllegalStateException("Cannot read PDF file")
            }
        }

        return try {
            Triple(true, document.isEncrypted, document.numberOfPages)
        } finally {
            document.close()
        }
    }
}
