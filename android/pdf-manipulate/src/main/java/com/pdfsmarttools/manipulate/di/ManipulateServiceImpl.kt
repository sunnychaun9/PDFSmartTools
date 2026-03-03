package com.pdfsmarttools.manipulate.di

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.progress.ProgressReporter
import com.pdfsmarttools.core.result.PdfResult
import com.pdfsmarttools.manipulate.compress.CompressPdfUseCase
import com.pdfsmarttools.manipulate.compress.PdfCompressorEngine
import com.pdfsmarttools.manipulate.merge.MergePdfsUseCase
import com.pdfsmarttools.manipulate.merge.PdfMergerEngine
import com.pdfsmarttools.manipulate.pagemanager.ManagePagesUseCase
import com.pdfsmarttools.manipulate.pagemanager.PdfPageManagerEngine
import com.pdfsmarttools.manipulate.protect.PdfProtectorEngine
import com.pdfsmarttools.manipulate.protect.ProtectPdfUseCase
import com.pdfsmarttools.manipulate.split.PdfSplitterEngine
import com.pdfsmarttools.manipulate.split.SplitPdfUseCase
import com.pdfsmarttools.manipulate.unlock.PdfUnlockEngine
import com.pdfsmarttools.manipulate.unlock.UnlockPdfUseCase
import com.pdfsmarttools.pdfcore.api.PdfManipulationService
import com.pdfsmarttools.pdfcore.model.PageRange
import kotlinx.coroutines.withContext

class ManipulateServiceImpl(
    private val context: Context,
    private val dispatchers: DispatcherProvider
) : PdfManipulationService {

    private val compressUseCase = CompressPdfUseCase(PdfCompressorEngine(), dispatchers)
    private val mergeUseCase = MergePdfsUseCase(PdfMergerEngine(), dispatchers)
    private val splitUseCase = SplitPdfUseCase(PdfSplitterEngine(), dispatchers)
    private val managePagesUseCase = ManagePagesUseCase(PdfPageManagerEngine(), dispatchers)
    private val protectUseCase = ProtectPdfUseCase(PdfProtectorEngine(), dispatchers)
    private val unlockUseCase = UnlockPdfUseCase(PdfUnlockEngine(), dispatchers)

    override suspend fun compressPdf(
        options: PdfManipulationService.CompressionOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfManipulationService.CompressionResult> {
        return compressUseCase(context, options.inputPath, options.outputPath, options.level, options.isPro, progressReporter)
            .map { PdfManipulationService.CompressionResult(it.outputPath, it.originalSize, it.compressedSize, it.compressionRatio, it.pageCount) }
    }

    override suspend fun mergePdfs(
        options: PdfManipulationService.MergeOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfManipulationService.MergeResult> {
        return mergeUseCase(context, options.inputPaths, options.outputPath, options.isPro, progressReporter)
            .map { PdfManipulationService.MergeResult(it.outputPath, it.totalPages, it.fileCount, it.outputSize) }
    }

    override suspend fun splitPdf(
        options: PdfManipulationService.SplitOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfManipulationService.SplitResult> {
        val ranges = options.pageRanges.map { Pair(it.start, it.end) }
        return splitUseCase(context, options.inputPath, options.outputDir, options.baseName, ranges, options.isPro, progressReporter)
            .map { result ->
                PdfManipulationService.SplitResult(
                    outputFiles = result.outputFiles.map { PdfManipulationService.SplitOutputFile(it.path, it.fileName, it.range, it.pageCount, it.fileSize) },
                    totalFilesCreated = result.totalFilesCreated,
                    sourcePageCount = result.sourcePageCount
                )
            }
    }

    override suspend fun extractPage(
        options: PdfManipulationService.ExtractPageOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfManipulationService.ExtractResult> {
        val splitterEngine = PdfSplitterEngine()
        return withContext(dispatchers.io) {
            PdfResult.runCatching {
                splitterEngine.extractPage(context, options.inputPath, options.outputPath, options.pageNumber, options.isPro) { progress, status ->
                    progressReporter.onStage(progress, status)
                }
            }.map { PdfManipulationService.ExtractResult(it.outputPath, it.pageNumber, it.fileSize) }
        }
    }

    override suspend fun protectPdf(
        options: PdfManipulationService.ProtectOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfManipulationService.ProtectResult> {
        return protectUseCase(context, options.inputPath, options.outputPath, options.password, progressReporter)
            .map { PdfManipulationService.ProtectResult(it.outputPath, it.originalSize, it.protectedSize, it.pageCount) }
    }

    override suspend fun unlockPdf(
        options: PdfManipulationService.UnlockOptions,
        progressReporter: ProgressReporter
    ): PdfResult<PdfManipulationService.UnlockResult> {
        return unlockUseCase(context, options.inputPath, options.outputPath, options.password, progressReporter)
            .map { PdfManipulationService.UnlockResult(it.outputPath, it.originalSize, it.unlockedSize, it.pageCount) }
    }

    override suspend fun getPageInfo(inputPath: String): PdfResult<List<PdfManipulationService.PageInfo>> {
        return managePagesUseCase.getPageInfo(inputPath)
            .map { info -> info.pages.map { PdfManipulationService.PageInfo(it.index, it.width, it.height) } }
    }

    override suspend fun getPageCount(inputPath: String): PdfResult<Int> {
        return managePagesUseCase.getPageInfo(inputPath).map { it.pageCount }
    }
}
