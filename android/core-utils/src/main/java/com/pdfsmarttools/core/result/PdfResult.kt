package com.pdfsmarttools.core.result

import kotlinx.coroutines.CancellationException

sealed class PdfResult<out T> {
    data class Success<T>(val data: T) : PdfResult<T>()
    data class Failure(val error: PdfError) : PdfResult<Nothing>()

    fun <R> map(transform: (T) -> R): PdfResult<R> = when (this) {
        is Success -> Success(transform(data))
        is Failure -> this
    }

    suspend fun <R> flatMap(transform: suspend (T) -> PdfResult<R>): PdfResult<R> = when (this) {
        is Success -> transform(data)
        is Failure -> this
    }

    fun onSuccess(action: (T) -> Unit): PdfResult<T> {
        if (this is Success) action(data)
        return this
    }

    fun onFailure(action: (PdfError) -> Unit): PdfResult<T> {
        if (this is Failure) action(error)
        return this
    }

    fun getOrNull(): T? = when (this) {
        is Success -> data
        is Failure -> null
    }

    fun getOrThrow(): T = when (this) {
        is Success -> data
        is Failure -> throw error.toException()
    }

    companion object {
        fun <T> success(data: T): PdfResult<T> = Success(data)

        fun failure(error: PdfError): PdfResult<Nothing> = Failure(error)

        inline fun <T> runCatching(block: () -> T): PdfResult<T> {
            return try {
                success(block())
            } catch (e: CancellationException) {
                throw e // Never swallow coroutine cancellation
            } catch (e: OutOfMemoryError) {
                failure(PdfError.OutOfMemory("Not enough memory: ${e.message}", e))
            } catch (e: SecurityException) {
                failure(PdfError.PdfEncrypted("PDF is encrypted or corrupted: ${e.message}", e))
            } catch (e: Exception) {
                failure(PdfError.fromException(e))
            }
        }
    }
}
