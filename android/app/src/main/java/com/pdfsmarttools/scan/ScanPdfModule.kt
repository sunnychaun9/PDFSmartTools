package com.pdfsmarttools.scan

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.annotation.NonNull
import com.facebook.react.bridge.*
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.Executors

class ScanPdfModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "ScanPdfModule"

  @ReactMethod
  fun generatePdf(pagePaths: ReadableArray, options: ReadableMap, promise: Promise) {
    val ctx = reactApplicationContext
    executor.execute {
      var pdf: PdfDocument? = null
      try {
        val fileName = if (options.hasKey("fileName")) options.getString("fileName") else "scan_${System.currentTimeMillis()}.pdf"
        pdf = PdfDocument()

        for (i in 0 until pagePaths.size()) {
          val path = pagePaths.getString(i) ?: continue
          val bitmap = loadBitmap(path) ?: continue

          // Scale bitmap to reasonable size for PDF page if needed
          val pageInfo = PdfDocument.PageInfo.Builder(bitmap.width, bitmap.height, i + 1).create()
          val page = pdf.startPage(pageInfo)
          val canvas: Canvas = page.canvas
          canvas.drawBitmap(bitmap, 0f, 0f, null)
          pdf.finishPage(page)
          bitmap.recycle()
        }

        // Save via MediaStore (scoped storage safe)
        val resolver = ctx.contentResolver
        val values = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Documents/PDFSmartTools")
          }
        }

        val collection: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          MediaStore.Files.getContentUri("external")
        } else {
          MediaStore.Files.getContentUri("external")
        }

        val uri: Uri? = resolver.insert(collection, values)
        if (uri == null) {
          promise.reject("WRITE_FAILED", "Unable to create file")
          pdf.close()
          return@execute
        }

        var out: OutputStream? = null
        try {
          out = resolver.openOutputStream(uri)
          pdf.writeTo(out)
        } finally {
          out?.close()
        }

        pdf.close()
        val result = Arguments.createMap()
        result.putString("uri", uri.toString())
        promise.resolve(result)
      } catch (e: Exception) {
        pdf?.close()
        promise.reject("PDF_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun processImage(path: String, polygon: ReadableArray?, mode: String?, promise: Promise) {
    // This method orchestrates processing on a background thread.
    // For heavy operations (filters, perspective warp), integrate OpenCV native code.
    val ctx = reactApplicationContext
    executor.execute {
      try {
        // Load original bitmap efficiently
        val bitmap = loadBitmap(path) ?: run {
          promise.reject("LOAD_FAILED", "Unable to load image")
          return@execute
        }

        // NOTE: For a production-grade implementation, call into OpenCV JNI functions
        // to run perspective correction and filters off the UI thread. Here we perform
        // a safe no-op pass-through that writes the bitmap to cache and returns its path.

        val cacheDir = ctx.cacheDir
        val outFile = java.io.File(cacheDir, "scan_${System.currentTimeMillis()}.jpg")
        val fos = java.io.FileOutputStream(outFile)
        // Default to high quality JPEG to preserve detail; caller may compress later
        bitmap.compress(Bitmap.CompressFormat.JPEG, 95, fos)
        fos.flush()
        fos.close()
        bitmap.recycle()

        val result = Arguments.createMap()
        result.putString("path", outFile.absolutePath)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("PROCESS_ERROR", e.message, e)
      }
    }
  }

  private fun loadBitmap(path: String): Bitmap? {
    val resolver = reactApplicationContext.contentResolver
    return try {
      val input: InputStream? = if (path.startsWith("content://")) {
        resolver.openInputStream(Uri.parse(path))
      } else {
        FileInputStream(path)
      }
      val options = BitmapFactory.Options()
      options.inPreferredConfig = Bitmap.Config.ARGB_8888
      val b = BitmapFactory.decodeStream(input, null, options)
      input?.close()
      b
    } catch (ex: Exception) {
      null
    }
  }
}
