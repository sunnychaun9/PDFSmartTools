package com.pdfsmarttools.sign

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.result.PdfResult
import kotlinx.coroutines.withContext

class GetPageDimensionsUseCase(
    private val engine: PdfSignerEngine,
    private val dispatchers: DispatcherProvider
) {
    suspend operator fun invoke(context: Context, pdfPath: String, pageNumber: Int): PdfResult<Pair<Int, Int>> =
        withContext(dispatchers.io) {
            PdfResult.runCatching { engine.getPageDimensions(context, pdfPath, pageNumber) }
        }
}
