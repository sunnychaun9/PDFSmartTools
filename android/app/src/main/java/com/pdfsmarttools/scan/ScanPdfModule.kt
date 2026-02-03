package com.pdfsmarttools.scan

import android.content.ContentValues
import android.graphics.*
import android.graphics.pdf.PdfDocument
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.bridge.*
import java.io.*
import java.util.concurrent.Executors

class ScanPdfModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val executor = Executors.newSingleThreadExecutor()
    private val TAG = "ScanPdfModule"

    override fun getName(): String = "ScanPdfModule"

    /**
     * Generate PDF from image paths and save to app's files directory
     */
    @ReactMethod
    fun generatePdf(pagePaths: ReadableArray, options: ReadableMap, promise: Promise) {
        val ctx = reactApplicationContext
        executor.execute {
            var pdf: PdfDocument? = null
            try {
                val fileName = options.getString("fileName") ?: "scan_${System.currentTimeMillis()}.pdf"

                Log.d(TAG, "Starting PDF generation with ${pagePaths.size()} pages")

                pdf = PdfDocument()

                // A4 size in points (72 points per inch)
                val a4Width = 595
                val a4Height = 842
                var pagesAdded = 0

                for (i in 0 until pagePaths.size()) {
                    val path = pagePaths.getString(i)
                    if (path == null) {
                        Log.w(TAG, "Page $i: path is null, skipping")
                        continue
                    }

                    Log.d(TAG, "Loading image $i from: $path")
                    val bitmap = loadBitmapFromPath(ctx, path)
                    if (bitmap == null) {
                        Log.e(TAG, "Page $i: Failed to load bitmap from $path")
                        continue
                    }

                    Log.d(TAG, "Page $i: Loaded bitmap ${bitmap.width}x${bitmap.height}")

                    // Scale bitmap to fit A4 while maintaining aspect ratio
                    val scaledBitmap = scaleBitmapToFitPage(bitmap, a4Width, a4Height)
                    bitmap.recycle()

                    // Center the image on the page
                    val pageInfo = PdfDocument.PageInfo.Builder(a4Width, a4Height, pagesAdded + 1).create()
                    val page = pdf.startPage(pageInfo)
                    val canvas: Canvas = page.canvas

                    // Fill white background
                    canvas.drawColor(Color.WHITE)

                    // Calculate position to center the image
                    val left = (a4Width - scaledBitmap.width) / 2f
                    val top = (a4Height - scaledBitmap.height) / 2f

                    canvas.drawBitmap(scaledBitmap, left, top, null)
                    pdf.finishPage(page)
                    scaledBitmap.recycle()
                    pagesAdded++
                    Log.d(TAG, "Page $i added successfully")

                    // Trigger GC periodically to prevent memory buildup
                    if (pagesAdded % 5 == 0) {
                        System.gc()
                    }
                }

                if (pagesAdded == 0) {
                    pdf.close()
                    promise.reject("NO_PAGES", "No valid images could be loaded. Please try again.")
                    return@execute
                }

                // Save to app's files directory (guaranteed access)
                val pdfDir = File(ctx.filesDir, "scans")
                if (!pdfDir.exists()) {
                    pdfDir.mkdirs()
                    Log.d(TAG, "Created directory: ${pdfDir.absolutePath}")
                }

                val pdfFile = File(pdfDir, fileName)
                Log.d(TAG, "Writing PDF to: ${pdfFile.absolutePath}")

                FileOutputStream(pdfFile).use { fos ->
                    pdf.writeTo(fos)
                    fos.flush()
                }
                pdf.close()

                // Verify file was written
                if (!pdfFile.exists() || pdfFile.length() == 0L) {
                    promise.reject("WRITE_FAILED", "PDF file was not created properly")
                    return@execute
                }

                Log.d(TAG, "PDF created successfully: ${pdfFile.length()} bytes, $pagesAdded pages")

                val result = Arguments.createMap()
                result.putString("uri", pdfFile.absolutePath)
                result.putString("filePath", pdfFile.absolutePath)
                result.putString("fileName", fileName)
                result.putInt("pageCount", pagesAdded)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "PDF generation failed", e)
                pdf?.close()
                promise.reject("PDF_ERROR", e.message ?: "Unknown error", e)
            }
        }
    }

    /**
     * Save PDF to Downloads folder using MediaStore
     */
    @ReactMethod
    fun savePdfToDownloads(sourcePath: String, fileName: String, promise: Promise) {
        val ctx = reactApplicationContext
        executor.execute {
            try {
                val sourceFile = File(sourcePath)
                if (!sourceFile.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Source file not found: $sourcePath")
                    return@execute
                }

                val resolver = ctx.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/PDFSmartTools")
                    }
                }

                val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                } else {
                    MediaStore.Files.getContentUri("external")
                }

                val uri = resolver.insert(collection, values)
                if (uri == null) {
                    promise.reject("WRITE_FAILED", "Unable to create file in Downloads")
                    return@execute
                }

                resolver.openOutputStream(uri)?.use { out ->
                    FileInputStream(sourceFile).use { input ->
                        input.copyTo(out)
                    }
                }

                val result = Arguments.createMap()
                result.putString("uri", uri.toString())
                result.putBoolean("success", true)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Save to downloads failed", e)
                promise.reject("SAVE_ERROR", e.message, e)
            }
        }
    }

    /**
     * Process captured image - enhance, rotate
     */
    @ReactMethod
    fun processImage(path: String, options: ReadableMap, promise: Promise) {
        val ctx = reactApplicationContext
        executor.execute {
            try {
                Log.d(TAG, "Processing image: $path")
                var bitmap = loadBitmapFromPath(ctx, path)
                if (bitmap == null) {
                    promise.reject("LOAD_FAILED", "Unable to load image from: $path")
                    return@execute
                }

                // Apply rotation if specified
                val rotation = if (options.hasKey("rotation")) options.getInt("rotation") else 0
                if (rotation != 0) {
                    bitmap = rotateBitmap(bitmap, rotation.toFloat())
                }

                // Apply enhancement mode
                val mode = if (options.hasKey("mode")) options.getString("mode") else "auto"
                bitmap = when (mode) {
                    "grayscale" -> applyGrayscale(bitmap)
                    "bw" -> applyBlackAndWhite(bitmap)
                    "enhanced", "auto" -> enhanceDocument(bitmap)
                    else -> bitmap
                }

                // Save to cache
                val outFile = File(ctx.cacheDir, "processed_${System.currentTimeMillis()}.jpg")
                FileOutputStream(outFile).use { fos ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 95, fos)
                }
                bitmap.recycle()

                Log.d(TAG, "Image processed: ${outFile.absolutePath}")

                val result = Arguments.createMap()
                result.putString("path", outFile.absolutePath)
                result.putBoolean("success", true)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Image processing failed", e)
                promise.reject("PROCESS_ERROR", e.message, e)
            }
        }
    }

    /**
     * Rotate an image file
     */
    @ReactMethod
    fun rotateImage(path: String, degrees: Int, promise: Promise) {
        val ctx = reactApplicationContext
        executor.execute {
            try {
                var bitmap = loadBitmapFromPath(ctx, path)
                if (bitmap == null) {
                    promise.reject("LOAD_FAILED", "Unable to load image")
                    return@execute
                }

                bitmap = rotateBitmap(bitmap, degrees.toFloat())

                val outFile = File(ctx.cacheDir, "rotated_${System.currentTimeMillis()}.jpg")
                FileOutputStream(outFile).use { fos ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 95, fos)
                }
                bitmap.recycle()

                val result = Arguments.createMap()
                result.putString("path", outFile.absolutePath)
                result.putBoolean("success", true)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Rotation failed", e)
                promise.reject("ROTATE_ERROR", e.message, e)
            }
        }
    }

    /**
     * Load bitmap from various path formats with memory-efficient streaming
     */
    private fun loadBitmapFromPath(ctx: ReactApplicationContext, path: String): Bitmap? {
        return try {
            val resolver = ctx.contentResolver

            // First pass: Get image dimensions without loading the full image
            val boundsOptions = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }

            when {
                path.startsWith("content://") -> {
                    Log.d(TAG, "Loading from content URI")
                    resolver.openInputStream(Uri.parse(path))?.use { stream ->
                        BitmapFactory.decodeStream(stream, null, boundsOptions)
                    }
                }
                else -> {
                    val filePath = if (path.startsWith("file://")) path.removePrefix("file://") else path
                    Log.d(TAG, "Loading from file path")
                    FileInputStream(filePath).use { stream ->
                        BitmapFactory.decodeStream(stream, null, boundsOptions)
                    }
                }
            }

            if (boundsOptions.outWidth <= 0 || boundsOptions.outHeight <= 0) {
                Log.e(TAG, "Could not determine image dimensions for: $path")
                return null
            }

            // Calculate sample size for large images to prevent OOM
            val maxDimension = 2048
            var sampleSize = 1
            val width = boundsOptions.outWidth
            val height = boundsOptions.outHeight

            // Calculate appropriate sample size (must be power of 2 for efficiency)
            while ((width / sampleSize) > maxDimension || (height / sampleSize) > maxDimension) {
                sampleSize *= 2
            }

            Log.d(TAG, "Image dimensions: ${width}x${height}, using sampleSize: $sampleSize")

            // Second pass: Decode with calculated sample size using RGB_565 for memory efficiency
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                // Use RGB_565 for scanned documents (no transparency needed)
                inPreferredConfig = Bitmap.Config.RGB_565
                // Enable memory-efficient options
                inPurgeable = true
                inInputShareable = true
            }

            var bitmap: Bitmap? = when {
                path.startsWith("content://") -> {
                    resolver.openInputStream(Uri.parse(path))?.use { stream ->
                        BitmapFactory.decodeStream(stream, null, decodeOptions)
                    }
                }
                else -> {
                    val filePath = if (path.startsWith("file://")) path.removePrefix("file://") else path
                    FileInputStream(filePath).use { stream ->
                        BitmapFactory.decodeStream(stream, null, decodeOptions)
                    }
                }
            }

            if (bitmap == null) {
                Log.e(TAG, "Failed to decode bitmap from: $path")
                return null
            }

            // Handle EXIF rotation for file paths
            if (!path.startsWith("content://")) {
                val filePath = if (path.startsWith("file://")) path.removePrefix("file://") else path
                try {
                    val exif = ExifInterface(filePath)
                    val orientation = exif.getAttributeInt(
                        ExifInterface.TAG_ORIENTATION,
                        ExifInterface.ORIENTATION_NORMAL
                    )
                    val rotation = when (orientation) {
                        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                        else -> 0f
                    }
                    if (rotation != 0f) {
                        bitmap = rotateBitmap(bitmap!!, rotation)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Could not read EXIF data", e)
                }
            }

            bitmap
        } catch (ex: OutOfMemoryError) {
            Log.e(TAG, "Out of memory loading bitmap from $path", ex)
            System.gc()
            null
        } catch (ex: Exception) {
            Log.e(TAG, "Error loading bitmap from $path", ex)
            null
        }
    }

    /**
     * Apply document enhancement - memory optimized
     */
    private fun enhanceDocument(source: Bitmap): Bitmap {
        val width = source.width
        val height = source.height
        // Use RGB_565 for scanned documents (no alpha needed)
        val result = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
        val canvas = Canvas(result)

        // Fill with white background first
        canvas.drawColor(Color.WHITE)

        val contrast = 1.3f
        val brightness = 10f

        val cm = ColorMatrix(floatArrayOf(
            contrast, 0f, 0f, 0f, brightness,
            0f, contrast, 0f, 0f, brightness,
            0f, 0f, contrast, 0f, brightness,
            0f, 0f, 0f, 1f, 0f
        ))

        val satMatrix = ColorMatrix()
        satMatrix.setSaturation(1.2f)
        cm.postConcat(satMatrix)

        val paint = Paint()
        paint.colorFilter = ColorMatrixColorFilter(cm)
        canvas.drawBitmap(source, 0f, 0f, paint)

        source.recycle()
        return result
    }

    /**
     * Convert to grayscale - memory optimized
     */
    private fun applyGrayscale(source: Bitmap): Bitmap {
        val width = source.width
        val height = source.height
        // Use RGB_565 for grayscale output (no alpha needed)
        val result = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
        val canvas = Canvas(result)

        // Fill with white background first
        canvas.drawColor(Color.WHITE)

        val cm = ColorMatrix()
        cm.setSaturation(0f)

        val paint = Paint()
        paint.colorFilter = ColorMatrixColorFilter(cm)
        canvas.drawBitmap(source, 0f, 0f, paint)

        source.recycle()
        return result
    }

    /**
     * Convert to high contrast black and white - memory optimized
     * Uses chunked processing for large images to prevent OOM
     */
    private fun applyBlackAndWhite(source: Bitmap): Bitmap {
        val width = source.width
        val height = source.height
        // Use RGB_565 for B&W output (no alpha needed)
        val result = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)

        // Process in chunks to prevent OOM with large images
        val chunkHeight = minOf(height, 500)
        var totalSum = 0L
        var totalPixels = 0L

        // First pass: calculate threshold in chunks
        for (startY in 0 until height step chunkHeight) {
            val endY = minOf(startY + chunkHeight, height)
            val chunkPixelCount = width * (endY - startY)
            val pixels = IntArray(chunkPixelCount)
            source.getPixels(pixels, 0, width, 0, startY, width, endY - startY)

            for (pixel in pixels) {
                val gray = (Color.red(pixel) * 0.299 + Color.green(pixel) * 0.587 + Color.blue(pixel) * 0.114).toInt()
                totalSum += gray
            }
            totalPixels += chunkPixelCount
        }

        val threshold = (totalSum / totalPixels).toInt()

        // Second pass: apply threshold in chunks
        for (startY in 0 until height step chunkHeight) {
            val endY = minOf(startY + chunkHeight, height)
            val chunkPixelCount = width * (endY - startY)
            val pixels = IntArray(chunkPixelCount)
            source.getPixels(pixels, 0, width, 0, startY, width, endY - startY)

            for (i in pixels.indices) {
                val pixel = pixels[i]
                val gray = (Color.red(pixel) * 0.299 + Color.green(pixel) * 0.587 + Color.blue(pixel) * 0.114).toInt()
                pixels[i] = if (gray > threshold - 20) Color.WHITE else Color.BLACK
            }

            result.setPixels(pixels, 0, width, 0, startY, width, endY - startY)
        }

        source.recycle()
        return result
    }

    /**
     * Rotate bitmap by degrees
     */
    private fun rotateBitmap(source: Bitmap, degrees: Float): Bitmap {
        if (degrees == 0f) return source

        val matrix = Matrix()
        matrix.postRotate(degrees)
        val rotated = Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
        if (rotated != source) {
            source.recycle()
        }
        return rotated
    }

    /**
     * Scale bitmap to fit within page dimensions
     */
    private fun scaleBitmapToFitPage(source: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
        val width = source.width
        val height = source.height

        val targetWidth = (maxWidth * 0.9).toInt()
        val targetHeight = (maxHeight * 0.9).toInt()

        val ratioX = targetWidth.toFloat() / width
        val ratioY = targetHeight.toFloat() / height
        val ratio = minOf(ratioX, ratioY)

        val newWidth = (width * ratio).toInt()
        val newHeight = (height * ratio).toInt()

        return Bitmap.createScaledBitmap(source, newWidth, newHeight, true)
    }
}
