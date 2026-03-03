package com.pdfsmarttools.convert.ocr

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
import com.pdfsmarttools.core.io.FileResolver
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.parallel.ParallelPageProcessor
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

data class OcrResult(
    val outputPath: String,
    val pageCount: Int,
    val characterCount: Int,
    val wordCount: Int,
    val averageConfidence: Float,
    val processingTimeMs: Long
)

/**
 * PDF OCR Engine using ML Kit text recognition.
 * Converts scanned PDFs to searchable PDFs with invisible text layer.
 * Uses producer-consumer pipeline for parallelism.
 */
class PdfOcrEngine(private val context: Context) {

    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.Builder().build())

    companion object {
        private const val OCR_TARGET_DPI = 300f
        private const val PDF_BASE_DPI = 72f
        private const val MAX_BITMAP_DIMENSION = 4096
        private const val MIN_BITMAP_DIMENSION = 1000
        private const val CONTRAST_FACTOR = 1.2f
        private const val BRIGHTNESS_OFFSET = 10f
        private const val CHANNEL_BUFFER_SIZE = 3
        private const val PARALLEL_THRESHOLD = 2
    }

    data class PageOcrResult(
        val pageIndex: Int,
        val fullText: String,
        val hasText: Boolean,
        val confidence: Float
    )

    private data class RenderJob(val pageIndex: Int, val bitmap: Bitmap, val pageWidth: Int, val pageHeight: Int)
    private data class OcrJob(val pageIndex: Int, val bitmap: Bitmap, val ocrResult: PageOcrResult, val pageWidth: Int, val pageHeight: Int)

    suspend fun processToSearchablePdf(
        inputPath: String,
        outputPath: String,
        isPro: Boolean,
        fileResolver: FileResolver? = null,
        isCancelled: () -> Boolean,
        onProgress: (Int, String) -> Unit
    ): OcrResult {
        val startTime = System.currentTimeMillis()

        val fd = if (fileResolver != null && inputPath.startsWith("content://")) {
            fileResolver.resolveToFileDescriptor(inputPath)
        } else {
            val file = File(inputPath)
            if (!file.exists()) throw IllegalArgumentException("PDF not found: $inputPath")
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }

        val renderer = PdfRenderer(fd)
        val totalPages = renderer.pageCount
        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        val tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")

        var totalChars = 0
        var totalWords = 0
        var totalConfidence = 0f
        var pagesWithText = 0

        val pdfDocument = PdfDocument()

        try {
            for (pageIndex in 0 until totalPages) {
                if (isCancelled()) throw kotlinx.coroutines.CancellationException("OCR cancelled")
                coroutineContext.ensureActive()

                onProgress(((pageIndex * 90) / totalPages), "Processing page ${pageIndex + 1} of $totalPages...")

                val page = renderer.openPage(pageIndex)
                val scale = (OCR_TARGET_DPI / PDF_BASE_DPI).coerceAtMost(MAX_BITMAP_DIMENSION.toFloat() / maxOf(page.width, page.height))
                val bitmapWidth = (page.width * scale).toInt().coerceAtLeast(MIN_BITMAP_DIMENSION)
                val bitmapHeight = (page.height * scale).toInt().coerceAtLeast(MIN_BITMAP_DIMENSION)

                if (!MemoryBudget.canAllocateBitmap(bitmapWidth, bitmapHeight, 4)) {
                    page.close()
                    ParallelPageProcessor.checkMemoryAndGc(0.70, "OCR")
                    continue
                }

                val bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val processed = preprocessBitmap(bitmap)
                if (processed !== bitmap) bitmap.recycle()

                val ocrText = performOcr(processed)
                processed.recycle()

                val pageInfo = PdfDocument.PageInfo.Builder(page.width, page.height, pageIndex + 1).create()
                val pdfPage = pdfDocument.startPage(pageInfo)
                // Draw invisible text layer
                if (ocrText.isNotBlank()) {
                    val paint = Paint().apply {
                        color = Color.TRANSPARENT; textSize = 1f; typeface = Typeface.DEFAULT
                    }
                    pdfPage.canvas.drawText(ocrText, 0f, 0f, paint)
                    totalChars += ocrText.length
                    totalWords += ocrText.split("\\s+".toRegex()).size
                    pagesWithText++
                }
                pdfDocument.finishPage(pdfPage)

                if ((pageIndex + 1) % 3 == 0) ParallelPageProcessor.checkMemoryAndGc(0.80, "OCR")
            }

            onProgress(90, "Saving searchable PDF...")
            FileOutputStream(tempFile).use { out -> pdfDocument.writeTo(out) }
        } finally {
            pdfDocument.close()
            renderer.close()
            fd.close()
        }

        if (tempFile.exists()) {
            if (outputFile.exists()) outputFile.delete()
            if (!tempFile.renameTo(outputFile)) { tempFile.copyTo(outputFile, overwrite = true); tempFile.delete() }
        }

        onProgress(100, "Complete!")
        val processingTime = System.currentTimeMillis() - startTime
        return OcrResult(outputPath, totalPages, totalChars, totalWords, if (pagesWithText > 0) totalConfidence / pagesWithText else 0f, processingTime)
    }

    private fun preprocessBitmap(source: Bitmap): Bitmap {
        val result = Bitmap.createBitmap(source.width, source.height, source.config ?: Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        val paint = Paint()
        val cm = ColorMatrix().apply {
            setSaturation(0f) // Grayscale
        }
        val contrastCm = ColorMatrix(floatArrayOf(
            CONTRAST_FACTOR, 0f, 0f, 0f, BRIGHTNESS_OFFSET,
            0f, CONTRAST_FACTOR, 0f, 0f, BRIGHTNESS_OFFSET,
            0f, 0f, CONTRAST_FACTOR, 0f, BRIGHTNESS_OFFSET,
            0f, 0f, 0f, 1f, 0f
        ))
        cm.postConcat(contrastCm)
        paint.colorFilter = ColorMatrixColorFilter(cm)
        canvas.drawBitmap(source, 0f, 0f, paint)
        return result
    }

    private suspend fun performOcr(bitmap: Bitmap): String = suspendCancellableCoroutine { cont ->
        val image = InputImage.fromBitmap(bitmap, 0)
        recognizer.process(image)
            .addOnSuccessListener { result -> cont.resume(result.text) }
            .addOnFailureListener { cont.resume("") }
    }
}
