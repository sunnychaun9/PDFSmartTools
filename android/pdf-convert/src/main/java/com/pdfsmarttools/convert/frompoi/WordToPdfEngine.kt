package com.pdfsmarttools.convert.frompoi

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.util.Log
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

data class WordToPdfResult(
    val outputPath: String,
    val pageCount: Int,
    val fileSize: Long
)

/**
 * Engine extracted from WordToPdfModule.
 * Converts Word documents (DOC/DOCX) to PDF using Apache POI + Android PdfDocument.
 */
class WordToPdfEngine {

    companion object {
        private const val TAG = "WordToPdfEngine"
        private const val PAGE_WIDTH = 595 // A4
        private const val PAGE_HEIGHT = 842 // A4
        private const val MARGIN_LEFT = 72f
        private const val MARGIN_TOP = 72f
        private const val MARGIN_RIGHT = 72f
        private const val MARGIN_BOTTOM = 72f
        private const val LINE_SPACING = 1.4f
        private const val DEFAULT_FONT_SIZE = 12f
    }

    suspend fun convertToPdf(
        context: Context,
        inputPath: String,
        outputPath: String,
        isPro: Boolean,
        onProgress: (Int, String) -> Unit
    ): WordToPdfResult {
        onProgress(0, "Opening document...")

        val inputFile = File(inputPath)
        if (!inputFile.exists()) throw IllegalArgumentException("Word document not found")

        val isDocx = inputPath.lowercase().endsWith(".docx")
        val isDoc = inputPath.lowercase().endsWith(".doc")

        if (!isDocx && !isDoc) throw IllegalArgumentException("Unsupported format. Expected .doc or .docx")

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()
        val tempFile = File(outputFile.parent, ".tmp_${System.currentTimeMillis()}_${outputFile.name}")

        onProgress(20, "Reading document...")

        val paragraphs = mutableListOf<ParagraphInfo>()

        if (isDocx) {
            FileInputStream(inputFile).use { fis ->
                val doc = org.apache.poi.xwpf.usermodel.XWPFDocument(fis)
                for (para in doc.paragraphs) {
                    val text = sanitizeText(para.text ?: "")
                    if (text.isNotBlank()) {
                        val isBold = para.runs.any { it.isBold }
                        val isItalic = para.runs.any { it.isItalic }
                        paragraphs.add(ParagraphInfo(text, isBold, isItalic))
                    }
                }
                for (table in doc.tables) {
                    for (row in table.rows) {
                        val cells = row.tableCells.map { sanitizeText(it.text ?: "") }
                        paragraphs.add(ParagraphInfo(cells.joinToString("  |  "), false, false))
                    }
                }
                doc.close()
            }
        } else {
            FileInputStream(inputFile).use { fis ->
                val doc = org.apache.poi.hwpf.HWPFDocument(fis)
                val range = doc.range
                for (i in 0 until range.numParagraphs()) {
                    val para = range.getParagraph(i)
                    val text = sanitizeText(para.text() ?: "")
                    if (text.isNotBlank()) {
                        paragraphs.add(ParagraphInfo(text, para.isInTable, false))
                    }
                }
                doc.close()
            }
        }

        onProgress(50, "Creating PDF...")

        val pdfDocument = PdfDocument()
        var currentPageNum = 1
        var yPosition = MARGIN_TOP
        val usableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

        val textPaint = Paint().apply {
            color = Color.BLACK; textSize = DEFAULT_FONT_SIZE; isAntiAlias = true; typeface = Typeface.DEFAULT
        }

        var pageInfo = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, currentPageNum).create()
        var page = pdfDocument.startPage(pageInfo)
        var canvas = page.canvas

        try {
            for ((index, para) in paragraphs.withIndex()) {
                val paint = Paint(textPaint)
                if (para.isBold) paint.typeface = Typeface.DEFAULT_BOLD
                if (para.isItalic) paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.ITALIC)

                val lines = wrapText(para.text, paint, usableWidth)
                val lineHeight = DEFAULT_FONT_SIZE * LINE_SPACING

                for (line in lines) {
                    if (yPosition + lineHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
                        pdfDocument.finishPage(page)
                        currentPageNum++
                        pageInfo = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, currentPageNum).create()
                        page = pdfDocument.startPage(pageInfo)
                        canvas = page.canvas
                        yPosition = MARGIN_TOP
                    }
                    canvas.drawText(line, MARGIN_LEFT, yPosition, paint)
                    yPosition += lineHeight
                }
                yPosition += lineHeight * 0.3f

                if ((index + 1) % 50 == 0) {
                    onProgress(50 + ((index * 40) / paragraphs.size), "Writing page $currentPageNum...")
                }
            }

            pdfDocument.finishPage(page)

            onProgress(90, "Saving PDF...")
            FileOutputStream(tempFile).use { out -> pdfDocument.writeTo(out) }
        } finally {
            pdfDocument.close()
        }

        if (tempFile.exists()) {
            if (outputFile.exists()) outputFile.delete()
            if (!tempFile.renameTo(outputFile)) {
                tempFile.copyTo(outputFile, overwrite = true)
                tempFile.delete()
            }
        }

        onProgress(100, "Complete!")
        return WordToPdfResult(outputPath, currentPageNum, outputFile.length())
    }

    private fun wrapText(text: String, paint: Paint, maxWidth: Float): List<String> {
        val words = text.split(" ")
        val lines = mutableListOf<String>()
        var currentLine = StringBuilder()

        for (word in words) {
            val testLine = if (currentLine.isEmpty()) word else "$currentLine $word"
            if (paint.measureText(testLine) <= maxWidth) {
                currentLine = StringBuilder(testLine)
            } else {
                if (currentLine.isNotEmpty()) lines.add(currentLine.toString())
                currentLine = StringBuilder(word)
            }
        }
        if (currentLine.isNotEmpty()) lines.add(currentLine.toString())
        return lines.ifEmpty { listOf("") }
    }

    private fun sanitizeText(text: String): String {
        return text.map { c ->
            if (c.code in 32..126 || c.code in 160..255 || c == '\n' || c == '\r' || c == '\t') c else ' '
        }.joinToString("")
    }

    private data class ParagraphInfo(val text: String, val isBold: Boolean, val isItalic: Boolean)
}
