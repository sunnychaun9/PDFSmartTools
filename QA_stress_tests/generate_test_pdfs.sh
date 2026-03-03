#!/bin/bash
# Generate test PDFs of various sizes for stress testing
# Requires: python3, reportlab (pip install reportlab)

set -e

OUTPUT_DIR="./test_pdfs"
mkdir -p "$OUTPUT_DIR"

echo "=== Generating Test PDFs ==="

# Generate a PDF with N pages of lorem ipsum text + random images
python3 -c "
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
import sys, os

def gen_pdf(filename, pages):
    c = canvas.Canvas(filename, pagesize=A4)
    w, h = A4
    for i in range(pages):
        c.setFont('Helvetica', 12)
        c.drawString(72, h - 72, f'Page {i+1} of {pages}')
        # Fill page with text to increase file size
        y = h - 100
        for line in range(40):
            c.drawString(72, y, f'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Line {line}')
            y -= 14
            if y < 72:
                break
        c.showPage()
    c.save()
    size_mb = os.path.getsize(filename) / (1024*1024)
    print(f'  Generated {filename}: {pages} pages, {size_mb:.1f}MB')

gen_pdf('$OUTPUT_DIR/test_50_pages.pdf', 50)
gen_pdf('$OUTPUT_DIR/test_100_pages.pdf', 100)
gen_pdf('$OUTPUT_DIR/test_200_pages.pdf', 200)
gen_pdf('$OUTPUT_DIR/test_500_pages.pdf', 500)
" 2>/dev/null || echo "  [SKIP] reportlab not installed. Install with: pip install reportlab"

echo ""
echo "=== To create large files by duplication ==="
echo "Use: pdftk test_100_pages.pdf test_100_pages.pdf cat output test_200_pages_large.pdf"
echo "Or push existing test PDFs to device:"
echo "  adb push test_pdfs/ /sdcard/Download/"
