package com.pdfsmarttools.pdfprotector

import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import kotlinx.coroutines.*
import java.io.File
import java.io.FileInputStream

class PdfProtectorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isPdfBoxInitialized = false

    override fun getName(): String = "PdfProtector"

    private fun initPdfBox(context: Context) {
        if (!isPdfBoxInitialized) {
            PDFBoxResourceLoader.init(context)
            isPdfBoxInitialized = true
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Validate if file is a valid PDF
     */
    @ReactMethod
    fun validatePdf(inputPath: String, promise: Promise) {
        scope.launch {
            try {
                initPdfBox(reactContext)

                val file = File(inputPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found: $inputPath")
                    return@launch
                }

                // Try to open the PDF to validate it
                var document: PDDocument? = null
                try {
                    document = PDDocument.load(file)

                    // Check if already encrypted
                    val isEncrypted = document.isEncrypted

                    val result = Arguments.createMap().apply {
                        putBoolean("isValid", true)
                        putBoolean("isEncrypted", isEncrypted)
                        putInt("pageCount", document.numberOfPages)
                    }
                    promise.resolve(result)
                } catch (e: Exception) {
                    when {
                        e.message?.contains("password", ignoreCase = true) == true -> {
                            promise.reject("PDF_ENCRYPTED", "This PDF is already password protected")
                        }
                        e.message?.contains("corrupt", ignoreCase = true) == true ||
                        e.message?.contains("invalid", ignoreCase = true) == true -> {
                            promise.reject("PDF_CORRUPT", "This PDF file is corrupt or invalid")
                        }
                        else -> {
                            promise.reject("PDF_INVALID", "Cannot read this PDF file: ${e.message}")
                        }
                    }
                } finally {
                    document?.close()
                }
            } catch (e: Exception) {
                promise.reject("VALIDATION_ERROR", e.message ?: "Failed to validate PDF", e)
            }
        }
    }

    /**
     * Protect a PDF with password using AES-256 encryption
     *
     * @param inputPath Path to the input PDF file
     * @param outputPath Path for the output encrypted PDF
     * @param password User password for opening the document
     * @param isPro Whether the user is a Pro subscriber
     * @param promise React Native promise
     */
    @ReactMethod
    fun protectPdf(
        inputPath: String,
        outputPath: String,
        password: String,
        isPro: Boolean,
        promise: Promise
    ) {
        scope.launch {
            var document: PDDocument? = null

            try {
                initPdfBox(reactContext)

                // Send progress: Starting
                sendProgressEvent(0, "Initializing...")

                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found: $inputPath")
                    return@launch
                }

                // Validate password length
                if (password.length < 6) {
                    promise.reject("INVALID_PASSWORD", "Password must be at least 6 characters")
                    return@launch
                }

                // Send progress: Loading PDF
                sendProgressEvent(20, "Loading PDF...")

                // Load the PDF document
                document = PDDocument.load(inputFile)

                // Check if already encrypted
                if (document.isEncrypted) {
                    promise.reject("ALREADY_ENCRYPTED", "This PDF is already password protected")
                    return@launch
                }

                val pageCount = document.numberOfPages

                // Send progress: Applying encryption
                sendProgressEvent(50, "Applying encryption...")

                // Create access permission (allow everything except changing permissions)
                val accessPermission = AccessPermission().apply {
                    // Allow all operations for the user with the password
                    setCanPrint(true)
                    setCanPrintFaithful(true)
                    setCanModify(true)
                    setCanModifyAnnotations(true)
                    setCanFillInForm(true)
                    setCanExtractContent(true)
                    setCanExtractForAccessibility(true)
                    setCanAssembleDocument(true)
                }

                // Create protection policy with AES-256 encryption
                // Key length 256 = AES-256 encryption
                val protectionPolicy = StandardProtectionPolicy(
                    password,  // Owner password (same as user password for simplicity)
                    password,  // User password
                    accessPermission
                ).apply {
                    encryptionKeyLength = 256  // AES-256
                    setPreferAES(true)
                }

                // Apply the protection policy
                document.protect(protectionPolicy)

                // Send progress: Saving
                sendProgressEvent(80, "Saving protected PDF...")

                // Create output directory if needed
                val outputFile = File(outputPath)
                outputFile.parentFile?.mkdirs()

                // Save the encrypted document
                document.save(outputFile)

                // Get file sizes
                val originalSize = inputFile.length()
                val protectedSize = outputFile.length()

                // Send progress: Complete
                sendProgressEvent(100, "Complete!")

                // Build response
                val response = Arguments.createMap().apply {
                    putString("outputPath", outputPath)
                    putDouble("originalSize", originalSize.toDouble())
                    putDouble("protectedSize", protectedSize.toDouble())
                    putInt("pageCount", pageCount)
                    putBoolean("success", true)
                }

                promise.resolve(response)

            } catch (e: SecurityException) {
                promise.reject("PDF_ENCRYPTED", "This PDF is already password protected", e)
            } catch (e: OutOfMemoryError) {
                promise.reject("OUT_OF_MEMORY", "Not enough memory to process this PDF", e)
            } catch (e: Exception) {
                val errorMessage = when {
                    e.message?.contains("password", ignoreCase = true) == true ->
                        "This PDF is already password protected"
                    e.message?.contains("corrupt", ignoreCase = true) == true ->
                        "The PDF file is corrupt"
                    e.message?.contains("permission", ignoreCase = true) == true ->
                        "Cannot access the PDF file"
                    else -> e.message ?: "Failed to protect PDF"
                }
                promise.reject("PROTECTION_ERROR", errorMessage, e)
            } finally {
                try {
                    document?.close()
                } catch (e: Exception) {
                    // Ignore close errors
                }
                // Cleanup memory
                System.gc()
            }
        }
    }

    private fun sendProgressEvent(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        sendEvent("PdfProtectionProgress", params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }
}
