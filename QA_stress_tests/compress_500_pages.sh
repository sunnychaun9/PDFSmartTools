#!/bin/bash
# Stress test: Compress a 500-page document at each compression level
# Measures: time per level, output size, peak memory

set -e
PACKAGE="com.pdfsmarttools"

echo "=== STRESS TEST: 500-Page Compression ==="
echo "Date: $(date)"
echo ""

for LEVEL in "LOW" "MEDIUM" "HIGH"; do
  echo "--- Compression Level: $LEVEL ---"
  adb logcat -c

  START=$(date +%s)

  echo ">> Open the app, select the 500-page PDF, compress at $LEVEL level"
  echo ">> Press Enter when done..."
  read -r

  END=$(date +%s)
  DURATION=$((END - START))

  echo "Duration: ${DURATION}s"

  # Check for errors
  ERRORS=$(adb logcat -d | grep -c "PdfCompressorEngine.*ERROR\|OutOfMemoryError" || true)
  echo "Errors detected: $ERRORS"

  # Memory snapshot
  adb shell dumpsys meminfo $PACKAGE 2>/dev/null | grep "TOTAL PSS" | head -1

  echo ""
done

echo "=== TEST COMPLETE ==="
