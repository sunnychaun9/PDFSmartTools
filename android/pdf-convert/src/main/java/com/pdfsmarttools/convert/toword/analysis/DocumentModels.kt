package com.pdfsmarttools.convert.toword.analysis

/**
 * Data models for document structure analysis.
 *
 * These represent the intermediate representation between raw PDF text positions
 * and final DOCX elements. The pipeline is:
 *
 * PDF → TextBlock extraction → Structure detection → DocxElement generation → DOCX
 */

/** A positioned text fragment extracted from a PDF page. */
data class TextBlock(
    val text: String,
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
    val fontSize: Float,
    val fontName: String,
    val isBold: Boolean,
    val isItalic: Boolean,
    val pageIndex: Int
)

/** An image found on a PDF page with its bounding box. */
data class ImageBlock(
    val imageBytes: ByteArray,
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
    val pageIndex: Int,
    val format: String = "png"
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ImageBlock) return false
        return pageIndex == other.pageIndex && x == other.x && y == other.y
    }
    override fun hashCode() = 31 * pageIndex + x.hashCode() + y.hashCode()
}

/** The type of structural element detected. */
enum class StructureType {
    HEADING1, HEADING2, HEADING3,
    PARAGRAPH,
    LIST_ITEM,
    TABLE_CELL,
    IMAGE,
    HEADER, FOOTER,
    FOOTNOTE,
    PAGE_NUMBER
}

/** A detected structural element on a page. */
data class StructuralElement(
    val type: StructureType,
    val text: String,
    val blocks: List<TextBlock>,
    val pageIndex: Int,
    val y: Float,
    val isBold: Boolean = false,
    val isItalic: Boolean = false,
    val fontSize: Float = 11f,
    val indentLevel: Int = 0
)

/** A reconstructed table from coordinate clustering. */
data class DetectedTable(
    val rows: List<List<String>>,
    val columnCount: Int,
    val pageIndex: Int,
    val y: Float,
    val startBlockIndex: Int,
    val endBlockIndex: Int
)

/** Full analysis result for a single page. */
data class PageAnalysis(
    val pageIndex: Int,
    val pageWidth: Float,
    val pageHeight: Float,
    val textBlocks: List<TextBlock>,
    val elements: List<StructuralElement>,
    val tables: List<DetectedTable>,
    val images: List<ImageBlock>,
    val averageFontSize: Float,
    val isScanned: Boolean
)

/** Enhanced conversion result with detailed metrics. */
data class EnhancedConversionResult(
    val outputPath: String,
    val pageCount: Int,
    val pagesProcessed: Int,
    val paragraphsDetected: Int,
    val headingsDetected: Int,
    val tablesDetected: Int,
    val imagesExtracted: Int,
    val ocrUsed: Boolean,
    val processingTimeMs: Long,
    val wordCount: Int,
    val fileSize: Long
)
