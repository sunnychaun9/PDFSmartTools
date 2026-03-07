package com.pdfsmarttools.convert.toword.analysis

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import java.io.ByteArrayOutputStream

/**
 * Extracts embedded images from PDF pages using PDFBox resource API.
 *
 * For each page, iterates over XObject resources to find embedded images.
 * Returns image bytes with approximate bounding box coordinates for
 * position-aware insertion into DOCX.
 *
 * Uses Android's BitmapFactory to decode PDFBox raw image streams,
 * since java.awt.BufferedImage is not available on Android.
 */
class ImageExtractor {

    companion object {
        private const val TAG = "ImageExtractor"
        private const val MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB per image
        private const val MAX_IMAGE_DIMENSION = 1200
    }

    /**
     * Extract images from a single PDF page.
     *
     * @param document The PDF document.
     * @param pageIndex 0-based page index.
     * @return List of extracted images with position metadata.
     */
    fun extractImages(document: PDDocument, pageIndex: Int): List<ImageBlock> {
        val images = mutableListOf<ImageBlock>()
        val page = document.getPage(pageIndex)
        val resources = page.resources ?: return images

        try {
            val xObjectNames = resources.xObjectNames ?: return images

            var imageIndex = 0
            for (name in xObjectNames) {
                try {
                    val xObject = resources.getXObject(name) ?: continue
                    if (xObject !is PDImageXObject) continue

                    val imageBytes = extractImageBytes(xObject) ?: continue
                    if (imageBytes.size > MAX_IMAGE_BYTES) continue

                    // Approximate position — place images sequentially down the page
                    val mediaBox = page.mediaBox
                    val yPos = mediaBox.height * (0.2f + imageIndex * 0.3f)

                    images.add(ImageBlock(
                        imageBytes = imageBytes,
                        x = mediaBox.width * 0.1f,
                        y = yPos,
                        width = xObject.width.toFloat(),
                        height = xObject.height.toFloat(),
                        pageIndex = pageIndex,
                        format = "png"
                    ))

                    imageIndex++
                    if (imageIndex >= 5) break // Limit images per page
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to extract image from page $pageIndex: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read resources for page $pageIndex: ${e.message}")
        }

        return images
    }

    /**
     * Extract image bytes from a PDImageXObject.
     *
     * Uses the raw stream from PDFBox and decodes via Android BitmapFactory,
     * then re-encodes as PNG for DOCX embedding.
     */
    private fun extractImageBytes(image: PDImageXObject): ByteArray? {
        return try {
            // Get raw image bytes from PDFBox
            val rawBytes = image.stream.toByteArray()
            if (rawBytes == null || rawBytes.isEmpty()) return null

            // Try to decode with BitmapFactory
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, options)

            // If BitmapFactory can't decode the raw stream, try using the suffix
            val bitmap: Bitmap? = if (options.outWidth > 0) {
                // Calculate sample size for large images
                val sampleSize = calculateSampleSize(options.outWidth, options.outHeight)
                val decodeOptions = BitmapFactory.Options().apply {
                    inSampleSize = sampleSize
                    inPreferredConfig = Bitmap.Config.RGB_565
                }
                BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, decodeOptions)
            } else {
                // Raw bytes might be in a format BitmapFactory doesn't handle directly
                // Try JPEG/PNG re-encoding approach
                null
            }

            if (bitmap == null) return null

            val bos = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 85, bos)
            bitmap.recycle()

            val result = bos.toByteArray()
            if (result.size > MAX_IMAGE_BYTES) null else result
        } catch (e: Exception) {
            Log.w(TAG, "Image byte extraction failed: ${e.message}")
            null
        }
    }

    private fun calculateSampleSize(width: Int, height: Int): Int {
        var sampleSize = 1
        while (width / sampleSize > MAX_IMAGE_DIMENSION || height / sampleSize > MAX_IMAGE_DIMENSION) {
            sampleSize *= 2
        }
        return sampleSize
    }
}
