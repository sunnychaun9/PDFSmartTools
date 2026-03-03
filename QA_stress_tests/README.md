# PDF Smart Tools - Stress Test Suite

## Prerequisites
- ADB connected to test device
- App installed in debug mode
- Test PDFs generated via `generate_test_pdfs.sh`

## Test Scripts
1. `merge_large.sh` - Merge 5x100MB PDFs
2. `compress_500_pages.sh` - Compress 500-page doc at each level
3. `ocr_100_pages.sh` - OCR a 100-page scanned document
4. `pdf_to_image_200.sh` - Convert 200 pages to images
5. `rapid_operations.sh` - 10 operations in sequence without restart
6. `low_memory.sh` - Simulate 2GB device memory constraint

## Usage
```bash
# Generate test PDFs first
./generate_test_pdfs.sh

# Run individual test
./merge_large.sh

# Run all tests
./run_all.sh
```
