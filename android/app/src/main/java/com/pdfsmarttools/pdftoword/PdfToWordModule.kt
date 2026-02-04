package com.pdfsmarttools.pdftoword

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.*
import org.apache.poi.util.Units
import org.apache.poi.xwpf.usermodel.ParagraphAlignment
import org.apache.poi.xwpf.usermodel.XWPFDocument
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native module for converting PDF to Word (DOCX).
 * Uses PDFBox for text extraction and Apache POI for DOCX creation.
 * 100% on-device conversion - no cloud upload.
 *
 * Limitations:
 * - Complex layouts may not be perfectly preserved
 * - Tables are converted to plain text
 * - Some fonts may not render identically
 * - Scanned PDFs (image-based) will have limited text extraction
 */
class PdfToWordModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PdfToWordModule"
        // Memory limits for image extraction
        private const val MAX_IMAGE_WIDTH = 600
        private const val MAX_IMAGE_HEIGHT = 800
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isPdfBoxInitialized = false
    private val isCancelled = AtomicBoolean(false)

    override fun getName(): String = "PdfToWord"

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
        sendEvent("PdfToWordProgress", params)
    }

    /**
     * Convert PDF to DOCX
     *
     * @param inputPath Path to the PDF file
     * @param outputPath Path for the output DOCX file
     * @param extractImages Whether to extract images (may increase file size)
     * @param isPro Whether user has Pro subscription
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
            var pdfDocument: PDDocument? = null
            var tempFile: File? = null

            try {
                initPdfBox(reactContext)

                sendProgressEvent(0, "Initializing...")

                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                val originalSize = inputFile.length()

                sendProgressEvent(10, "Opening PDF...")

                // Open PDF with PDFBox for text extraction
                pdfDocument = PDDocument.load(inputFile)

                if (pdfDocument.isEncrypted) {
                    promise.reject("PDF_PROTECTED", "This PDF is password protected")
                    return@launch
                }

                val pageCount = pdfDocument.numberOfPages

                // Free tier limit: 5 pages
                if (!isPro && pageCount > 5) {
                    promise.reject(
                        "PRO_REQUIRED",
                        "Free users can convert PDFs up to 5 pages. Upgrade to Pro for unlimited pages."
                    )
                    return@launch
                }

                // Create output directory and temp file for atomic write
                val outputFile = File(outputPath)
                outputFile.parentFile?.mkdirs()
                tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")

                sendProgressEvent(20, "Extracting text...")

                // Create DOCX document
                val wordDocument = XWPFDocument()

                // Add warning paragraph about layout fidelity
                val warningParagraph = wordDocument.createParagraph()
                warningParagraph.alignment = ParagraphAlignment.CENTER
                val warningRun = warningParagraph.createRun()
                warningRun.isItalic = true
                warningRun.fontSize = 10
                warningRun.setColor("808080")
                warningRun.setText("[Note: This document was converted from PDF. Layout may differ from original.]")
                wordDocument.createParagraph() // Empty line after warning

                // Track statistics
                var totalCharacters = 0
                var totalParagraphs = 0
                var imagesExtracted = 0

                // Process each page
                for (pageIndex in 0 until pageCount) {
                    if (isCancelled.get()) {
                        wordDocument.close()
                        tempFile?.delete()
                        promise.reject("CANCELLED", "Conversion was cancelled")
                        return@launch
                    }

                    val progress = 20 + ((pageIndex + 1) * 60 / pageCount)
                    sendProgressEvent(progress, "Processing page ${pageIndex + 1} of $pageCount...")

                    // Add page header (optional, shows page boundaries)
                    if (pageIndex > 0) {
                        val pageBreak = wordDocument.createParagraph()
                        pageBreak.isPageBreak = true
                    }

                    // Extract text from this page using PDFTextStripper
                    val textStripper = PDFTextStripper().apply {
                        startPage = pageIndex + 1
                        endPage = pageIndex + 1
                        sortByPosition = true
                        addMoreFormatting = true
                    }

                    val pageText = textStripper.getText(pdfDocument)
                    totalCharacters += pageText.length

                    // Split text into paragraphs
                    val paragraphs = pageText.split("\n\n", "\r\n\r\n")
                        .map { it.trim() }
                        .filter { it.isNotEmpty() }

                    for (paragraphText in paragraphs) {
                        val paragraph = wordDocument.createParagraph()

                        // Detect potential headings (all caps, short lines, etc.)
                        val isHeading = isLikelyHeading(paragraphText)

                        if (isHeading) {
                            val run = paragraph.createRun()
                            run.isBold = true
                            run.fontSize = 14
                            run.setText(paragraphText)
                        } else {
                            // Handle lines within paragraph
                            val lines = paragraphText.split("\n")
                            for ((lineIndex, line) in lines.withIndex()) {
                                val run = paragraph.createRun()
                                run.fontSize = 11
                                run.setText(line.trim())
                                if (lineIndex < lines.size - 1) {
                                    run.addBreak()
                                }
                            }
                        }

                        totalParagraphs++
                    }

                    // Extract images if requested
                    if (extractImages) {
                        try {
                            val imageBytes = renderPageAsImage(inputFile, pageIndex)
                            if (imageBytes != null) {
                                val imageParagraph = wordDocument.createParagraph()
                                imageParagraph.alignment = ParagraphAlignment.CENTER
                                val imageRun = imageParagraph.createRun()

                                imageRun.addPicture(
                                    ByteArrayInputStream(imageBytes),
                                    XWPFDocument.PICTURE_TYPE_PNG,
                                    "page_${pageIndex + 1}.png",
                                    Units.toEMU(400.0), // Width in EMU
                                    Units.toEMU(550.0)  // Height in EMU
                                )

                                imagesExtracted++
                            }
                        } catch (e: Exception) {
                            // Skip image extraction on error, continue with text
                        }
                    }
                }

                sendProgressEvent(85, "Saving document...")

                // Write to temp file
                FileOutputStream(tempFile).use { fos ->
                    wordDocument.write(fos)
                }
                wordDocument.close()

                // Validate the generated DOCX file
                if (!tempFile.exists() || tempFile.length() == 0L) {
                    tempFile.delete()
                    promise.reject("CONVERSION_FAILED", "Failed to create Word document")
                    return@launch
                }

                // Verify DOCX can be opened (basic validation)
                try {
                    FileInputStream(tempFile).use { fis ->
                        val testDoc = XWPFDocument(fis)
                        testDoc.close()
                    }
                } catch (e: Exception) {
                    tempFile.delete()
                    promise.reject("DOCX_INVALID", "Generated document is invalid")
                    return@launch
                }

                // Atomic rename
                if (outputFile.exists()) {
                    outputFile.delete()
                }

                val renamed = tempFile.renameTo(outputFile)
                if (!renamed) {
                    // Fallback: copy and delete
                    tempFile.copyTo(outputFile, overwrite = true)
                    tempFile.delete()
                }
                tempFile = null // Mark as handled

                sendProgressEvent(100, "Complete!")

                val docxSize = outputFile.length()

                // Build response
                val response = Arguments.createMap().apply {
                    putString("outputPath", outputPath)
                    putDouble("originalSize", originalSize.toDouble())
                    putDouble("docxSize", docxSize.toDouble())
                    putInt("pageCount", pageCount)
                    putInt("totalCharacters", totalCharacters)
                    putInt("totalParagraphs", totalParagraphs)
                    putInt("imagesExtracted", imagesExtracted)
                    putBoolean("success", true)
                    putBoolean("hasLayoutWarning", true) // Always warn about potential layout differences
                }

                promise.resolve(response)

            } catch (e: SecurityException) {
                tempFile?.delete()
                promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
            } catch (e: OutOfMemoryError) {
                tempFile?.delete()
                System.gc()
                promise.reject("OUT_OF_MEMORY", "Not enough memory to convert this PDF")
            } catch (e: Exception) {
                tempFile?.delete()
                // Sanitize error message
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
                try {
                    pdfDocument?.close()
                } catch (e: Exception) {
                    // Ignore close errors
                }
                System.gc()
            }
        }
    }

    /**
     * Check if text appears to be a heading based on heuristics
     */
    private fun isLikelyHeading(text: String): Boolean {
        // Short text (likely heading)
        if (text.length < 80) {
            // All uppercase
            if (text == text.uppercase() && text.any { it.isLetter() }) {
                return true
            }
            // Ends with no punctuation (sentences usually end with period)
            if (!text.endsWith(".") && !text.endsWith(",") && !text.endsWith(";")) {
                // Contains only letters, spaces, and numbers (no complex punctuation)
                if (text.matches(Regex("^[A-Za-z0-9\\s\\-:]+$"))) {
                    return true
                }
            }
        }
        return false
    }

    /**
     * Render a PDF page as PNG image bytes
     */
    private fun renderPageAsImage(pdfFile: File, pageIndex: Int): ByteArray? {
        return try {
            ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                PdfRenderer(fd).use { renderer ->
                    renderer.openPage(pageIndex).use { page ->
                        // Calculate scaled dimensions
                        var width = page.width
                        var height = page.height

                        if (width > MAX_IMAGE_WIDTH) {
                            val scale = MAX_IMAGE_WIDTH.toFloat() / width
                            width = MAX_IMAGE_WIDTH
                            height = (height * scale).toInt()
                        }
                        if (height > MAX_IMAGE_HEIGHT) {
                            val scale = MAX_IMAGE_HEIGHT.toFloat() / height
                            height = MAX_IMAGE_HEIGHT
                            width = (width * scale).toInt()
                        }

                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                        bitmap.eraseColor(android.graphics.Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                        val outputStream = ByteArrayOutputStream()
                        bitmap.compress(Bitmap.CompressFormat.PNG, 85, outputStream)
                        bitmap.recycle()

                        outputStream.toByteArray()
                    }
                }
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Cancel ongoing conversion
     */
    @ReactMethod
    fun cancelConversion(promise: Promise) {
        isCancelled.set(true)
        promise.resolve(true)
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
