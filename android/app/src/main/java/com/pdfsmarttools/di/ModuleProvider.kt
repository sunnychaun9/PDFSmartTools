package com.pdfsmarttools.di

import android.content.Context
import com.pdfsmarttools.core.dispatcher.DefaultDispatcherProvider
import com.pdfsmarttools.core.dispatcher.DispatcherProvider
import com.pdfsmarttools.core.logging.AndroidPdfLogger
import com.pdfsmarttools.convert.di.ConversionServiceImpl
import com.pdfsmarttools.manipulate.compress.CompressPdfUseCase
import com.pdfsmarttools.manipulate.compress.PdfCompressorEngine
import com.pdfsmarttools.manipulate.di.ManipulateServiceImpl
import com.pdfsmarttools.manipulate.merge.MergePdfsUseCase
import com.pdfsmarttools.manipulate.merge.OrchestratedMergePdfsUseCase
import com.pdfsmarttools.manipulate.merge.PdfMergerEngine
import com.pdfsmarttools.manipulate.merge.StrictMergeEngine
import com.pdfsmarttools.manipulate.pagemanager.ManagePagesUseCase
import com.pdfsmarttools.manipulate.pagemanager.PdfPageManagerEngine
import com.pdfsmarttools.manipulate.protect.PdfProtectorEngine
import com.pdfsmarttools.manipulate.protect.ProtectPdfUseCase
import com.pdfsmarttools.manipulate.split.PdfSplitterEngine
import com.pdfsmarttools.manipulate.split.SplitPdfUseCase
import com.pdfsmarttools.manipulate.unlock.PdfUnlockEngine
import com.pdfsmarttools.manipulate.unlock.UnlockPdfUseCase
import com.pdfsmarttools.pdfcore.api.PdfConversionService
import com.pdfsmarttools.pdfcore.api.PdfManipulationService
import com.pdfsmarttools.pdfcore.api.PdfSigningService
import com.pdfsmarttools.pdfcore.engine.PdfEngineOrchestrator
import com.pdfsmarttools.sign.PdfSignerEngine
import com.pdfsmarttools.sign.SignPdfUseCase
import com.pdfsmarttools.sign.GetPageCountUseCase
import com.pdfsmarttools.sign.GetPageDimensionsUseCase
import com.pdfsmarttools.sign.di.SigningServiceImpl

/**
 * Central wiring of all feature module implementations.
 * Provides use cases and service implementations to bridge modules.
 */
object ModuleProvider {

    private val dispatchers: DispatcherProvider = DefaultDispatcherProvider()

    /** Shared orchestrator instance — all engines execute through this. */
    val orchestrator: PdfEngineOrchestrator = PdfEngineOrchestrator(AndroidPdfLogger())

    // --- Compression ---
    fun provideCompressPdfUseCase(): CompressPdfUseCase =
        CompressPdfUseCase(PdfCompressorEngine(), dispatchers)

    // --- Merge ---
    fun provideMergePdfsUseCase(): MergePdfsUseCase =
        MergePdfsUseCase(PdfMergerEngine(), dispatchers)

    /**
     * Orchestrated merge: uses [StrictMergeEngine] through [PdfEngineOrchestrator].
     * This is the contract-compliant path. Once all engines are migrated to the
     * PdfEngine<P, R> contract, the old provideMergePdfsUseCase() will be removed.
     */
    fun provideOrchestratedMergePdfsUseCase(): OrchestratedMergePdfsUseCase =
        OrchestratedMergePdfsUseCase(StrictMergeEngine(), orchestrator, dispatchers)

    // --- Split ---
    fun provideSplitPdfUseCase(): SplitPdfUseCase =
        SplitPdfUseCase(PdfSplitterEngine(), dispatchers)

    // --- Page Manager ---
    fun provideManagePagesUseCase(): ManagePagesUseCase =
        ManagePagesUseCase(PdfPageManagerEngine(), dispatchers)

    // --- Protect ---
    fun provideProtectPdfUseCase(): ProtectPdfUseCase =
        ProtectPdfUseCase(PdfProtectorEngine(), dispatchers)

    // --- Unlock ---
    fun provideUnlockPdfUseCase(): UnlockPdfUseCase =
        UnlockPdfUseCase(PdfUnlockEngine(), dispatchers)

    // --- Signing ---
    fun provideSignPdfUseCase(): SignPdfUseCase =
        SignPdfUseCase(PdfSignerEngine(), dispatchers)

    fun provideGetPageCountUseCase(): GetPageCountUseCase =
        GetPageCountUseCase(PdfSignerEngine(), dispatchers)

    fun provideGetPageDimensionsUseCase(): GetPageDimensionsUseCase =
        GetPageDimensionsUseCase(PdfSignerEngine(), dispatchers)

    // --- Service Interfaces ---
    fun provideManipulationService(context: Context): PdfManipulationService =
        ManipulateServiceImpl(context, dispatchers)

    fun provideSigningService(context: Context): PdfSigningService =
        SigningServiceImpl(context, dispatchers)

    fun provideConversionService(context: Context): PdfConversionService =
        ConversionServiceImpl(context, dispatchers)
}
