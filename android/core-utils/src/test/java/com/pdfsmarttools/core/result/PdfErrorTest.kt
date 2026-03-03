package com.pdfsmarttools.core.result

import org.junit.Assert.*
import org.junit.Test

class PdfErrorTest {

    @Test
    fun `FileNotFound has correct code and message`() {
        val error = PdfError.FileNotFound("/test.pdf")
        assertEquals("FILE_NOT_FOUND", error.code)
        assertTrue(error.message.contains("/test.pdf"))
    }

    @Test
    fun `InvalidInput has correct code`() {
        val error = PdfError.InvalidInput("path is empty")
        assertEquals("INVALID_INPUT", error.code)
        assertEquals("path is empty", error.message)
    }

    @Test
    fun `OutOfMemory preserves cause`() {
        val cause = OutOfMemoryError("heap full")
        val error = PdfError.OutOfMemory("Not enough memory", cause)
        assertEquals("OUT_OF_MEMORY", error.code)
        assertSame(cause, error.cause)
    }

    @Test
    fun `Cancelled has default message`() {
        val error = PdfError.Cancelled()
        assertEquals("CANCELLED", error.code)
        assertEquals("Operation was cancelled", error.message)
    }

    @Test
    fun `ProRequired has default message`() {
        val error = PdfError.ProRequired()
        assertEquals("PRO_REQUIRED", error.code)
        assertTrue(error.message.contains("Pro"))
    }

    @Test
    fun `toException creates PdfException with error reference`() {
        val error = PdfError.ProcessingFailed("oops")
        val exception = error.toException()
        assertTrue(exception is PdfException)
        assertSame(error, (exception as PdfException).error)
        assertEquals("oops", exception.message)
    }

    // --- fromException mapping tests ---

    @Test
    fun `fromException maps not found message to FileNotFound`() {
        val e = RuntimeException("File not found at path")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.FileNotFound)
        assertEquals("FILE_NOT_FOUND", error.code)
    }

    @Test
    fun `fromException maps password message to InvalidPassword`() {
        val e = RuntimeException("Invalid password provided")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.InvalidPassword)
        assertEquals("INVALID_PASSWORD", error.code)
    }

    @Test
    fun `fromException maps corrupt message to PdfCorrupted`() {
        val e = RuntimeException("File is corrupt")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.PdfCorrupted)
    }

    @Test
    fun `fromException maps encrypt message to PdfEncrypted`() {
        val e = RuntimeException("File is encrypted")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.PdfEncrypted)
    }

    @Test
    fun `fromException maps IllegalArgumentException to InvalidInput`() {
        val e = IllegalArgumentException("bad dimension")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.InvalidInput)
        assertEquals("bad dimension", error.message)
    }

    @Test
    fun `fromException maps IllegalStateException to ProcessingFailed`() {
        val e = IllegalStateException("something broke")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.ProcessingFailed)
    }

    @Test
    fun `fromException maps unknown exception to Unknown`() {
        val e = RuntimeException("random error")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.Unknown)
        assertEquals("UNKNOWN_ERROR", error.code)
    }

    @Test
    fun `fromException case insensitive matching`() {
        val e = RuntimeException("FILE NOT FOUND in directory")
        val error = PdfError.fromException(e)
        assertTrue(error is PdfError.FileNotFound)
    }
}
