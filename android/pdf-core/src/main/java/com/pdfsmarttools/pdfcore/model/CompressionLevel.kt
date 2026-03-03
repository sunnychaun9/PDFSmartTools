package com.pdfsmarttools.pdfcore.model

enum class CompressionLevel(val quality: Int) {
    LOW(100),     // Re-save only, no image recompression
    MEDIUM(75),   // Image recompression at 75% JPEG quality
    HIGH(50)      // Aggressive image recompression at 50% JPEG quality
}
