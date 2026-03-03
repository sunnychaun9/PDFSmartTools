#!/bin/bash
# Run all stress tests in sequence

echo "========================================"
echo "  PDF Smart Tools - Full Stress Suite"
echo "========================================"
echo "Date: $(date)"
echo ""

SCRIPTS=(
  "merge_large.sh"
  "compress_500_pages.sh"
  "rapid_operations.sh"
)

for SCRIPT in "${SCRIPTS[@]}"; do
  echo ""
  echo "========================================"
  echo "  Running: $SCRIPT"
  echo "========================================"
  echo ""

  if [ -f "$SCRIPT" ]; then
    bash "$SCRIPT"
  else
    echo "  [SKIP] Script not found: $SCRIPT"
  fi

  echo ""
  echo "Press Enter to continue to next test..."
  read -r
done

echo ""
echo "========================================"
echo "  ALL STRESS TESTS COMPLETE"
echo "========================================"
