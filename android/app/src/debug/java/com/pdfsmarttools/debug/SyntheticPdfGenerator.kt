package com.pdfsmarttools.debug

import android.content.Context
import android.util.Log
import com.pdfsmarttools.pdfcore.PdfBoxFacade
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import java.io.File
import java.util.UUID

/**
 * Creates synthetic PDF files for stress testing.
 * Uses PdfBoxFacade for initialization but creates documents directly
 * since PdfBoxFacade.createDocument() returns a raw PDDocument.
 */
object SyntheticPdfGenerator {

    private const val TAG = "SyntheticPdfGen"
    private const val LINES_PER_PAGE = 35
    private const val FONT_SIZE = 10f
    private const val LINE_HEIGHT = 16f
    private const val MARGIN = 50f

    private fun getTestDir(context: Context): File {
        val dir = File(context.cacheDir, "debug_stress_tests")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /**
     * Generate a synthetic PDF with the specified number of pages.
     * Each page contains [LINES_PER_PAGE] lines of text (~2-5KB per page).
     *
     * @return Pair of (file path, file size in bytes)
     */
    fun generate(context: Context, pageCount: Int, tag: String = "test"): Pair<String, Long> {
        PdfBoxFacade.ensureInitialized(context)

        val uuid = UUID.randomUUID().toString().take(8)
        val outputFile = File(getTestDir(context), "synthetic_${tag}_${pageCount}p_$uuid.pdf")

        val document = PdfBoxFacade.createDocument()
        try {
            for (pageIndex in 0 until pageCount) {
                val page = PDPage(PDRectangle.A4)
                document.addPage(page)

                val cs = PDPageContentStream(document, page)
                try {
                    cs.beginText()
                    cs.setFont(PDType1Font.HELVETICA, FONT_SIZE)
                    cs.newLineAtOffset(MARGIN, PDRectangle.A4.height - MARGIN)

                    for (line in 1..LINES_PER_PAGE) {
                        cs.showText("Page ${pageIndex + 1} Line $line - Stress test content for PDF engine validation. UUID=$uuid")
                        cs.newLineAtOffset(0f, -LINE_HEIGHT)
                    }

                    cs.endText()
                } finally {
                    cs.close()
                }
            }

            PdfBoxFacade.atomicSave(document, outputFile)
        } finally {
            document.close()
        }

        val fileSize = outputFile.length()
        Log.d(TAG, "Generated ${pageCount}p PDF: ${outputFile.absolutePath} (${fileSize / 1024}KB)")

        return Pair(outputFile.absolutePath, fileSize)
    }

    /**
     * Delete all synthetic test files.
     */
    fun cleanup(context: Context) {
        val dir = File(context.cacheDir, "debug_stress_tests")
        if (dir.exists()) {
            dir.deleteRecursively()
            Log.d(TAG, "Cleaned up test directory: ${dir.absolutePath}")
        }
    }
}
