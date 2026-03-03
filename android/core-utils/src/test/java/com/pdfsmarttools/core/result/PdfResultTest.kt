package com.pdfsmarttools.core.result

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PdfResultTest {

    @Test
    fun `success wraps value correctly`() {
        val result = PdfResult.success("hello")
        assertTrue(result is PdfResult.Success)
        assertEquals("hello", (result as PdfResult.Success).data)
    }

    @Test
    fun `failure wraps error correctly`() {
        val error = PdfError.InvalidInput("bad input")
        val result = PdfResult.failure(error)
        assertTrue(result is PdfResult.Failure)
        assertEquals("INVALID_INPUT", (result as PdfResult.Failure).error.code)
    }

    @Test
    fun `getOrNull returns value on success`() {
        val result = PdfResult.success(42)
        assertEquals(42, result.getOrNull())
    }

    @Test
    fun `getOrNull returns null on failure`() {
        val result = PdfResult.failure(PdfError.Unknown("err"))
        assertNull(result.getOrNull())
    }

    @Test
    fun `getOrThrow returns value on success`() {
        val result = PdfResult.success("data")
        assertEquals("data", result.getOrThrow())
    }

    @Test(expected = PdfException::class)
    fun `getOrThrow throws on failure`() {
        val result = PdfResult.failure(PdfError.ProcessingFailed("oops"))
        result.getOrThrow()
    }

    @Test
    fun `map transforms success value`() {
        val result = PdfResult.success(5).map { it * 2 }
        assertEquals(10, result.getOrNull())
    }

    @Test
    fun `map passes through failure`() {
        val error = PdfError.FileNotFound("/test.pdf")
        val result: PdfResult<Int> = PdfResult.failure(error)
        val mapped = result.map { it * 2 }
        assertTrue(mapped is PdfResult.Failure)
        assertEquals("FILE_NOT_FOUND", (mapped as PdfResult.Failure).error.code)
    }

    @Test
    fun `flatMap chains success results`() = runTest {
        val result = PdfResult.success(5)
            .flatMap { PdfResult.success(it * 3) }
        assertEquals(15, result.getOrNull())
    }

    @Test
    fun `flatMap short-circuits on failure`() = runTest {
        val error = PdfError.Cancelled()
        val result: PdfResult<Int> = PdfResult.failure(error)
        val chained = result.flatMap { PdfResult.success(it * 3) }
        assertTrue(chained is PdfResult.Failure)
    }

    @Test
    fun `onSuccess is called for success`() {
        var captured = ""
        PdfResult.success("test").onSuccess { captured = it }
        assertEquals("test", captured)
    }

    @Test
    fun `onSuccess is not called for failure`() {
        var called = false
        PdfResult.failure(PdfError.Unknown("err"))
            .onSuccess { called = true }
        assertFalse(called)
    }

    @Test
    fun `onFailure is called for failure`() {
        var capturedCode = ""
        PdfResult.failure(PdfError.OutOfMemory("oom"))
            .onFailure { capturedCode = it.code }
        assertEquals("OUT_OF_MEMORY", capturedCode)
    }

    @Test
    fun `onFailure is not called for success`() {
        var called = false
        PdfResult.success("ok")
            .onFailure { called = true }
        assertFalse(called)
    }

    @Test
    fun `runCatching wraps successful block`() {
        val result = PdfResult.runCatching { 42 }
        assertEquals(42, result.getOrNull())
    }

    @Test
    fun `runCatching wraps exception as failure`() {
        val result = PdfResult.runCatching<String> {
            throw IllegalArgumentException("bad arg")
        }
        assertTrue(result is PdfResult.Failure)
        assertEquals("INVALID_INPUT", (result as PdfResult.Failure).error.code)
    }

    @Test
    fun `runCatching wraps OutOfMemoryError`() {
        val result = PdfResult.runCatching<String> {
            throw OutOfMemoryError("heap full")
        }
        assertTrue(result is PdfResult.Failure)
        assertEquals("OUT_OF_MEMORY", (result as PdfResult.Failure).error.code)
    }

    @Test
    fun `runCatching wraps SecurityException as encrypted`() {
        val result = PdfResult.runCatching<String> {
            throw SecurityException("access denied")
        }
        assertTrue(result is PdfResult.Failure)
        assertEquals("PDF_ENCRYPTED", (result as PdfResult.Failure).error.code)
    }

    @Test(expected = CancellationException::class)
    fun `runCatching rethrows CancellationException`() {
        PdfResult.runCatching<String> {
            throw CancellationException("cancelled")
        }
    }
}
