package com.pdfsmarttools.sign

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class GetPageCountUseCase(
    private val engine: PdfSignerEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(context: Context, pdfPath: String): PdfResult<Int> =
        withContext(dispatchers.io) {
            PdfResult.runCatching { engine.getPageCount(context, pdfPath) }
        }
}
