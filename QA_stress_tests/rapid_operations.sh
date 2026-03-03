#!/bin/bash
# Stress test: 10 operations in rapid sequence without app restart
# Tests memory cleanup and leak detection

set -e
PACKAGE="com.pdfsmarttools"

echo "=== STRESS TEST: Rapid Sequential Operations ==="
echo "Date: $(date)"
echo ""

# Baseline memory
echo "Baseline memory:"
adb shell dumpsys meminfo $PACKAGE 2>/dev/null | grep "TOTAL PSS" | head -1
echo ""

OPERATIONS=(
  "1. Compress a PDF (MEDIUM)"
  "2. Merge 2 PDFs"
  "3. Split a PDF"
  "4. PDF to Image (first 5 pages)"
  "5. Compress another PDF (HIGH)"
  "6. Image to PDF (3 images)"
  "7. OCR a scanned page"
  "8. Protect a PDF with password"
  "9. Compress a PDF (LOW)"
  "10. Merge 3 PDFs"
)

for i in "${!OPERATIONS[@]}"; do
  OP="${OPERATIONS[$i]}"
  echo "--- Operation: $OP ---"
  echo ">> Perform this operation in the app, then press Enter..."
  read -r

  # Memory after operation
  MEM=$(adb shell dumpsys meminfo $PACKAGE 2>/dev/null | grep "TOTAL PSS" | awk '{print $3}')
  echo "  Memory after: ${MEM}KB"

  # Check for GC pressure
  GC_COUNT=$(adb logcat -d -s art | grep -c "GC" || true)
  echo "  GC events: $GC_COUNT"
  adb logcat -c
  echo ""
done

echo "Final memory:"
adb shell dumpsys meminfo $PACKAGE 2>/dev/null | grep -E "TOTAL|Native Heap|Java Heap" | head -5

echo ""
echo "=== TEST COMPLETE ==="
echo "Look for: memory growing steadily (leak), crashes, or freezes"
