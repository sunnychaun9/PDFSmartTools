package com.pdfsmarttools.core.result

sealed class PdfError(
    val code: String,
    val message: String,
    val cause: Throwable? = null
) {
    class FileNotFound(path: String) :
        PdfError("FILE_NOT_FOUND", "File not found: $path")

    class InvalidInput(message: String) :
        PdfError("INVALID_INPUT", message)

    class PdfCorrupted(message: String, cause: Throwable? = null) :
        PdfError("PDF_CORRUPTED", message, cause)

    class PdfEncrypted(message: String, cause: Throwable? = null) :
        PdfError("PDF_ENCRYPTED", message, cause)

    class InvalidPassword(message: String) :
        PdfError("INVALID_PASSWORD", message)

    class UnsupportedFormat(message: String) :
        PdfError("UNSUPPORTED_FORMAT", message)

    class OutOfMemory(message: String, cause: Throwable? = null) :
        PdfError("OUT_OF_MEMORY", message, cause)

    class Cancelled(message: String = "Operation was cancelled") :
        PdfError("CANCELLED", message)

    class ProcessingFailed(message: String, cause: Throwable? = null) :
        PdfError("PROCESSING_FAILED", message, cause)

    class ValidationFailed(message: String) :
        PdfError("VALIDATION_FAILED", message)

    class PermissionDenied(message: String) :
        PdfError("PERMISSION_DENIED", message)

    class ProRequired(message: String = "This feature requires Pro subscription") :
        PdfError("PRO_REQUIRED", message)

    class Unknown(message: String, cause: Throwable? = null) :
        PdfError("UNKNOWN_ERROR", message, cause)

    fun toException(): Exception = PdfException(this)

    companion object {
        fun fromException(e: Exception): PdfError = when {
            e.message?.contains("not found", ignoreCase = true) == true ->
                FileNotFound(e.message ?: "Unknown file")
            e.message?.contains("password", ignoreCase = true) == true ->
                InvalidPassword(e.message ?: "Invalid password")
            e.message?.contains("corrupt", ignoreCase = true) == true ->
                PdfCorrupted(e.message ?: "PDF is corrupted", e)
            e.message?.contains("encrypt", ignoreCase = true) == true ->
                PdfEncrypted(e.message ?: "PDF is encrypted", e)
            e is IllegalArgumentException ->
                InvalidInput(e.message ?: "Invalid input")
            e is IllegalStateException ->
                ProcessingFailed(e.message ?: "Processing failed", e)
            else ->
                Unknown(e.message ?: "Unknown error", e)
        }
    }
}

class PdfException(val error: PdfError) : Exception(error.message, error.cause)
