package com.pdfsmarttools.manipulate.compress

import android.graphics.Bitmap
import android.content.Context
import android.util.Log
import com.pdfsmarttools.core.memory.MemoryBudget
import com.pdfsmarttools.core.parallel.ParallelPageProcessor
import com.pdfsmarttools.pdfcore.OperationMetrics
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.pdfsmarttools.pdfcore.model.CompressionLevel
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.coroutineContext

private data class ImageWorkUnit(
    val pageIndex: Int,
    val imageName: COSName,
    val bitmap: Bitmap,
    val quality: Float
)

private data class CompressedImage(
    val pageIndex: Int,
    val imageName: COSName,
    val jpegBytes: ByteArray
)

data class CompressionResult(
    val outputPath: String,
    val originalSize: Long,
    val compressedSize: Long,
    val compressionRatio: Double,
    val pageCount: Int
)

class PdfCompressorEngine {

    companion object {
        private const val TAG = "PdfCompressorEngine"
        private const val MAX_RECOMMENDED_FILE_SIZE = 100L * 1024 * 1024
        private const val CHUNKED_THRESHOLD = 100L * 1024 * 1024
        private const val CHUNK_SIZE = 50
        private const val MIN_IMAGE_DIMENSION = 64
        private const val DEFAULT_BATCH_SIZE = 10
        private const val MIN_MEMORY_FOR_EXTRACTION = 50L * 1024 * 1024
        private const val PARALLEL_THRESHOLD = 3
    }

    suspend fun compress(
        context: Context,
        inputPath: String,
        outputPath: String,
        level: CompressionLevel,
        isPro: Boolean = false,
        onProgress: (progress: Int, currentPage: Int, totalPages: Int) -> Unit
    ): CompressionResult {
        val startTime = System.currentTimeMillis()
        PdfBoxFacade.ensureInitialized(context)

        val fileResolver = com.pdfsmarttools.pdfcore.DefaultFileResolver(context)
        val inputFile = fileResolver.resolveInputFile(inputPath, "compress")
        val isCacheFile = fileResolver.isCacheFile(inputPath)

        try {
            if (!inputFile.exists()) {
                throw IllegalArgumentException("Input file not found: $inputPath")
            }

            val originalSize = inputFile.length()

            if (originalSize > MAX_RECOMMENDED_FILE_SIZE) {
                Log.w(TAG, "Processing large file: ${originalSize / (1024 * 1024)}MB - may take longer")
            }

            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()

            if (originalSize > CHUNKED_THRESHOLD && level != CompressionLevel.LOW) {
                return compressChunked(context, inputFile, outputFile, level, isPro, originalSize, startTime, onProgress)
            }

            PdfBoxFacade.loadDocument(inputFile).use { document ->
                val pageCount = document.numberOfPages

                if (pageCount == 0) {
                    throw IllegalArgumentException("PDF has no pages")
                }

                if (level != CompressionLevel.LOW) {
                    val jpegQuality = level.quality / 100f
                    val totalImages = countTotalImages(document, pageCount)

                    if (totalImages <= PARALLEL_THRESHOLD) {
                        compressSequential(document, pageCount, jpegQuality, onProgress)
                    } else {
                        compressParallel(document, pageCount, jpegQuality, onProgress)
                    }
                } else {
                    for (i in 0 until pageCount) {
                        val progress = ((i + 1) * 80) / pageCount
                        onProgress(progress, i + 1, pageCount)
                    }
                }

                if (!isPro) {
                    for (i in 0 until pageCount) {
                        coroutineContext.ensureActive()
                        PdfBoxFacade.addWatermarkToPage(document, document.getPage(i))
                    }
                }

                onProgress(90, pageCount, pageCount)
                PdfBoxFacade.atomicSave(document, outputFile)
                onProgress(100, pageCount, pageCount)

                val validation = PdfBoxFacade.validateOutput(outputFile, pageCount)
                if (!validation.valid) {
                    throw IllegalStateException("Output validation failed: ${validation.errorMessage}")
                }

                val compressedSize = outputFile.length()
                val compressionRatio = if (originalSize > 0) {
                    1.0 - (compressedSize.toDouble() / originalSize.toDouble())
                } else 0.0

                PdfBoxFacade.logMetrics(OperationMetrics(
                    operationName = "compress_${level.name}",
                    fileCount = 1, pageCount = pageCount,
                    inputSizeBytes = originalSize, outputSizeBytes = compressedSize,
                    durationMs = System.currentTimeMillis() - startTime
                ))

                return CompressionResult(outputFile.absolutePath, originalSize, compressedSize, compressionRatio, pageCount)
            }
        } catch (e: CancellationException) {
            File(outputPath).delete(); throw e
        } catch (e: OutOfMemoryError) {
            File(outputPath).delete(); throw IllegalStateException("Not enough memory to compress PDF", e)
        } catch (e: SecurityException) {
            File(outputPath).delete(); throw IllegalArgumentException("PDF file is corrupted or password-protected", e)
        } catch (e: Exception) {
            File(outputPath).delete(); throw e
        } finally {
            if (isCacheFile) inputFile.delete()
        }
    }

