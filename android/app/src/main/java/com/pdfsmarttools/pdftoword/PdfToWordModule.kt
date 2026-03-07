package com.pdfsmarttools.pdftoword

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pdfsmarttools.convert.toword.PdfToWordEngine
import kotlinx.coroutines.*
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * React Native bridge for PDF → Word conversion.
 *
 * Delegates to [PdfToWordEngine] which implements the full advanced pipeline:
 * TextBlock extraction → heading detection → table reconstruction →
 * paragraph merging → image extraction → DOCX generation.
 *
 * 100% on-device conversion — no cloud upload.
 */
class PdfToWordModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PdfToWordModule"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val engine = PdfToWordEngine()
    private val isCancelled = AtomicBoolean(false)

    override fun getName(): String = "PdfToWord"

    private fun sendProgressEvent(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PdfToWordProgress", params)
    }

    /**
     * Convert PDF to DOCX with advanced layout reconstruction.
     *
     * @param inputPath Path to the PDF file.
     * @param outputPath Path for the output DOCX file.
     * @param extractImages Whether to extract embedded images.
     * @param isPro Whether user has Pro subscription.
     */
    @ReactMethod
    fun convertToDocx(
        inputPath: String,
        outputPath: String,
        extractImages: Boolean,
        isPro: Boolean,
        promise: Promise
    ) {
        isCancelled.set(false)

        scope.launch {
            try {
                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                val originalSize = inputFile.length()

                val result = engine.convertToDocx(
                    context = reactContext,
                    inputPath = inputPath,
                    outputPath = outputPath,
                    extractImages = extractImages,
                    isPro = isPro,
                    onProgress = { progress, status ->
                        if (!isCancelled.get()) {
                            sendProgressEvent(progress, status)
                        }
                    }
                )

                val response = Arguments.createMap().apply {
                    putString("outputPath", result.outputPath)
                    putDouble("originalSize", originalSize.toDouble())
                    putDouble("docxSize", result.fileSize.toDouble())
                    putInt("pageCount", result.pageCount)
                    putInt("totalCharacters", result.wordCount * 5) // Approximate
                    putInt("totalParagraphs", result.paragraphsDetected)
                    putInt("imagesExtracted", result.imagesExtracted)
                    putBoolean("success", true)
                    putBoolean("hasLayoutWarning", true)
                    // Enhanced metrics
                    putInt("pagesProcessed", result.pagesProcessed)
                    putInt("headingsDetected", result.headingsDetected)
                    putInt("tablesDetected", result.tablesDetected)
                    putBoolean("ocrUsed", result.ocrUsed)
                    putDouble("processingTimeMs", result.processingTimeMs.toDouble())
                    putInt("wordCount", result.wordCount)
                }

                promise.resolve(response)

            } catch (e: SecurityException) {
                promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
            } catch (e: OutOfMemoryError) {
                System.gc()
                promise.reject("OUT_OF_MEMORY", "Not enough memory to convert this PDF")
            } catch (e: Exception) {
                Log.e(TAG, "Conversion failed", e)
                val errorMessage = when {
                    e.message?.contains("password", ignoreCase = true) == true ->
                        "This PDF is password protected"
                    e.message?.contains("corrupt", ignoreCase = true) == true ->
                        "The PDF file is corrupted"
                    e.message?.contains("encrypted", ignoreCase = true) == true ->
                        "This PDF is encrypted"
                    else -> "Failed to convert PDF to Word"
                }
                promise.reject("CONVERSION_FAILED", errorMessage)
            } finally {
                System.gc()
            }
        }
    }

    @ReactMethod
    fun cancelConversion(promise: Promise) {
        isCancelled.set(true)
        promise.resolve(true)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }
}
