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
import android.os.ParcelFileDescriptor
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.pdfsmarttools.common.MemoryBudget
import com.pdfsmarttools.common.ParallelPageProcessor
import com.pdfsmarttools.common.PdfBoxHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.coroutineContext
import kotlin.coroutines.resume
import kotlin.math.max
import kotlin.math.min

/**
 * Production-ready PDF OCR Engine
 * Converts scanned PDFs to searchable PDFs with invisible text layer.
 *
 * Uses a producer-consumer pipeline for parallelism:
 * - Producer (sequential): renders pages via PdfRenderer (not thread-safe)
 * - Consumer pool (parallel): runs ML Kit OCR (thread-safe)
 * - Assembly (sequential): writes output PdfDocument pages (not thread-safe)
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
        // Channel buffer size (max rendered bitmaps waiting for OCR)
        private const val CHANNEL_BUFFER_SIZE = 3
        // Minimum pages to use parallel pipeline
        private const val PARALLEL_THRESHOLD = 2
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
     * A rendered page ready for OCR processing.
     */
    private data class RenderedPage(
        val pageIndex: Int,
        val bitmap: Bitmap,
        val pageWidth: Int,
        val pageHeight: Int,
        val finalWidth: Int,
        val finalHeight: Int,
        val scaleX: Float,
        val scaleY: Float
    )

    /**
     * OCR result for a single page, ready for assembly.
     */
    private data class OcrPageResult(
        val pageIndex: Int,
        val ocrResult: PageOcrResult,
        val bitmap: Bitmap,
        val pageWidth: Int,
        val pageHeight: Int,
        val scaleX: Float,
        val scaleY: Float
    )

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

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()

        var totalCharacters = 0
        var totalWords = 0
        var totalConfidence = 0f
        var confidenceCount = 0

        // Open source PDF using streaming descriptor (avoids full copy for content:// URIs)
        val fileDescriptor = PdfBoxHelper.resolveToFileDescriptor(context, inputPath)
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
            if (pageCount < PARALLEL_THRESHOLD) {
                // For 1-page PDFs, use simple sequential path
                processSequential(
                    pdfRenderer, outputPdfDocument, pageCount, isPro,
                    progressCallback
                ) { chars, words, conf, confCount ->
                    totalCharacters += chars
                    totalWords += words
                    totalConfidence += conf
                    confidenceCount += confCount
                }
            } else {
                // Multi-page: use producer-consumer pipeline
                processParallel(
                    pdfRenderer, outputPdfDocument, pageCount, isPro,
                    progressCallback
                ) { chars, words, conf, confCount ->
                    totalCharacters += chars
                    totalWords += words
                    totalConfidence += conf
                    confidenceCount += confCount
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
     * Sequential processing for single-page PDFs (no parallel overhead).
     */
    private suspend fun processSequential(
        pdfRenderer: PdfRenderer,
        outputPdfDocument: PdfDocument,
        pageCount: Int,
        isPro: Boolean,
        progressCallback: ProgressCallback,
        onStats: (chars: Int, words: Int, confidence: Float, confCount: Int) -> Unit
    ) {
        for (pageIndex in 0 until pageCount) {
            coroutineContext.ensureActive()

            progressCallback.onProgress(
                ((pageIndex * 80) / pageCount),
                pageIndex + 1, pageCount,
                "Processing page ${pageIndex + 1} of $pageCount..."
            )

            val rendered = renderPage(pdfRenderer, pageIndex)
            val ocrResult = performOcr(rendered.bitmap, pageIndex)

            coroutineContext.ensureActive()

            assembleOutputPage(outputPdfDocument, OcrPageResult(
                pageIndex = rendered.pageIndex,
                ocrResult = ocrResult,
                bitmap = rendered.bitmap,
                pageWidth = rendered.pageWidth,
                pageHeight = rendered.pageHeight,
                scaleX = rendered.scaleX,
                scaleY = rendered.scaleY
            ), isPro)

            // Collect stats
            var confCount = 0
            var confSum = 0f
            for (block in ocrResult.textBlocks) {
                if (block.confidence > 0) {
                    confSum += block.confidence
                    confCount++
                }
            }
            onStats(ocrResult.fullText.length, countWords(ocrResult.fullText), confSum, confCount)
        }
    }

    /**
     * Producer-consumer pipeline for multi-page PDFs.
     *
     * Producer: sequential rendering via PdfRenderer
     * Consumer pool: parallel ML Kit OCR
     * Assembly: sequential output page writing
     */
    private suspend fun processParallel(
        pdfRenderer: PdfRenderer,
        outputPdfDocument: PdfDocument,
        pageCount: Int,
        isPro: Boolean,
        progressCallback: ProgressCallback,
        onStats: (chars: Int, words: Int, confidence: Float, confCount: Int) -> Unit
    ) = coroutineScope {
        val maxWorkers = ParallelPageProcessor.defaultConcurrency()
        val semaphore = Semaphore(maxWorkers)
        val channel = Channel<RenderedPage>(CHANNEL_BUFFER_SIZE)
        val ocrCompleted = AtomicInteger(0)

        // Results array indexed by page number — preserves page order
        val results = arrayOfNulls<OcrPageResult>(pageCount)

        // Producer coroutine: renders pages sequentially (PdfRenderer is not thread-safe)
        val producer = launch(Dispatchers.IO) {
            for (pageIndex in 0 until pageCount) {
                ensureActive()
                val rendered = renderPage(pdfRenderer, pageIndex)
                channel.send(rendered)
            }
            channel.close()
        }

        // Consumer pool: parallel OCR processing (ML Kit is thread-safe)
        val consumers = launch(Dispatchers.Default) {
            val jobs = mutableListOf<kotlinx.coroutines.Job>()

            for (rendered in channel) {
                ensureActive()
                val job = launch {
                    semaphore.withPermit {
                        val ocrResult = performOcr(rendered.bitmap, rendered.pageIndex)

                        results[rendered.pageIndex] = OcrPageResult(
                            pageIndex = rendered.pageIndex,
                            ocrResult = ocrResult,
                            bitmap = rendered.bitmap,
                            pageWidth = rendered.pageWidth,
                            pageHeight = rendered.pageHeight,
                            scaleX = rendered.scaleX,
                            scaleY = rendered.scaleY
                        )

                        val completed = ocrCompleted.incrementAndGet()
                        val progress = ((completed * 80) / pageCount).coerceAtMost(80)
                        progressCallback.onProgress(
                            progress, completed, pageCount,
                            "OCR page $completed of $pageCount..."
                        )
                    }
                }
                jobs.add(job)
            }

            // Wait for all OCR jobs to finish
            jobs.forEach { it.join() }
        }

        // Wait for pipeline to complete
        producer.join()
        consumers.join()

        // Assembly phase (sequential): write output pages in order
        progressCallback.onProgress(85, pageCount, pageCount, "Assembling output PDF...")

        for (pageIndex in 0 until pageCount) {
            coroutineContext.ensureActive()

            val result = results[pageIndex]
            if (result != null) {
                assembleOutputPage(outputPdfDocument, result, isPro)

                // Collect stats
                var confCount = 0
                var confSum = 0f
                for (block in result.ocrResult.textBlocks) {
                    if (block.confidence > 0) {
                        confSum += block.confidence
                        confCount++
                    }
                }
                onStats(result.ocrResult.fullText.length, countWords(result.ocrResult.fullText), confSum, confCount)
            }

            // Memory check during assembly
            if ((pageIndex + 1) % 3 == 0) {
                ParallelPageProcessor.checkMemoryAndGc(0.80, "OcrAssembly")
            }
        }

        progressCallback.onProgress(90, pageCount, pageCount, "Finalizing...")
    }

    /**
     * Render a single page from PdfRenderer to a preprocessed bitmap.
     */
    private fun renderPage(pdfRenderer: PdfRenderer, pageIndex: Int): RenderedPage {
        val page = pdfRenderer.openPage(pageIndex)
        val pageWidth = page.width
        val pageHeight = page.height

        // Calculate optimal bitmap dimensions
        val (bitmapWidth, bitmapHeight) = calculateOptimalDimensions(pageWidth, pageHeight)

        // Check memory budget before allocating OCR bitmap
        var finalWidth = bitmapWidth
        var finalHeight = bitmapHeight
        if (!MemoryBudget.canAllocateBitmap(finalWidth, finalHeight, 2)) {
            finalWidth /= 2
            finalHeight /= 2
            if (!MemoryBudget.canAllocateBitmap(finalWidth, finalHeight, 2)) {
                page.close()
                throw OutOfMemoryError("Not enough memory for OCR bitmap on page ${pageIndex + 1}")
            }
        }

        val pageBitmap = Bitmap.createBitmap(finalWidth, finalHeight, Bitmap.Config.RGB_565)
        pageBitmap.eraseColor(Color.WHITE)

        page.render(pageBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
        page.close()

        // Preprocess for better OCR accuracy
        val processedBitmap = preprocessBitmap(pageBitmap)
        if (processedBitmap != pageBitmap) {
            pageBitmap.recycle()
        }

        val scaleX = pageWidth.toFloat() / finalWidth.toFloat()
        val scaleY = pageHeight.toFloat() / finalHeight.toFloat()

        return RenderedPage(
            pageIndex = pageIndex,
            bitmap = processedBitmap,
            pageWidth = pageWidth,
            pageHeight = pageHeight,
            finalWidth = finalWidth,
            finalHeight = finalHeight,
            scaleX = scaleX,
            scaleY = scaleY
        )
    }

    /**
     * Assemble a single output page: draw bitmap, watermark, and invisible text layer.
     * Recycles the bitmap after use.
     */
    private fun assembleOutputPage(outputPdfDocument: PdfDocument, result: OcrPageResult, isPro: Boolean) {
        val pageInfo = PdfDocument.PageInfo.Builder(
            result.pageWidth, result.pageHeight, result.pageIndex + 1
        ).create()
        val pdfPage = outputPdfDocument.startPage(pageInfo)
        val canvas = pdfPage.canvas

        // Draw original page image (scaled to fit)
        val destRect = Rect(0, 0, result.pageWidth, result.pageHeight)
        canvas.drawBitmap(result.bitmap, null, destRect, null)

        // Draw watermark for free users
        if (!isPro) {
            drawWatermark(canvas, result.pageWidth, result.pageHeight)
        }

        // Overlay invisible text layer for searchability
        if (result.ocrResult.hasText) {
            drawInvisibleTextLayer(canvas, result.ocrResult, result.scaleX, result.scaleY)
        }

        outputPdfDocument.finishPage(pdfPage)

        // Recycle bitmap to free memory
        result.bitmap.recycle()
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

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
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

        val ocrText: Text? = try {
            suspendCancellableCoroutine<Text?> { continuation ->
                recognizer.process(inputImage)
                    .addOnSuccessListener { result: Text ->
                        continuation.resume(result) {}
                    }
                    .addOnFailureListener { _ ->
                        continuation.resume(null) {}
                    }
            }
        } catch (e: Exception) {
            null
        }

        // Return empty result if OCR failed
        if (ocrText == null) {
            return PageOcrResult(
                pageIndex = pageIndex,
                textBlocks = emptyList(),
                fullText = "",
                hasText = false
            )
        }

        val textBlocks = mutableListOf<TextBlockInfo>()

        for (block in ocrText.textBlocks) {
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
            fullText = ocrText.text,
            hasText = ocrText.text.isNotEmpty()
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
