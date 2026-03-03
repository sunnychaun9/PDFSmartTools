package com.pdfsmarttools.convert.toword

import android.content.Context
import android.util.Log
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.apache.poi.xwpf.usermodel.XWPFDocument
import java.io.File
import java.io.FileOutputStream

data class PdfToWordResult(
    val outputPath: String,
    val pageCount: Int,
    val wordCount: Int,
    val fileSize: Long
)

class PdfToWordEngine {

    companion object {
        private const val TAG = "PdfToWordEngine"
    }

    suspend fun convertToDocx(
        context: Context,
        inputPath: String,
        outputPath: String,
        extractImages: Boolean,
        isPro: Boolean,
        onProgress: (Int, String) -> Unit
    ): PdfToWordResult {
        PdfBoxFacade.ensureInitialized(context)
        onProgress(0, "Opening PDF...")

        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("PDF file not found")

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        val tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")

        PdfBoxFacade.loadDocument(inputFile).use { document ->
            val totalPages = document.numberOfPages
            if (totalPages == 0) throw IllegalArgumentException("PDF has no pages")

            val maxPages = if (!isPro) minOf(totalPages, 5) else totalPages
            var totalWordCount = 0

            onProgress(10, "Extracting text...")

            val docx = XWPFDocument()
            try {
                val stripper = PDFTextStripper()

                for (pageNum in 1..maxPages) {
                    onProgress(10 + ((pageNum * 70) / maxPages), "Processing page $pageNum of $maxPages...")
                    stripper.startPage = pageNum
                    stripper.endPage = pageNum
                    val pageText = stripper.getText(document)

                    if (pageNum > 1) {
                        val br = docx.createParagraph()
                        br.isPageBreak = true
                    }

                    val lines = pageText.split("\n")
                    for (line in lines) {
                        val trimmed = line.trim()
                        if (trimmed.isEmpty()) continue
                        val paragraph = docx.createParagraph()
                        val run = paragraph.createRun()
                        run.setText(trimmed)
                        totalWordCount += trimmed.split("\\s+".toRegex()).size
                    }
                }

                if (!isPro && totalPages > 5) {
                    val notice = docx.createParagraph()
                    val run = notice.createRun()
                    run.isBold = true
                    run.setText("[PDF Smart Tools - Free Version: Only first 5 pages converted. Upgrade to Pro for full conversion.]")
                }

                onProgress(85, "Saving document...")
                FileOutputStream(tempFile).use { out -> docx.write(out) }
            } finally {
                docx.close()
            }

            // Atomic rename
            if (tempFile.exists()) {
                if (outputFile.exists()) outputFile.delete()
                if (!tempFile.renameTo(outputFile)) {
                    tempFile.copyTo(outputFile, overwrite = true)
                    tempFile.delete()
                }
            }

            onProgress(100, "Complete!")
            return PdfToWordResult(outputPath, maxPages, totalWordCount, outputFile.length())
        }
    }
}