    private fun countTotalImages(document: PDDocument, pageCount: Int): Int {
        var count = 0
        for (i in 0 until pageCount) {
            val resources = document.getPage(i).resources ?: continue
            try {
                for (name in resources.xObjectNames) {
                    try {
                        val xObj = resources.getXObject(name)
                        if (xObj is PDImageXObject && xObj.width >= MIN_IMAGE_DIMENSION && xObj.height >= MIN_IMAGE_DIMENSION) count++
                    } catch (_: Exception) {}
                }
            } catch (_: Exception) {}
        }
        return count
    }

    private suspend fun compressSequential(document: PDDocument, pageCount: Int, jpegQuality: Float, onProgress: (Int, Int, Int) -> Unit) {
        for (i in 0 until pageCount) {
            coroutineContext.ensureActive()
            recompressPageImages(document, document.getPage(i), jpegQuality)
            if ((i + 1) % 5 == 0) ParallelPageProcessor.checkMemoryAndGc(0.80, "CompressSeq")
            onProgress(((i + 1) * 80) / pageCount, i + 1, pageCount)
        }
    }

    private suspend fun compressParallel(document: PDDocument, pageCount: Int, jpegQuality: Float, onProgress: (Int, Int, Int) -> Unit) {
        val concurrency = ParallelPageProcessor.defaultConcurrency()
        var batchStart = 0
        while (batchStart < pageCount) {
            coroutineContext.ensureActive()
            val batchEnd = calculateBatchEnd(batchStart, pageCount)
            val workUnits = mutableListOf<ImageWorkUnit>()
            for (i in batchStart until batchEnd) {
                coroutineContext.ensureActive()
                workUnits.addAll(extractPageImages(document.getPage(i), i, jpegQuality))
            }
            if (workUnits.isNotEmpty()) {
                val compressed = parallelCompress(workUnits, concurrency) { completedInBatch ->
                    val extractionDone = (batchEnd.toFloat() / pageCount) * 20
                    val compressionProgress = (completedInBatch.toFloat() / workUnits.size) * 50 * ((batchEnd - batchStart).toFloat() / pageCount)
                    onProgress((extractionDone + compressionProgress).toInt().coerceAtMost(70), batchEnd, pageCount)
                }
                applyCompressedImages(document, compressed)
            }
            onProgress(((batchEnd * 70) / pageCount).coerceAtMost(70), batchEnd, pageCount)
            ParallelPageProcessor.checkMemoryAndGc(0.80, "CompressBatch")
            batchStart = batchEnd
        }
        onProgress(80, pageCount, pageCount)
    }

    private fun calculateBatchEnd(batchStart: Int, pageCount: Int): Int {
        if (MemoryBudget.availableBytes() < MIN_MEMORY_FOR_EXTRACTION) return (batchStart + 3).coerceAtMost(pageCount)
        return (batchStart + DEFAULT_BATCH_SIZE).coerceAtMost(pageCount)
    }

    private fun extractPageImages(page: PDPage, pageIndex: Int, quality: Float): List<ImageWorkUnit> {
        val resources = page.resources ?: return emptyList()
        val units = mutableListOf<ImageWorkUnit>()
        try {
            for (name in resources.xObjectNames) {
                try {
                    val xObj = resources.getXObject(name)
                    if (xObj is PDImageXObject && xObj.width >= MIN_IMAGE_DIMENSION && xObj.height >= MIN_IMAGE_DIMENSION) {
                        xObj.image?.let { units.add(ImageWorkUnit(pageIndex, name, it, quality)) }
                    }
                } catch (e: Exception) { Log.w(TAG, "Skipping image $name during extraction: ${e.message}") }
            }
        } catch (e: Exception) { Log.w(TAG, "Skipping page $pageIndex during extraction: ${e.message}") }
        return units
    }

    private suspend fun parallelCompress(units: List<ImageWorkUnit>, concurrency: Int, onProgress: (Int) -> Unit): List<CompressedImage> = coroutineScope {
        val semaphore = Semaphore(concurrency)
        val completed = AtomicInteger(0)
        units.map { unit ->
            async(Dispatchers.Default) {
                semaphore.withPermit {
                    try {
                        val baos = ByteArrayOutputStream()
                        unit.bitmap.compress(Bitmap.CompressFormat.JPEG, (unit.quality * 100).toInt(), baos)
                        unit.bitmap.recycle()
                        onProgress(completed.incrementAndGet())
                        CompressedImage(unit.pageIndex, unit.imageName, baos.toByteArray())
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to compress image ${unit.imageName}: ${e.message}")
                        unit.bitmap.recycle()
                        null
                    }
                }
            }
        }.awaitAll().filterNotNull()
    }

