package com.pdfsmarttools.wordtopdf

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.font.Standard14Fonts
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import kotlinx.coroutines.*
import org.apache.poi.hwpf.HWPFDocument
import org.apache.poi.hwpf.usermodel.Paragraph
import org.apache.poi.hwpf.usermodel.Picture
import org.apache.poi.xwpf.usermodel.*
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream

/**
 * Native module for converting Word documents (DOC/DOCX) to PDF.
 * Uses Apache POI for reading Word documents and PdfBox for PDF creation.
 * 100% on-device conversion - no cloud upload.
 */
class WordToPdfModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isPdfBoxInitialized = false

    // PDF layout constants
    private val PAGE_WIDTH = PDRectangle.A4.width
    private val PAGE_HEIGHT = PDRectangle.A4.height
    private val MARGIN = 50f
    private val LINE_HEIGHT = 14f
    private val FONT_SIZE = 12f
    private val HEADING_FONT_SIZE = 16f

    override fun getName(): String = "WordToPdf"

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
        sendEvent("WordToPdfProgress", params)
    }

    @ReactMethod
    fun convertToPdf(inputPath: String, outputPath: String, promise: Promise) {
        scope.launch {
            var pdfDocument: PDDocument? = null

            try {
                initPdfBox(reactContext)

                sendProgressEvent(0, "Initializing...")

                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Word document not found: $inputPath")
                    return@launch
                }

                val fileName = inputFile.name.lowercase()
                val originalSize = inputFile.length()

                sendProgressEvent(10, "Reading document...")

                // Determine file type and convert
                pdfDocument = when {
                    fileName.endsWith(".docx") -> convertDocxToPdf(inputFile)
                    fileName.endsWith(".doc") -> convertDocToPdf(inputFile)
                    else -> {
                        promise.reject("UNSUPPORTED_FORMAT", "Unsupported file format. Please use .doc or .docx")
                        return@launch
                    }
                }

                sendProgressEvent(80, "Saving PDF...")

                // Create output directory if needed
                val outputFile = File(outputPath)
                outputFile.parentFile?.mkdirs()

                // Save the PDF
                pdfDocument.save(outputFile)

                val pdfSize = outputFile.length()
                val pageCount = pdfDocument.numberOfPages

                sendProgressEvent(100, "Complete!")

                val response = Arguments.createMap().apply {
                    putString("outputPath", outputPath)
                    putDouble("originalSize", originalSize.toDouble())
                    putDouble("pdfSize", pdfSize.toDouble())
                    putInt("pageCount", pageCount)
                    putBoolean("success", true)
                }

                promise.resolve(response)

            } catch (e: OutOfMemoryError) {
                promise.reject("OUT_OF_MEMORY", "Not enough memory to convert this document", e)
            } catch (e: Exception) {
                val errorCode: String
                val errorMessage: String

                when {
                    e.message?.contains("password", ignoreCase = true) == true ||
                    e.message?.contains("encrypted", ignoreCase = true) == true -> {
                        errorCode = "FILE_PROTECTED"
                        errorMessage = "This document is password protected"
                    }
                    e.message?.contains("corrupt", ignoreCase = true) == true ||
                    e.message?.contains("invalid", ignoreCase = true) == true ||
                    e.message?.contains("magic", ignoreCase = true) == true -> {
                        errorCode = "FILE_CORRUPTED"
                        errorMessage = "The document appears to be corrupted"
                    }
                    else -> {
                        errorCode = "CONVERSION_FAILED"
                        errorMessage = e.message ?: "Failed to convert document"
                    }
                }
                promise.reject(errorCode, errorMessage, e)
            } finally {
                try {
                    pdfDocument?.close()
                } catch (e: Exception) {
                    // Ignore close errors
                }
            }
        }
    }

    /**
     * Convert DOCX file to PDF using Apache POI XWPF
     */
    private fun convertDocxToPdf(inputFile: File): PDDocument {
        val document = PDDocument()
        var currentPage: PDPage? = null
        var contentStream: PDPageContentStream? = null
        var yPosition = PAGE_HEIGHT - MARGIN

        FileInputStream(inputFile).use { fis ->
            val xwpfDocument = XWPFDocument(fis)

            sendProgressEvent(30, "Processing content...")

            val totalElements = xwpfDocument.bodyElements.size
            var processedElements = 0

            for (element in xwpfDocument.bodyElements) {
                when (element) {
                    is XWPFParagraph -> {
                        val text = element.text?.trim() ?: ""
                        if (text.isNotEmpty()) {
                            // Check if we need a new page
                            if (currentPage == null || yPosition < MARGIN + LINE_HEIGHT) {
                                contentStream?.endText()
                                contentStream?.close()

                                currentPage = PDPage(PDRectangle.A4)
                                document.addPage(currentPage)
                                contentStream = PDPageContentStream(document, currentPage)
                                contentStream?.beginText()
                                yPosition = PAGE_HEIGHT - MARGIN
                            }

                            // Determine font style based on paragraph style
                            val fontSize = when {
                                element.style?.contains("Heading", ignoreCase = true) == true -> HEADING_FONT_SIZE
                                else -> FONT_SIZE
                            }

                            val font = when {
                                element.runs.any { it.isBold } -> PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD)
                                element.runs.any { it.isItalic } -> PDType1Font(Standard14Fonts.FontName.HELVETICA_OBLIQUE)
                                else -> PDType1Font(Standard14Fonts.FontName.HELVETICA)
                            }

                            // Write text with word wrapping
                            val lines = wrapText(text, font, fontSize, PAGE_WIDTH - 2 * MARGIN)
                            for (line in lines) {
                                if (yPosition < MARGIN + LINE_HEIGHT) {
                                    contentStream?.endText()
                                    contentStream?.close()

                                    currentPage = PDPage(PDRectangle.A4)
                                    document.addPage(currentPage)
                                    contentStream = PDPageContentStream(document, currentPage)
                                    contentStream?.beginText()
                                    yPosition = PAGE_HEIGHT - MARGIN
                                }

                                contentStream?.setFont(font, fontSize)
                                contentStream?.newLineAtOffset(MARGIN, yPosition)
                                contentStream?.showText(sanitizeText(line))
                                contentStream?.newLineAtOffset(-MARGIN, 0f)
                                yPosition -= LINE_HEIGHT * (fontSize / FONT_SIZE)
                            }

                            // Add paragraph spacing
                            yPosition -= LINE_HEIGHT / 2
                        }

                        // Handle images in paragraphs
                        for (run in element.runs) {
                            for (picture in run.embeddedPictures) {
                                try {
                                    contentStream?.endText()
                                    addImageToPage(document, contentStream, picture.pictureData.data, yPosition)
                                    yPosition -= 150f // Approximate image height
                                    contentStream?.beginText()
                                } catch (e: Exception) {
                                    // Skip problematic images
                                }
                            }
                        }
                    }
                    is XWPFTable -> {
                        // Simple table handling - convert to text
                        for (row in element.rows) {
                            val rowText = row.tableCells.joinToString(" | ") { it.text }
                            if (rowText.isNotBlank()) {
                                if (currentPage == null || yPosition < MARGIN + LINE_HEIGHT) {
                                    contentStream?.endText()
                                    contentStream?.close()

                                    currentPage = PDPage(PDRectangle.A4)
                                    document.addPage(currentPage)
                                    contentStream = PDPageContentStream(document, currentPage)
                                    contentStream?.beginText()
                                    yPosition = PAGE_HEIGHT - MARGIN
                                }

                                val font = PDType1Font(Standard14Fonts.FontName.HELVETICA)
                                val lines = wrapText(rowText, font, FONT_SIZE, PAGE_WIDTH - 2 * MARGIN)
                                for (line in lines) {
                                    contentStream?.setFont(font, FONT_SIZE)
                                    contentStream?.newLineAtOffset(MARGIN, yPosition)
                                    contentStream?.showText(sanitizeText(line))
                                    contentStream?.newLineAtOffset(-MARGIN, 0f)
                                    yPosition -= LINE_HEIGHT
                                }
                            }
                        }
                        yPosition -= LINE_HEIGHT
                    }
                }

                processedElements++
                val progress = 30 + (processedElements * 50 / maxOf(totalElements, 1))
                sendProgressEvent(progress, "Processing content...")
            }

            contentStream?.endText()
            contentStream?.close()
            xwpfDocument.close()
        }

        // Ensure at least one page exists
        if (document.numberOfPages == 0) {
            document.addPage(PDPage(PDRectangle.A4))
        }

        return document
    }

    /**
     * Convert DOC file to PDF using Apache POI HWPF
     */
    private fun convertDocToPdf(inputFile: File): PDDocument {
        val document = PDDocument()
        var currentPage: PDPage? = null
        var contentStream: PDPageContentStream? = null
        var yPosition = PAGE_HEIGHT - MARGIN

        FileInputStream(inputFile).use { fis ->
            val hwpfDocument = HWPFDocument(fis)
            val range = hwpfDocument.range

            sendProgressEvent(30, "Processing content...")

            val totalParagraphs = range.numParagraphs()

            for (i in 0 until totalParagraphs) {
                val paragraph: Paragraph = range.getParagraph(i)
                val text = paragraph.text()?.trim()?.replace("\u0007", "")?.replace("\r", "") ?: ""

                if (text.isNotEmpty()) {
                    // Check if we need a new page
                    if (currentPage == null || yPosition < MARGIN + LINE_HEIGHT) {
                        contentStream?.endText()
                        contentStream?.close()

                        currentPage = PDPage(PDRectangle.A4)
                        document.addPage(currentPage)
                        contentStream = PDPageContentStream(document, currentPage)
                        contentStream?.beginText()
                        yPosition = PAGE_HEIGHT - MARGIN
                    }

                    val font = PDType1Font(Standard14Fonts.FontName.HELVETICA)
                    val lines = wrapText(text, font, FONT_SIZE, PAGE_WIDTH - 2 * MARGIN)

                    for (line in lines) {
                        if (yPosition < MARGIN + LINE_HEIGHT) {
                            contentStream?.endText()
                            contentStream?.close()

                            currentPage = PDPage(PDRectangle.A4)
                            document.addPage(currentPage)
                            contentStream = PDPageContentStream(document, currentPage)
                            contentStream?.beginText()
                            yPosition = PAGE_HEIGHT - MARGIN
                        }

                        contentStream?.setFont(font, FONT_SIZE)
                        contentStream?.newLineAtOffset(MARGIN, yPosition)
                        contentStream?.showText(sanitizeText(line))
                        contentStream?.newLineAtOffset(-MARGIN, 0f)
                        yPosition -= LINE_HEIGHT
                    }

                    // Add paragraph spacing
                    yPosition -= LINE_HEIGHT / 2
                }

                val progress = 30 + (i * 50 / maxOf(totalParagraphs, 1))
                sendProgressEvent(progress, "Processing content...")
            }

            // Handle pictures
            try {
                val pictures = hwpfDocument.picturesTable.allPictures
                for (picture in pictures) {
                    try {
                        if (yPosition < MARGIN + 150f) {
                            contentStream?.endText()
                            contentStream?.close()

                            currentPage = PDPage(PDRectangle.A4)
                            document.addPage(currentPage)
                            contentStream = PDPageContentStream(document, currentPage)
                            contentStream?.beginText()
                            yPosition = PAGE_HEIGHT - MARGIN
                        }

                        contentStream?.endText()
                        addImageToPage(document, contentStream, picture.content, yPosition)
                        yPosition -= 150f
                        contentStream?.beginText()
                    } catch (e: Exception) {
                        // Skip problematic images
                    }
                }
            } catch (e: Exception) {
                // Skip if pictures table is not available
            }

            contentStream?.endText()
            contentStream?.close()
            hwpfDocument.close()
        }

        // Ensure at least one page exists
        if (document.numberOfPages == 0) {
            document.addPage(PDPage(PDRectangle.A4))
        }

        return document
    }

    /**
     * Add image to PDF page
     */
    private fun addImageToPage(
        document: PDDocument,
        contentStream: PDPageContentStream?,
        imageData: ByteArray,
        yPosition: Float
    ) {
        try {
            val bitmap = BitmapFactory.decodeByteArray(imageData, 0, imageData.size)
            if (bitmap != null) {
                val pdImage = LosslessFactory.createFromImage(document, bitmap)

                // Scale image to fit page width
                val maxWidth = PAGE_WIDTH - 2 * MARGIN
                val maxHeight = 200f
                var width = pdImage.width.toFloat()
                var height = pdImage.height.toFloat()

                if (width > maxWidth) {
                    val scale = maxWidth / width
                    width = maxWidth
                    height *= scale
                }
                if (height > maxHeight) {
                    val scale = maxHeight / height
                    height = maxHeight
                    width *= scale
                }

                contentStream?.drawImage(pdImage, MARGIN, yPosition - height, width, height)
                bitmap.recycle()
            }
        } catch (e: Exception) {
            // Skip image on error
        }
    }

    /**
     * Wrap text to fit within specified width
     */
    private fun wrapText(text: String, font: PDType1Font, fontSize: Float, maxWidth: Float): List<String> {
        val lines = mutableListOf<String>()
        val words = text.split(" ")
        var currentLine = StringBuilder()

        for (word in words) {
            val testLine = if (currentLine.isEmpty()) word else "$currentLine $word"
            val testWidth = font.getStringWidth(sanitizeText(testLine)) / 1000 * fontSize

            if (testWidth > maxWidth && currentLine.isNotEmpty()) {
                lines.add(currentLine.toString())
                currentLine = StringBuilder(word)
            } else {
                if (currentLine.isNotEmpty()) currentLine.append(" ")
                currentLine.append(word)
            }
        }

        if (currentLine.isNotEmpty()) {
            lines.add(currentLine.toString())
        }

        return lines.ifEmpty { listOf("") }
    }

    /**
     * Sanitize text for PDF output - remove unsupported characters
     */
    private fun sanitizeText(text: String): String {
        return text
            .replace("\t", "    ")
            .replace("\n", " ")
            .replace("\r", "")
            .replace("\u0000", "")
            .filter { it.code in 32..126 || it.code in 160..255 || it == ' ' }
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
