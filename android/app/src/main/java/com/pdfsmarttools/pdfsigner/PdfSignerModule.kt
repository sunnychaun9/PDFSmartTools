package com.pdfsmarttools.pdfsigner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import android.util.Base64

class PdfSignerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "PdfSigner"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun signPdf(
        inputPath: String,
        outputPath: String,
        signatureBase64: String,
        pageNumber: Int,
        positionX: Float,
        positionY: Float,
        signatureWidth: Float,
        signatureHeight: Float,
        addWatermark: Boolean,
        promise: Promise
    ) {
        scope.launch {
            try {
                sendProgressEvent(0, "Opening PDF...")

                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Input PDF file not found")
                    return@launch
                }

                // Decode signature from base64
                val signatureBytes = Base64.decode(signatureBase64, Base64.DEFAULT)
                val signatureBitmap = BitmapFactory.decodeByteArray(signatureBytes, 0, signatureBytes.size)
                    ?: throw Exception("Failed to decode signature image")

                sendProgressEvent(20, "Reading PDF pages...")

                // Open the input PDF
                val fileDescriptor = ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY)
                val pdfRenderer = PdfRenderer(fileDescriptor)
                val pageCount = pdfRenderer.pageCount

                if (pageNumber < 0 || pageNumber >= pageCount) {
                    pdfRenderer.close()
                    fileDescriptor.close()
                    promise.reject("INVALID_PAGE", "Page number $pageNumber is out of range (0-${pageCount - 1})")
                    return@launch
                }

                sendProgressEvent(40, "Creating signed PDF...")

                // Create new PDF document
                val pdfDocument = PdfDocument()
                val outputFile = File(outputPath)

                // Process each page
                for (i in 0 until pageCount) {
                    val page = pdfRenderer.openPage(i)
                    val pageWidth = page.width
                    val pageHeight = page.height

                    // Create bitmap for the page
                    val bitmap = Bitmap.createBitmap(pageWidth, pageHeight, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)

                    // Render original page
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    // Create PDF page
                    val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, i + 1).create()
                    val pdfPage = pdfDocument.startPage(pageInfo)
                    val canvas = pdfPage.canvas

                    // Draw original page content
                    canvas.drawBitmap(bitmap, 0f, 0f, null)

                    // Add signature to the specified page
                    if (i == pageNumber) {
                        // Scale signature to the specified size
                        val scaledSignature = Bitmap.createScaledBitmap(
                            signatureBitmap,
                            signatureWidth.toInt(),
                            signatureHeight.toInt(),
                            true
                        )
                        canvas.drawBitmap(scaledSignature, positionX, positionY, null)
                        scaledSignature.recycle()
                    }

                    // Add watermark for free users
                    if (addWatermark) {
                        drawWatermark(canvas, pageWidth, pageHeight)
                    }

                    pdfDocument.finishPage(pdfPage)
                    bitmap.recycle()

                    val progress = 40 + ((i + 1) * 50 / pageCount)
                    sendProgressEvent(progress, "Processing page ${i + 1} of $pageCount...")
                }

                sendProgressEvent(95, "Saving signed PDF...")

                // Write the PDF to output
                FileOutputStream(outputFile).use { outputStream ->
                    pdfDocument.writeTo(outputStream)
                }

                pdfDocument.close()
                pdfRenderer.close()
                fileDescriptor.close()
                signatureBitmap.recycle()

                sendProgressEvent(100, "Complete!")

                val response = Arguments.createMap().apply {
                    putString("outputPath", outputPath)
                    putInt("pageCount", pageCount)
                    putInt("signedPage", pageNumber + 1)
                    putDouble("fileSize", outputFile.length().toDouble())
                }

                promise.resolve(response)

            } catch (e: Exception) {
                // Clean up partial file on failure
                try {
                    File(outputPath).delete()
                } catch (_: Exception) {}

                promise.reject("SIGNING_ERROR", e.message ?: "Unknown error during PDF signing", e)
            }
        }
    }

    private fun drawWatermark(canvas: Canvas, pageWidth: Int, pageHeight: Int) {
        val paint = Paint().apply {
            color = Color.argb(40, 128, 128, 128)
            textSize = 24f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        val watermarkText = "PDF Smart Tools - Free Version"
        val textWidth = paint.measureText(watermarkText)

        // Draw watermark at bottom right
        val x = pageWidth - textWidth - 20f
        val y = pageHeight - 20f
        canvas.drawText(watermarkText, x, y, paint)
    }

    @ReactMethod
    fun getPdfPageCount(pdfPath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(pdfPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                val fileDescriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val pdfRenderer = PdfRenderer(fileDescriptor)
                val pageCount = pdfRenderer.pageCount

                pdfRenderer.close()
                fileDescriptor.close()

                promise.resolve(pageCount)
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message ?: "Failed to read PDF", e)
            }
        }
    }

    @ReactMethod
    fun getPdfPageDimensions(pdfPath: String, pageNumber: Int, promise: Promise) {
        scope.launch {
            try {
                val file = File(pdfPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                val fileDescriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val pdfRenderer = PdfRenderer(fileDescriptor)

                if (pageNumber < 0 || pageNumber >= pdfRenderer.pageCount) {
                    pdfRenderer.close()
                    fileDescriptor.close()
                    promise.reject("INVALID_PAGE", "Page number out of range")
                    return@launch
                }

                val page = pdfRenderer.openPage(pageNumber)
                val result = Arguments.createMap().apply {
                    putInt("width", page.width)
                    putInt("height", page.height)
                }
                page.close()
                pdfRenderer.close()
                fileDescriptor.close()

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message ?: "Failed to read PDF dimensions", e)
            }
        }
    }

    private fun sendProgressEvent(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        sendEvent("PdfSigningProgress", params)
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