    private fun applyCompressedImages(document: PDDocument, results: List<CompressedImage>) {
        for ((pageIndex, images) in results.groupBy { it.pageIndex }) {
            val resources = document.getPage(pageIndex).resources ?: continue
            for (compressed in images) {
                try {
                    val newImage = JPEGFactory.createFromStream(document, ByteArrayInputStream(compressed.jpegBytes))
                    resources.put(compressed.imageName, newImage)
                } catch (e: Exception) { Log.w(TAG, "Failed to apply compressed image ${compressed.imageName}: ${e.message}") }
            }
        }
    }

    private fun recompressPageImages(document: PDDocument, page: PDPage, jpegQuality: Float) {
        val resources = page.resources ?: return
        try {
            for (name in resources.xObjectNames) {
                try {
                    val xObj = resources.getXObject(name)
                    if (xObj is PDImageXObject && xObj.width >= MIN_IMAGE_DIMENSION && xObj.height >= MIN_IMAGE_DIMENSION) {
                        val bitmap = xObj.image
                        if (bitmap != null) {
                            try {
                                resources.put(name, JPEGFactory.createFromImage(document, bitmap, jpegQuality))
                            } finally { bitmap.recycle() }
                        }
                    }
                } catch (e: Exception) { Log.w(TAG, "Skipping image $name: ${e.message}") }
            }
        } catch (e: Exception) { Log.w(TAG, "Skipping image recompression for page: ${e.message}") }
    }

    private suspend fun compressChunked(
        context: Context, inputFile: File, outputFile: File, level: CompressionLevel, isPro: Boolean,
        originalSize: Long, startTime: Long, onProgress: (Int, Int, Int) -> Unit
    ): CompressionResult {
        val cacheDir = File(context.cacheDir, "compress_chunks_${System.currentTimeMillis()}")
        cacheDir.mkdirs()
        val chunkFiles = mutableListOf<File>()
        try {
            val totalPages: Int
            PdfBoxFacade.loadDocumentTempFileOnly(inputFile).use { doc -> totalPages = doc.numberOfPages }
            if (totalPages == 0) throw IllegalArgumentException("PDF has no pages")

            val jpegQuality = level.quality / 100f
            val totalChunks = (totalPages + CHUNK_SIZE - 1) / CHUNK_SIZE
            var processedPages = 0

            for (chunkIndex in 0 until totalChunks) {
                coroutineContext.ensureActive()
                val chunkStart = chunkIndex * CHUNK_SIZE
                val chunkEnd = minOf(chunkStart + CHUNK_SIZE, totalPages)
                val chunkFile = File(cacheDir, "chunk_$chunkIndex.pdf")
                chunkFiles.add(chunkFile)

                PdfBoxFacade.loadDocument(inputFile).use { sourceDoc ->
                    PdfBoxFacade.createDocument().use { chunkDoc ->
                        for (pageIndex in chunkStart until chunkEnd) {
                            coroutineContext.ensureActive()
                            val imported = chunkDoc.importPage(sourceDoc.getPage(pageIndex))
                            recompressPageImages(chunkDoc, imported, jpegQuality)
                            if (!isPro) PdfBoxFacade.addWatermarkToPage(chunkDoc, imported)
                            processedPages++
                            onProgress(((processedPages * 80) / totalPages).coerceAtMost(80), processedPages, totalPages)
                        }
                        chunkDoc.save(chunkFile)
                    }
                }
                System.gc()
                Log.d(TAG, "Chunk $chunkIndex compressed: ${chunkFile.length() / 1024}KB, heap: ${MemoryBudget.heapUsagePercent()}%")
            }

            onProgress(85, totalPages, totalPages)
            PdfBoxFacade.createDocument().use { mergedDoc ->
                for (chunkFile in chunkFiles) {
                    coroutineContext.ensureActive()
                    PdfBoxFacade.loadDocument(chunkFile).use { chunkDoc ->
                        for (i in 0 until chunkDoc.numberOfPages) mergedDoc.importPage(chunkDoc.getPage(i))
                    }
                }
                onProgress(95, totalPages, totalPages)
                PdfBoxFacade.atomicSave(mergedDoc, outputFile)
            }

            onProgress(100, totalPages, totalPages)
            val validation = PdfBoxFacade.validateOutput(outputFile, totalPages)
            if (!validation.valid) throw IllegalStateException("Output validation failed: ${validation.errorMessage}")

            val compressedSize = outputFile.length()
            PdfBoxFacade.logMetrics(OperationMetrics("compress_chunked_${level.name}", 1, totalPages, originalSize, compressedSize, System.currentTimeMillis() - startTime))
            return CompressionResult(outputFile.absolutePath, originalSize, compressedSize,
                if (originalSize > 0) 1.0 - (compressedSize.toDouble() / originalSize.toDouble()) else 0.0, totalPages)
        } finally {
            chunkFiles.forEach { it.delete() }
            cacheDir.delete()
        }
    }
}
