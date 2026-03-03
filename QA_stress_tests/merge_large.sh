#!/bin/bash
# Stress test: Merge multiple large PDF files
# Measures: time, peak memory, crash occurrence

set -e
PACKAGE="com.pdfsmarttools"
TAG="StressTest-Merge"

echo "=== STRESS TEST: Large File Merge ==="
echo "Date: $(date)"
echo ""

# Clear logcat
adb logcat -c

# Record start time
START=$(date +%s)

echo "Monitoring memory usage during merge..."
echo "Watch for OOM in logcat: adb logcat -s $TAG PDFSmartTools ActivityManager"
echo ""

# Monitor memory in background
(
  while true; do
    MEM=$(adb shell dumpsys meminfo $PACKAGE 2>/dev/null | grep "TOTAL PSS" | awk '{print $3}')
    if [ -n "$MEM" ]; then
      echo "[$(date +%H:%M:%S)] PSS: ${MEM}KB"
    fi
    sleep 5
  done
) &
MONITOR_PID=$!

echo ">> Open the app and merge 3+ large PDF files (100MB+ each)"
echo ">> Press Enter when the operation completes or fails..."
read -r

# Stop monitor
kill $MONITOR_PID 2>/dev/null || true

END=$(date +%s)
DURATION=$((END - START))

echo ""
echo "=== RESULTS ==="
echo "Duration: ${DURATION}s"
echo ""

# Check for OOM or crashes
echo "Checking for crashes/OOM..."
adb logcat -d -s AndroidRuntime ActivityManager | grep -i "out of memory\|oom\|crash\|killed" | tail -5

echo ""
echo "Peak memory usage:"
adb shell dumpsys meminfo $PACKAGE 2>/dev/null | grep -E "TOTAL|Native Heap|Java Heap" | head -5

echo ""
echo "=== TEST COMPLETE ==="
