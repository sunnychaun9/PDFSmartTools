package com.pdfsmarttools.core.io

import android.os.ParcelFileDescriptor
import java.io.File

/**
 * Interface for resolving file paths and URIs.
 * Decouples engines from Android's ContentResolver.
 */
interface FileResolver {

    /**
     * Resolve a file path that may be a content:// URI, file:// URI, or plain path.
     * Content URIs are copied to cache for direct file access.
     *
     * @param path Input path (content://, file://, or absolute path)
     * @param prefix Cache file prefix for identification
     * @return Resolved File object
     */
    fun resolveInputFile(path: String, prefix: String): File

    /**
     * Resolve a path to a ParcelFileDescriptor without copying the file.
     * For PdfRenderer-based operations that accept file descriptors directly.
     *
     * Caller is responsible for closing the returned descriptor.
     *
     * @param path Input path (content://, file://, or absolute path)
     * @return ParcelFileDescriptor ready for PdfRenderer
     */
    fun resolveToFileDescriptor(path: String): ParcelFileDescriptor

    /**
     * Check if the given path is a content:// URI (cache file cleanup needed).
     */
    fun isCacheFile(path: String): Boolean = path.startsWith("content://")
}
