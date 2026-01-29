package com.pdfsmarttools.pdfocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlin.coroutines.resume
import kotlin.math.max
import kotlin.math.min

/**
 * Production-ready PDF OCR Engine
 * Converts scanned PDFs to searchable PDFs with invisible text layer
 */
class PdfOcrEngine(private val context: Context) {

    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.Builder().build())

    companion object {
        // Target DPI for OCR processing - higher for better accuracy
        private const val OCR_TARGET_DPI = 300f
        // Default PDF DPI
        private const val PDF_BASE_DPI = 72f
        // Maximum bitmap dimension to prevent OOM
        private const val MAX_BITMAP_DIMENSION = 4096
        // Minimum bitmap dimension for OCR accuracy
        private const val MIN_BITMAP_DIMENSION = 1000
        // Contrast enhancement factor
        private const val CONTRAST_FACTOR = 1.2f
        // Brightness adjustment
        private const val BRIGHTNESS_OFFSET = 10f
    }

    /**
     * Data class representing OCR result for a single page
     */
    data class PageOcrResult(
        val pageIndex: Int,
        val textBlocks: List<TextBlockInfo>,
        val fullText: String,
        val hasText: Boolean
    )

    /**
     * Data class representing a text block with position info
     */
    data class TextBlockInfo(
        val text: String,
        val boundingBox: Rect,
        val confidence: Float,
        val lines: List<LineInfo>
    )

    /**
     * Data class representing a line of text
     */
    data class LineInfo(
        val text: String,
        val boundingBox: Rect,
        val confidence: Float
    )

    /**
     * Final OCR result containing all processed data
     */
    data class OcrResult(
        val outputPath: String,
        val pageCount: Int,
        val totalCharacters: Int,
        val totalWords: Int,
        val averageConfidence: Float,
        val processingTimeMs: Long
    )

    /**
     * Progress callback interface
     */
    interface ProgressCallback {
        fun onProgress(progress: Int, currentPage: Int, totalPages: Int, status: String)
    }

    /**
     * Main entry point: Process PDF and create searchable version
     */
    suspend fun processToSearchablePdf(
        inputPath: String,
        outputPath: String,
        isPro: Boolean = false,
        progressCallback: ProgressCallback
    ): OcrResult = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()

        val inputFile = resolveInputFile(inputPath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("Input PDF file not found: $inputPath")
        }

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()

        var totalCharacters = 0
        var totalWords = 0
        var totalConfidence = 0f
        var confidenceCount = 0

        // Open source PDF
        val fileDescriptor = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val pdfRenderer = PdfRenderer(fileDescriptor)
        val pageCount = pdfRenderer.pageCount

        if (pageCount == 0) {
            pdfRenderer.close()
            fileDescriptor.close()
            throw IllegalArgumentException("PDF has no pages")
        }

        progressCallback.onProgress(0, 0, pageCount, "Preparing PDF...")

        // Create output PDF document
        val outputPdfDocument = PdfDocument()

        try {
            for (pageIndex in 0 until pageCount) {
                progressCallback.onProgress(
                    ((pageIndex * 100) / pageCount),
                    pageIndex + 1,
                    pageCount,
                    "Processing page ${pageIndex + 1} of $pageCount..."
                )

                // Open and render page to bitmap
                val page = pdfRenderer.openPage(pageIndex)
                val pageWidth = page.width
                val pageHeight = page.height

                // Calculate optimal bitmap dimensions
                val (bitmapWidth, bitmapHeight) = calculateOptimalDimensions(pageWidth, pageHeight)

                // Create bitmap for page rendering
                val pageBitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
                pageBitmap.eraseColor(Color.WHITE)

                // Render PDF page to bitmap
                page.render(pageBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                page.close()

                // Preprocess bitmap for better OCR accuracy
                val processedBitmap = preprocessBitmap(pageBitmap)
                if (processedBitmap != pageBitmap) {
                    pageBitmap.recycle()
                }

                // Perform OCR on the processed bitmap
                val pageOcrResult = performOcr(processedBitmap, pageIndex)

                // Calculate scale factors for text positioning
                val scaleX = pageWidth.toFloat() / bitmapWidth.toFloat()
                val scaleY = pageHeight.toFloat() / bitmapHeight.toFloat()

                // Create output PDF page with original dimensions
                val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageIndex + 1).create()
                val pdfPage = outputPdfDocument.startPage(pageInfo)
                val canvas = pdfPage.canvas

                // Draw original page image (scaled to fit)
                val destRect = Rect(0, 0, pageWidth, pageHeight)
                canvas.drawBitmap(processedBitmap, null, destRect, null)

                // Draw watermark for free users
                if (!isPro) {
                    drawWatermark(canvas, pageWidth, pageHeight)
                }

                // Overlay invisible text layer for searchability
                if (pageOcrResult.hasText) {
                    drawInvisibleTextLayer(canvas, pageOcrResult, scaleX, scaleY)
                }

                outputPdfDocument.finishPage(pdfPage)

                // Recycle bitmap to free memory
                processedBitmap.recycle()

                // Update statistics
                totalCharacters += pageOcrResult.fullText.length
                totalWords += countWords(pageOcrResult.fullText)
                for (block in pageOcrResult.textBlocks) {
                    if (block.confidence > 0) {
                        totalConfidence += block.confidence
                        confidenceCount++
                    }
                }

                // Force garbage collection periodically for large PDFs
                if (pageIndex > 0 && pageIndex % 5 == 0) {
                    System.gc()
                }
            }

            progressCallback.onProgress(95, pageCount, pageCount, "Saving searchable PDF...")

            // Write output PDF
            FileOutputStream(outputFile).use { output ->
                outputPdfDocument.writeTo(output)
            }

            progressCallback.onProgress(100, pageCount, pageCount, "Complete!")

        } finally {
            outputPdfDocument.close()
            pdfRenderer.close()
            fileDescriptor.close()

            // Clean up temp file if created from content URI
            if (inputPath.startsWith("content://")) {
                inputFile.delete()
            }
        }

        val processingTime = System.currentTimeMillis() - startTime
        val averageConfidence = if (confidenceCount > 0) totalConfidence / confidenceCount else 0f

        OcrResult(
            outputPath = outputFile.absolutePath,
            pageCount = pageCount,
            totalCharacters = totalCharacters,
            totalWords = totalWords,
            averageConfidence = averageConfidence,
            processingTimeMs = processingTime
        )
    }

    /**
     * Resolve input file path, handling content:// URIs
     */
    private fun resolveInputFile(inputPath: String): File {
        if (inputPath.startsWith("content://")) {
            val uri = Uri.parse(inputPath)
            val cacheFile = File(context.cacheDir, "ocr_input_${System.currentTimeMillis()}.pdf")

            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(cacheFile).use { output ->
                    input.copyTo(output)
                }
            } ?: throw IllegalArgumentException("Cannot open content URI: $inputPath")

            return cacheFile
        }

        val path = if (inputPath.startsWith("file://")) {
            inputPath.removePrefix("file://")
        } else {
            inputPath
        }

        return File(path)
    }

    /**
     * Calculate optimal bitmap dimensions for OCR
     */
    private fun calculateOptimalDimensions(pageWidth: Int, pageHeight: Int): Pair<Int, Int> {
        val scale = OCR_TARGET_DPI / PDF_BASE_DPI

        var targetWidth = (pageWidth * scale).toInt()
        var targetHeight = (pageHeight * scale).toInt()

        // Ensure minimum dimension for OCR accuracy
        if (targetWidth < MIN_BITMAP_DIMENSION && targetHeight < MIN_BITMAP_DIMENSION) {
            val minScale = MIN_BITMAP_DIMENSION.toFloat() / min(pageWidth, pageHeight)
            targetWidth = (pageWidth * minScale).toInt()
            targetHeight = (pageHeight * minScale).toInt()
        }

        // Cap at maximum dimension to prevent OOM
        if (targetWidth > MAX_BITMAP_DIMENSION || targetHeight > MAX_BITMAP_DIMENSION) {
            val maxScale = MAX_BITMAP_DIMENSION.toFloat() / max(targetWidth, targetHeight)
            targetWidth = (targetWidth * maxScale).toInt()
            targetHeight = (targetHeight * maxScale).toInt()
        }

        return Pair(targetWidth, targetHeight)
    }

    /**
     * Preprocess bitmap for optimal OCR accuracy
     * - Convert to grayscale
     * - Enhance contrast
     * - Normalize brightness
     */
    private fun preprocessBitmap(source: Bitmap): Bitmap {
        val width = source.width
        val height = source.height

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)

        // Create color matrix for grayscale conversion with contrast enhancement
        val colorMatrix = ColorMatrix()

        // Grayscale conversion
        val grayscaleMatrix = ColorMatrix(
            floatArrayOf(
                0.299f, 0.587f, 0.114f, 0f, 0f,
                0.299f, 0.587f, 0.114f, 0f, 0f,
                0.299f, 0.587f, 0.114f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f
            )
        )
        colorMatrix.set(grayscaleMatrix)

        // Apply contrast enhancement
        val contrastMatrix = ColorMatrix(
            floatArrayOf(
                CONTRAST_FACTOR, 0f, 0f, 0f, BRIGHTNESS_OFFSET,
                0f, CONTRAST_FACTOR, 0f, 0f, BRIGHTNESS_OFFSET,
                0f, 0f, CONTRAST_FACTOR, 0f, BRIGHTNESS_OFFSET,
                0f, 0f, 0f, 1f, 0f
            )
        )
        colorMatrix.postConcat(contrastMatrix)

        val paint = Paint().apply {
            colorFilter = ColorMatrixColorFilter(colorMatrix)
            isAntiAlias = true
            isFilterBitmap = true
        }

        canvas.drawBitmap(source, 0f, 0f, paint)

        return result
    }

    /**
     * Perform OCR using ML Kit Text Recognition
     */
    private suspend fun performOcr(bitmap: Bitmap, pageIndex: Int): PageOcrResult {
        val inputImage = InputImage.fromBitmap(bitmap, 0)

        val text = suspendCancellableCoroutine<Text> { continuation ->
            recognizer.process(inputImage)
                .addOnSuccessListener { result ->
                    continuation.resume(result)
                }
                .addOnFailureListener { e ->
                    // Return empty result on OCR failure rather than crashing
                    continuation.resume(Text("", emptyList()))
                }
        }

        val textBlocks = mutableListOf<TextBlockInfo>()

        for (block in text.textBlocks) {
            val lines = mutableListOf<LineInfo>()

            for (line in block.lines) {
                val lineBounds = line.boundingBox ?: Rect(0, 0, 0, 0)
                lines.add(
                    LineInfo(
                        text = line.text,
                        boundingBox = lineBounds,
                        confidence = line.confidence ?: 0f
                    )
                )
            }

            val blockBounds = block.boundingBox ?: Rect(0, 0, 0, 0)
            val avgConfidence = block.lines.mapNotNull { it.confidence }.average().toFloat()

            textBlocks.add(
                TextBlockInfo(
                    text = block.text,
                    boundingBox = blockBounds,
                    confidence = if (avgConfidence.isNaN()) 0f else avgConfidence,
                    lines = lines
                )
            )
        }

        return PageOcrResult(
            pageIndex = pageIndex,
            textBlocks = textBlocks,
            fullText = text.text,
            hasText = text.text.isNotEmpty()
        )
    }

    /**
     * Draw invisible text layer aligned with detected text positions
     * This makes the PDF searchable while preserving the original appearance
     */
    private fun drawInvisibleTextLayer(
        canvas: Canvas,
        ocrResult: PageOcrResult,
        scaleX: Float,
        scaleY: Float
    ) {
        val paint = Paint().apply {
            color = Color.TRANSPARENT
            alpha = 0
            typeface = Typeface.DEFAULT
            isAntiAlias = true
        }

        for (block in ocrResult.textBlocks) {
            for (line in block.lines) {
                val bounds = line.boundingBox

                // Scale bounding box to page coordinates
                val scaledLeft = bounds.left * scaleX
                val scaledTop = bounds.top * scaleY
                val scaledRight = bounds.right * scaleX
                val scaledBottom = bounds.bottom * scaleY
                val scaledHeight = scaledBottom - scaledTop

                // Calculate font size to fit the bounding box
                val textWidth = scaledRight - scaledLeft
                val fontSize = calculateFontSize(paint, line.text, textWidth, scaledHeight)
                paint.textSize = fontSize

                // Draw invisible text at the correct position
                // Baseline is at the bottom of the text, adjusted for descent
                val baselineY = scaledBottom - paint.descent()
                canvas.drawText(line.text, scaledLeft, baselineY, paint)
            }
        }
    }

    /**
     * Calculate optimal font size to fit text within bounds
     */
    private fun calculateFontSize(paint: Paint, text: String, maxWidth: Float, maxHeight: Float): Float {
        if (text.isEmpty()) return 12f

        // Start with height-based estimate
        var fontSize = maxHeight * 0.8f
        paint.textSize = fontSize

        // Adjust based on width
        val measuredWidth = paint.measureText(text)
        if (measuredWidth > maxWidth && measuredWidth > 0) {
            fontSize *= maxWidth / measuredWidth
        }

        // Clamp to reasonable range
        return fontSize.coerceIn(4f, 72f)
    }

    /**
     * Draw watermark for free users
     */
    private fun drawWatermark(canvas: Canvas, pageWidth: Int, pageHeight: Int) {
        val paint = Paint().apply {
            color = Color.GRAY
            alpha = 40
            textSize = pageWidth / 12f
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }

        val watermarkText = "PDF Smart Tools – Free Version"

        canvas.save()

        val centerX = pageWidth / 2f
        val centerY = pageHeight / 2f
        canvas.translate(centerX, centerY)
        canvas.rotate(-30f)

        canvas.drawText(watermarkText, 0f, 0f, paint)

        canvas.restore()
    }

    /**
     * Count words in text
     */
    private fun countWords(text: String): Int {
        if (text.isBlank()) return 0
        return text.trim().split(Regex("\\s+")).size
    }

    /**
     * Clean up resources
     */
    fun close() {
        recognizer.close()
    }
}

/**
 * Custom Text class for handling OCR failure gracefully
 */
private class Text(private val fullText: String, private val blocks: List<Text.TextBlock>) :
    com.google.mlkit.vision.text.Text {

    override fun getText(): String = fullText
    override fun getTextBlocks(): List<com.google.mlkit.vision.text.Text.TextBlock> = emptyList()

    class TextBlock
}
