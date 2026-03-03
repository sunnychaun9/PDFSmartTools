package com.pdfsmarttools.manipulate.protect

import android.content.Context
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import java.io.File

data class ProtectResult(
    val outputPath: String,
    val originalSize: Long,
    val protectedSize: Long,
    val pageCount: Int
)

/**
 * Engine extracted from PdfProtectorModule.
 * Handles PDF encryption with AES-256.
 */
class PdfProtectorEngine {

    fun protectPdf(
        context: Context,
        inputPath: String,
        outputPath: String,
        password: String,
        onProgress: (Int, String) -> Unit
    ): ProtectResult {
        PdfBoxFacade.ensureInitialized(context)
        onProgress(0, "Initializing...")

        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found: $inputPath")
        if (password.length < 6) throw IllegalArgumentException("Password must be at least 6 characters")

        onProgress(20, "Loading PDF...")
        val document = PdfBoxFacade.loadDocumentDefault(inputFile)

        try {
            if (document.isEncrypted) throw IllegalStateException("This PDF is already password protected")
            val pageCount = document.numberOfPages

            onProgress(50, "Applying encryption...")

            val accessPermission = AccessPermission().apply {
                setCanPrint(true)
                setCanPrintFaithful(true)
                setCanModify(true)
                setCanModifyAnnotations(true)
                setCanFillInForm(true)
                setCanExtractContent(true)
                setCanExtractForAccessibility(true)
                setCanAssembleDocument(true)
            }

            val protectionPolicy = StandardProtectionPolicy(password, password, accessPermission).apply {
                encryptionKeyLength = 256
                setPreferAES(true)
            }

            document.protect(protectionPolicy)

            onProgress(80, "Saving protected PDF...")
            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()
            document.save(outputFile)

            val originalSize = inputFile.length()
            val protectedSize = outputFile.length()

            onProgress(100, "Complete!")
            return ProtectResult(outputPath, originalSize, protectedSize, pageCount)
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
                e.message?.contains("password", ignoreCase = true) == true -> return Triple(true, true, 0)
                e.message?.contains("corrupt", ignoreCase = true) == true -> throw IllegalStateException("PDF file is corrupt or invalid")
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
