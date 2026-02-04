package com.pdfsmarttools.pdfpagemanager

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native module for PDF page management operations:
 * - Page thumbnails generation
 * - Page rotation
 * - Page deletion
 * - Page reordering
 *
 * All operations use atomic writes (temp file + rename) for safety.
 */
class PdfPageManagerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PdfPageManager"
        // Thumbnail dimensions
        private const val DEFAULT_THUMBNAIL_WIDTH = 200
        private const val MAX_THUMBNAIL_WIDTH = 400
        // Memory limits
        private const val MAX_BITMAP_PIXELS = 50_000_000L
        private const val PAGE_BATCH_SIZE = 5
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val isCancelled = AtomicBoolean(false)

    override fun getName(): String = "PdfPageManager"

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
        sendEvent("PdfPageManagerProgress", params)
    }

    /**
     * Get PDF page count and basic info
     */
    @ReactMethod
    fun getPageInfo(inputPath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(inputPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { renderer ->
                        val pageCount = renderer.pageCount
                        val pages = Arguments.createArray()

                        // Get info for each page
                        for (i in 0 until pageCount) {
                            renderer.openPage(i).use { page ->
                                val pageInfo = Arguments.createMap().apply {
                                    putInt("index", i)
                                    putInt("width", page.width)
                                    putInt("height", page.height)
                                }
                                pages.pushMap(pageInfo)
                            }
                        }

                        val result = Arguments.createMap().apply {
                            putInt("pageCount", pageCount)
                            putArray("pages", pages)
                            putDouble("fileSize", file.length().toDouble())
                        }
                        promise.resolve(result)
                    }
                }
            } catch (e: SecurityException) {
                promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", "Failed to read PDF file")
            }
        }
    }

    /**
     * Generate thumbnails for all pages
     *
     * @param inputPath Path to the PDF file
     * @param outputDir Directory to save thumbnails
     * @param maxWidth Maximum width for thumbnails (default 200)
     */
    @ReactMethod
    fun generateThumbnails(
        inputPath: String,
        outputDir: String,
        maxWidth: Int,
        promise: Promise
    ) {
        isCancelled.set(false)

        scope.launch {
            try {
                val file = File(inputPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                val outputDirFile = File(outputDir)
                if (!outputDirFile.exists()) {
                    outputDirFile.mkdirs()
                }

                val thumbnailWidth = maxWidth.coerceIn(100, MAX_THUMBNAIL_WIDTH)
                sendProgressEvent(0, "Opening PDF...")

                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { renderer ->
                        val pageCount = renderer.pageCount
                        val thumbnails = Arguments.createArray()

                        for (i in 0 until pageCount) {
                            if (isCancelled.get()) {
                                promise.reject("CANCELLED", "Operation cancelled")
                                return@launch
                            }

                            renderer.openPage(i).use { page ->
                                // Calculate thumbnail dimensions maintaining aspect ratio
                                val scale = thumbnailWidth.toFloat() / page.width.toFloat()
                                val thumbnailHeight = (page.height * scale).toInt()

                                // Create bitmap for thumbnail
                                val bitmap = Bitmap.createBitmap(
                                    thumbnailWidth,
                                    thumbnailHeight,
                                    Bitmap.Config.RGB_565
                                )

                                try {
                                    bitmap.eraseColor(Color.WHITE)
                                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                                    // Save thumbnail
                                    val thumbnailPath = File(outputDirFile, "page_${i}.jpg").absolutePath
                                    FileOutputStream(thumbnailPath).use { out ->
                                        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
                                    }

                                    val thumbInfo = Arguments.createMap().apply {
                                        putInt("index", i)
                                        putString("path", thumbnailPath)
                                        putInt("width", thumbnailWidth)
                                        putInt("height", thumbnailHeight)
                                        putInt("originalWidth", page.width)
                                        putInt("originalHeight", page.height)
                                    }
                                    thumbnails.pushMap(thumbInfo)
                                } finally {
                                    bitmap.recycle()
                                }

                                // Update progress
                                val progress = ((i + 1) * 100) / pageCount
                                sendProgressEvent(progress, "Generating thumbnails (${i + 1}/$pageCount)...")

                                // Periodic GC
                                if ((i + 1) % PAGE_BATCH_SIZE == 0) {
                                    System.gc()
                                }
                            }
                        }

                        val result = Arguments.createMap().apply {
                            putInt("pageCount", pageCount)
                            putArray("thumbnails", thumbnails)
                        }
                        promise.resolve(result)
                    }
                }
            } catch (e: SecurityException) {
                promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
            } catch (e: OutOfMemoryError) {
                System.gc()
                promise.reject("OUT_OF_MEMORY", "Not enough memory to generate thumbnails")
            } catch (e: Exception) {
                promise.reject("THUMBNAIL_ERROR", "Failed to generate thumbnails")
            }
        }
    }

    /**
     * Apply page operations (rotate, delete, reorder) and save to new PDF
     * Uses atomic writes (temp file + rename) for safety.
     *
     * @param inputPath Path to source PDF
     * @param outputPath Path for output PDF
     * @param operations Array of page operations:
     *   [{ "originalIndex": 0, "rotation": 90 }, { "originalIndex": 2 }, ...]
     *   - originalIndex: 0-based index of page in source PDF
     *   - rotation: degrees to rotate (0, 90, 180, 270) - optional
     *   - Pages not in array are deleted
     *   - Order in array determines new page order
     * @param isPro Whether user has Pro subscription
     */
    @ReactMethod
    fun applyPageChanges(
        inputPath: String,
        outputPath: String,
        operations: ReadableArray,
        isPro: Boolean,
        promise: Promise
    ) {
        isCancelled.set(false)

        scope.launch {
            var tempFile: File? = null

            try {
                val inputFile = File(inputPath)
                if (!inputFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found")
                    return@launch
                }

                if (operations.size() == 0) {
                    promise.reject("NO_OPERATIONS", "No page operations specified")
                    return@launch
                }

                // Parse operations
                val pageOps = mutableListOf<PageOperation>()
                for (i in 0 until operations.size()) {
                    val op = operations.getMap(i) ?: continue
                    val originalIndex = op.getInt("originalIndex")
                    val rotation = if (op.hasKey("rotation")) op.getInt("rotation") else 0
                    pageOps.add(PageOperation(originalIndex, rotation))
                }

                // Free tier limit: first 5 pages only
                if (!isPro && pageOps.size > 5) {
                    promise.reject(
                        "PRO_REQUIRED",
                        "Free users can process up to 5 pages. Upgrade to Pro for unlimited pages."
                    )
                    return@launch
                }

                sendProgressEvent(0, "Opening PDF...")

                // Create temp file for atomic write
                val outputFile = File(outputPath)
                outputFile.parentFile?.mkdirs()
                tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")

                ParcelFileDescriptor.open(inputFile, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { renderer ->
                        val totalPages = renderer.pageCount

                        // Validate all page indices
                        for (op in pageOps) {
                            if (op.originalIndex < 0 || op.originalIndex >= totalPages) {
                                promise.reject(
                                    "INVALID_PAGE_INDEX",
                                    "Page index ${op.originalIndex} is out of range (0-${totalPages - 1})"
                                )
                                return@launch
                            }
                        }

                        sendProgressEvent(10, "Processing pages...")

                        val pdfDocument = PdfDocument()
                        var newPageNumber = 1

                        try {
                            for ((index, op) in pageOps.withIndex()) {
                                if (isCancelled.get()) {
                                    pdfDocument.close()
                                    tempFile?.delete()
                                    promise.reject("CANCELLED", "Operation cancelled")
                                    return@launch
                                }

                                renderer.openPage(op.originalIndex).use { page ->
                                    // Calculate dimensions with memory limits
                                    var width = page.width
                                    var height = page.height
                                    val originalWidth = width
                                    val originalHeight = height

                                    val pixelCount = width.toLong() * height.toLong()
                                    if (pixelCount > MAX_BITMAP_PIXELS) {
                                        val reduction = Math.sqrt(MAX_BITMAP_PIXELS.toDouble() / pixelCount.toDouble())
                                        width = (width * reduction).toInt()
                                        height = (height * reduction).toInt()
                                    }

                                    // Create bitmap
                                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)

                                    try {
                                        bitmap.eraseColor(Color.WHITE)
                                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                                        // Apply rotation if needed
                                        val finalBitmap = if (op.rotation != 0) {
                                            rotateBitmap(bitmap, op.rotation)
                                        } else {
                                            bitmap
                                        }

                                        // Determine output page dimensions
                                        val (outWidth, outHeight) = if (op.rotation == 90 || op.rotation == 270) {
                                            Pair(originalHeight, originalWidth)
                                        } else {
                                            Pair(originalWidth, originalHeight)
                                        }

                                        // Create PDF page
                                        val pageInfo = PdfDocument.PageInfo.Builder(outWidth, outHeight, newPageNumber).create()
                                        val pdfPage = pdfDocument.startPage(pageInfo)

                                        // Draw bitmap scaled to original dimensions
                                        val destRect = android.graphics.Rect(0, 0, outWidth, outHeight)
                                        val paint = Paint().apply {
                                            isFilterBitmap = true
                                            isDither = true
                                        }
                                        pdfPage.canvas.drawBitmap(finalBitmap, null, destRect, paint)
                                        pdfDocument.finishPage(pdfPage)

                                        // Clean up rotated bitmap if different from original
                                        if (finalBitmap !== bitmap) {
                                            finalBitmap.recycle()
                                        }
                                    } finally {
                                        bitmap.recycle()
                                    }

                                    newPageNumber++

                                    // Update progress
                                    val progress = 10 + ((index + 1) * 80) / pageOps.size
                                    sendProgressEvent(progress, "Processing page ${index + 1}/${pageOps.size}...")

                                    // Periodic GC
                                    if ((index + 1) % PAGE_BATCH_SIZE == 0) {
                                        System.gc()
                                    }
                                }
                            }

                            // Write to temp file
                            sendProgressEvent(90, "Saving PDF...")
                            FileOutputStream(tempFile).use { out ->
                                pdfDocument.writeTo(out)
                            }
                        } finally {
                            pdfDocument.close()
                        }

                        // Atomic rename: temp file -> output file
                        val tempFileToRename = tempFile
                        if (tempFileToRename != null && tempFileToRename.exists()) {
                            // Delete existing output file if present
                            if (outputFile.exists()) {
                                outputFile.delete()
                            }

                            val renamed = tempFileToRename.renameTo(outputFile)
                            if (!renamed) {
                                // Fallback: copy and delete
                                tempFileToRename.copyTo(outputFile, overwrite = true)
                                tempFileToRename.delete()
                            }
                            tempFile = null // Mark as handled
                        }

                        sendProgressEvent(100, "Complete!")

                        val result = Arguments.createMap().apply {
                            putString("outputPath", outputPath)
                            putInt("pageCount", pageOps.size)
                            putDouble("fileSize", outputFile.length().toDouble())
                            putBoolean("success", true)
                        }
                        promise.resolve(result)
                    }
                }
            } catch (e: SecurityException) {
                tempFile?.delete()
                promise.reject("PDF_PROTECTED", "This PDF is password protected or corrupted")
            } catch (e: OutOfMemoryError) {
                tempFile?.delete()
                System.gc()
                promise.reject("OUT_OF_MEMORY", "Not enough memory to process this PDF")
            } catch (e: Exception) {
                tempFile?.delete()
                promise.reject("PROCESS_ERROR", "Failed to process PDF pages")
            } finally {
                System.gc()
            }
        }
    }

    /**
     * Rotate a bitmap by the specified degrees
     */
    private fun rotateBitmap(source: Bitmap, degrees: Int): Bitmap {
        val matrix = Matrix()
        matrix.postRotate(degrees.toFloat())
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    /**
     * Cancel ongoing operation
     */
    @ReactMethod
    fun cancelOperation(promise: Promise) {
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

    /**
     * Data class for page operation
     */
    private data class PageOperation(
        val originalIndex: Int,
        val rotation: Int = 0 // 0, 90, 180, 270
    )
}
