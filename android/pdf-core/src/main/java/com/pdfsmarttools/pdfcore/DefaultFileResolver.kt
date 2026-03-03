package com.pdfsmarttools.pdfcore

import android.content.Context
import android.os.ParcelFileDescriptor
import com.pdfsmarttools.core.io.FileResolver
import java.io.File
import java.io.FileOutputStream

/**
 * Default implementation of FileResolver using Android's ContentResolver.
 * Handles content://, file://, and absolute path resolution.
 */
class DefaultFileResolver(private val context: Context) : FileResolver {

    override fun resolveInputFile(path: String, prefix: String): File {
        if (path.startsWith("content://")) {
            val uri = android.net.Uri.parse(path)
            val cacheFile = File(
                context.cacheDir,
                "${prefix}_${System.currentTimeMillis()}_${path.hashCode()}.pdf"
            )

            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(cacheFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                    output.flush()
                }
            } ?: throw IllegalArgumentException("Cannot open content URI: $path")

            return cacheFile
        }

        val filePath = if (path.startsWith("file://")) {
            path.removePrefix("file://")
        } else {
            path
        }

        return File(filePath)
    }

    override fun resolveToFileDescriptor(path: String): ParcelFileDescriptor {
        if (path.startsWith("content://")) {
            val uri = android.net.Uri.parse(path)
            return context.contentResolver.openFileDescriptor(uri, "r")
                ?: throw IllegalArgumentException("Cannot open content URI: $path")
        }

        val filePath = if (path.startsWith("file://")) path.removePrefix("file://") else path
        val file = File(filePath)
        if (!file.exists()) throw IllegalArgumentException("File not found: $path")

        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }
}
