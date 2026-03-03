package com.pdfsmarttools.bridge.adapter

import com.facebook.react.bridge.Promise
import com.pdfsmarttools.core.result.PdfError

/**
 * Maps PdfError sealed classes to promise.reject() calls.
 * Sanitizes error messages to prevent leaking sensitive data (file paths, passwords).
 */
object ErrorMapper {

    fun rejectPromise(promise: Promise, error: PdfError) {
        promise.reject(error.code, sanitize(error.message))
    }

    /**
     * Strip file paths and sensitive data from error messages.
     */
    private fun sanitize(message: String): String {
        // Remove absolute file paths (both Unix and Windows style)
        var sanitized = message
            .replace(Regex("/[\\w/.-]+\\.pdf"), "[file]")
            .replace(Regex("[A-Z]:\\\\[\\w\\\\.-]+\\.pdf"), "[file]")
            .replace(Regex("/data/[\\w/.-]+"), "[internal]")
            .replace(Regex("/storage/[\\w/.-]+"), "[storage]")

        // Remove content:// URIs
        sanitized = sanitized.replace(Regex("content://[^\\s]+"), "[content-uri]")

        // Truncate overly long messages
        if (sanitized.length > 200) {
            sanitized = sanitized.take(200) + "..."
        }

        return sanitized
    }
}
