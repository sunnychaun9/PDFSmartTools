package com.pdfsmarttools.pdfunlock

import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import kotlinx.coroutines.*
import java.io.File

/**
 * Native module for unlocking password-protected PDFs.
 *
 * IMPORTANT: This module only unlocks PDFs when the correct password is provided.
 * It does NOT attempt to bypass, crack, or break PDF encryption.
 */
class PdfUnlockModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isPdfBoxInitialized = false

    override fun getName(): String = "PdfUnlock"

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

    private fun sendProgressEvent(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        sendEvent("PdfUnlockProgress", params)
    }

    /**
     * Validate if file is a valid PDF and check if it's encrypted
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

                // Try to open the PDF without password first
                var document: PDDocument? = null
                try {
                    document = PDDocument.load(file)

                    // If we can open without password, it's not encrypted
                    val result = Arguments.createMap().apply {
                        putBoolean("isValid", true)
                        putBoolean("isEncrypted", document.isEncrypted)
                        putInt("pageCount", document.numberOfPages)
                    }
                    promise.resolve(result)
                } catch (e: Exception) {
                    when {
                        e.message?.contains("password", ignoreCase = true) == true ||
                        e.message?.contains("encrypted", ignoreCase = true) == true -> {
                            // PDF is encrypted - this is expected for this feature
                            val result = Arguments.createMap().apply {
                                putBoolean("isValid", true)
                                putBoolean("isEncrypted", true)
                                putInt("pageCount", 0) // Unknown until unlocked
                            }
                            promise.resolve(result)
                        }
                        e.message?.contains("corrupt", ignoreCase = true) == true ||
                        e.message?.contains("invalid", ignoreCase = true) == true -> {
                            promise.reject("PDF_CORRUPT", "This PDF file is corrupt or invalid")
                        }
                        else -> {
                            // FIX: Post-audit hardening – never expose raw exception message
                            promise.reject("PDF_INVALID", "Cannot read this PDF file")
                        }
                    }
                } finally {
                    document?.close()
                }
            } catch (e: Exception) {
                // FIX: Post-audit hardening – sanitize error messages to prevent password leakage
                promise.reject("VALIDATION_ERROR", "Failed to validate PDF")
            }
        }
    }

    /**
     * Unlock a password-protected PDF
     *
     * @param inputPath Path to the encrypted PDF file
     * @param outputPath Path for the output unlocked PDF
     * @param password User-provided password
     * @param promise React Native promise
     */
    @ReactMethod
    fun unlockPdf(
        inputPath: String,
        outputPath: String,
        password: String,
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

                // Send progress: Loading PDF
                sendProgressEvent(20, "Loading PDF...")

                // Try to load the PDF with the provided password
                try {
                    document = PDDocument.load(inputFile, password)
                } catch (e: Exception) {
                    when {
                        e.message?.contains("password", ignoreCase = true) == true ||
                        e.message?.contains("decrypt", ignoreCase = true) == true -> {
                            promise.reject("INVALID_PASSWORD", "The password is incorrect")
                            return@launch
                        }
                        else -> {
                            throw e
                        }
                    }
                }

                // Check if the document was actually encrypted
                if (!document.isEncrypted) {
                    // Try loading without password to confirm it wasn't protected
                    document.close()
                    val testDoc = PDDocument.load(inputFile)
                    val wasEncrypted = testDoc.isEncrypted
                    testDoc.close()

                    if (!wasEncrypted) {
                        promise.reject("NOT_PROTECTED", "This PDF is not password-protected")
                        return@launch
                    }
                }

                val pageCount = document.numberOfPages

                // Send progress: Removing encryption
                sendProgressEvent(50, "Removing encryption...")

                // Remove encryption by setting all permissions and removing security handler
                document.setAllSecurityToBeRemoved(true)

                // Send progress: Saving
                sendProgressEvent(80, "Saving unlocked PDF...")

                // Create output directory if needed
                val outputFile = File(outputPath)
                outputFile.parentFile?.mkdirs()

                // Save the unencrypted document
                document.save(outputFile)

                // Get file sizes
                val originalSize = inputFile.length()
                val unlockedSize = outputFile.length()

                // Send progress: Complete
                sendProgressEvent(100, "Complete!")

                // Build response
                val response = Arguments.createMap().apply {
                    putString("outputPath", outputPath)
                    putDouble("originalSize", originalSize.toDouble())
                    putDouble("unlockedSize", unlockedSize.toDouble())
                    putInt("pageCount", pageCount)
                    putBoolean("success", true)
                }

                promise.resolve(response)

            } catch (e: SecurityException) {
                promise.reject("INVALID_PASSWORD", "The password is incorrect", e)
            } catch (e: OutOfMemoryError) {
                promise.reject("OUT_OF_MEMORY", "Not enough memory to process this PDF", e)
            } catch (e: Exception) {
                val errorCode: String
                val errorMessage: String

                when {
                    e.message?.contains("password", ignoreCase = true) == true ||
                    e.message?.contains("decrypt", ignoreCase = true) == true -> {
                        errorCode = "INVALID_PASSWORD"
                        errorMessage = "The password is incorrect"
                    }
                    e.message?.contains("encrypt", ignoreCase = true) == true &&
                    e.message?.contains("not", ignoreCase = true) == true -> {
                        errorCode = "NOT_PROTECTED"
                        errorMessage = "This PDF is not password-protected"
                    }
                    e.message?.contains("corrupt", ignoreCase = true) == true -> {
                        errorCode = "PDF_CORRUPT"
                        errorMessage = "The PDF file is corrupt"
                    }
                    e.message?.contains("AES", ignoreCase = true) == true ||
                    e.message?.contains("algorithm", ignoreCase = true) == true -> {
                        errorCode = "UNSUPPORTED_PDF"
                        errorMessage = "This PDF uses an encryption method that is not supported"
                    }
                    e.message?.contains("permission", ignoreCase = true) == true -> {
                        errorCode = "PERMISSION_ERROR"
                        errorMessage = "Cannot access the PDF file"
                    }
                    else -> {
                        errorCode = "UNLOCK_ERROR"
                        // FIX: Post-audit hardening – never expose raw exception message
                        errorMessage = "Failed to unlock PDF"
                    }
                }
                promise.reject(errorCode, errorMessage)
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
