package com.pdfsmarttools.scan

object EdgeProcessor {
  init {
    try {
      System.loadLibrary("edge_processor")
    } catch (e: UnsatisfiedLinkError) {
      // library may be missing in debug if native build not configured yet
    }
  }

  external fun detectDocumentContour(imagePath: String): FloatArray?
  external fun enhanceAndWarp(inputPath: String, outputPath: String, polygon: FloatArray): Boolean
}
