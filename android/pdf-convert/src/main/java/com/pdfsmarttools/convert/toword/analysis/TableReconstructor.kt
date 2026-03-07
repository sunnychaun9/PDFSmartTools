package com.pdfsmarttools.convert.toword.analysis

import android.util.Log

/**
 * Reconstructs tables from coordinate-clustered text blocks.
 *
 * Algorithm:
 * 1. Group text blocks by Y proximity → candidate rows
 * 2. Identify consistent X alignments across rows → columns
 * 3. When a rectangular grid pattern is detected (≥2 rows, ≥2 columns) → table
 *
 * Handles:
 * - Uneven row heights
 * - Numeric column alignment
 * - Variable column widths
 */
class TableReconstructor {

    companion object {
        private const val TAG = "TableReconstructor"

        /** Y-coordinate tolerance for grouping blocks into the same row (in points). */
        private const val ROW_Y_TOLERANCE = 4.0f

        /** Minimum number of rows to consider a table. */
        private const val MIN_TABLE_ROWS = 2

        /** Minimum number of columns to consider a table. */
        private const val MIN_TABLE_COLS = 2

        /** X-coordinate tolerance for column alignment (in points). */
        private const val COLUMN_X_TOLERANCE = 8.0f

        /** Minimum blocks required to attempt table detection. */
        private const val MIN_BLOCKS_FOR_TABLE = 4
    }

    /**
     * Detect tables in a page's text blocks.
     *
     * @param blocks All text blocks on the page, sorted by Y then X.
     * @param pageIndex The page index for metadata.
     * @return Detected tables and the set of block indices consumed by tables.
     */
    fun detectTables(blocks: List<TextBlock>, pageIndex: Int): Pair<List<DetectedTable>, Set<Int>> {
        if (blocks.size < MIN_BLOCKS_FOR_TABLE) return Pair(emptyList(), emptySet())

        val tables = mutableListOf<DetectedTable>()
        val consumedIndices = mutableSetOf<Int>()

        // Group blocks into rows by Y proximity
        val rows = groupIntoRows(blocks)

        // Find sequences of rows with consistent column count
        var tableStart = -1
        var tableColCount = 0
        val tableRows = mutableListOf<List<IndexedBlock>>()

        for ((rowIndex, row) in rows.withIndex()) {
            val colCount = row.size

            if (colCount >= MIN_TABLE_COLS) {
                if (tableStart == -1) {
                    tableStart = rowIndex
                    tableColCount = colCount
                    tableRows.clear()
                    tableRows.add(row)
                } else if (isCompatibleColumnCount(colCount, tableColCount)) {
                    tableRows.add(row)
                } else {
                    // End current table candidate
                    emitTable(tableRows, tableColCount, pageIndex, blocks, tables, consumedIndices)
                    // Start new candidate
                    tableStart = rowIndex
                    tableColCount = colCount
                    tableRows.clear()
                    tableRows.add(row)
                }
            } else {
                if (tableRows.size >= MIN_TABLE_ROWS) {
                    emitTable(tableRows, tableColCount, pageIndex, blocks, tables, consumedIndices)
                }
                tableStart = -1
                tableRows.clear()
            }
        }

        // Flush last candidate
        if (tableRows.size >= MIN_TABLE_ROWS) {
            emitTable(tableRows, tableColCount, pageIndex, blocks, tables, consumedIndices)
        }

        if (tables.isNotEmpty()) {
            Log.d(TAG, "Detected ${tables.size} table(s) on page $pageIndex")
        }

        return Pair(tables, consumedIndices)
    }

    /** Group blocks into rows by Y proximity. */
    private fun groupIntoRows(blocks: List<TextBlock>): List<List<IndexedBlock>> {
        if (blocks.isEmpty()) return emptyList()

        val rows = mutableListOf<MutableList<IndexedBlock>>()
        var currentRow = mutableListOf<IndexedBlock>()
        var currentY = blocks[0].y

        for ((index, block) in blocks.withIndex()) {
            if (currentRow.isEmpty() || Math.abs(block.y - currentY) <= ROW_Y_TOLERANCE) {
                currentRow.add(IndexedBlock(index, block))
                // Update Y to running average
                currentY = currentRow.map { it.block.y }.average().toFloat()
            } else {
                rows.add(currentRow.sortedBy { it.block.x }.toMutableList())
                currentRow = mutableListOf(IndexedBlock(index, block))
                currentY = block.y
            }
        }

        if (currentRow.isNotEmpty()) {
            rows.add(currentRow.sortedBy { it.block.x }.toMutableList())
        }

        return rows
    }

    /** Allow ±1 column difference for uneven rows. */
    private fun isCompatibleColumnCount(count: Int, expected: Int): Boolean {
        return Math.abs(count - expected) <= 1 && count >= MIN_TABLE_COLS
    }

    /** Validate column alignment consistency across rows and emit a table. */
    private fun emitTable(
        rows: List<List<IndexedBlock>>,
        colCount: Int,
        pageIndex: Int,
        allBlocks: List<TextBlock>,
        tables: MutableList<DetectedTable>,
        consumed: MutableSet<Int>
    ) {
        if (rows.size < MIN_TABLE_ROWS) return

        // Verify column alignment: X positions should be consistent across rows
        if (!hasConsistentColumnAlignment(rows)) return

        val tableData = rows.map { row ->
            // Pad to colCount if needed
            val cells = row.map { it.block.text.trim() }.toMutableList()
            while (cells.size < colCount) cells.add("")
            cells.take(colCount)
        }

        val allIndices = rows.flatMap { row -> row.map { it.index } }
        val firstBlockIndex = allIndices.min()
        val lastBlockIndex = allIndices.max()

        tables.add(DetectedTable(
            rows = tableData,
            columnCount = colCount,
            pageIndex = pageIndex,
            y = rows.first().first().block.y,
            startBlockIndex = firstBlockIndex,
            endBlockIndex = lastBlockIndex
        ))

        consumed.addAll(allIndices)
    }

    /**
     * Check if X positions across rows show consistent column alignment.
     *
     * For each column position, the X values across rows should cluster
     * within [COLUMN_X_TOLERANCE].
     */
    private fun hasConsistentColumnAlignment(rows: List<List<IndexedBlock>>): Boolean {
        if (rows.size < 2) return false

        // Use the row with the most columns as reference
        val refRow = rows.maxByOrNull { it.size } ?: return false
        val refXPositions = refRow.map { it.block.x }

        var alignedRows = 0
        for (row in rows) {
            if (row.size < MIN_TABLE_COLS) continue

            var matched = 0
            for (block in row) {
                if (refXPositions.any { Math.abs(it - block.block.x) <= COLUMN_X_TOLERANCE }) {
                    matched++
                }
            }
            // At least half the columns should align
            if (matched >= row.size / 2) alignedRows++
        }

        // At least 60% of rows should show alignment
        return alignedRows.toFloat() / rows.size >= 0.6f
    }

    private data class IndexedBlock(val index: Int, val block: TextBlock)
}
