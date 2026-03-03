# PDF Smart Tools - Manual Stress Test Checklist

## Overview
This checklist verifies production readiness across all features with emphasis on edge cases, reliability, and UX quality.

---

## 1. Corrupted PDF Handling

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Truncated PDF | Use a PDF file with bytes removed from the end | Clear error message, no crash | |
| Invalid header | Use a file with corrupted PDF header | "Invalid PDF" error shown | |
| Corrupted page stream | PDF with corrupted internal pages | Graceful failure with message | |
| Zero-byte file | Select a 0-byte .pdf file | "File is empty" error | |
| Non-PDF as PDF | Rename a .jpg to .pdf and open | "Not a valid PDF" error | |

---

## 2. Large PDF Handling

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| 50-page PDF compress | Compress a 50-page PDF | Progress shows page count, completes | |
| 100-page PDF merge | Merge 100 single-page PDFs | Warning shown, user can proceed | |
| 200-page PDF split | Split a 200-page PDF by ranges | High memory warning, works if confirmed | |
| 500+ page PDF | Attempt any operation on 500+ page PDF | Critical warning, abort recommended | |
| Large file size (>50MB) | Any operation on large file | Memory warning shown | |

---

## 3. Password Protection Tests

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Correct password | Unlock PDF with correct password | PDF unlocked successfully | |
| Wrong password | Enter incorrect password | "Wrong password" error, retry option | |
| Empty password field | Submit without entering password | Validation error shown | |
| Password with special chars | Use password with `!@#$%^&*()` | Works correctly | |
| Very long password | Use 100+ character password | Works correctly | |
| Unicode password | Use CJK/RTL characters in password | Works correctly | |

---

## 4. Permission Revocation Tests

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Revoke storage mid-operation | Revoke permissions while compressing | SecurityException caught, UI recovers | |
| No storage permission | Start with denied permissions | Prompts for permission | |
| Grant after denial | Deny then grant from settings | Works on retry | |
| Scoped storage compliance | Test on Android 11+ | Uses SAF correctly | |

---

## 5. App Kill / Interruption Tests

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Force stop mid-compress | Force stop during compression | No orphan temp files, clean restart | |
| Back button during operation | Press back while processing | Confirmation dialog shown | |
| Home button mid-process | Press home, return later | Operation continues or can be retried | |
| Screen rotation during progress | Rotate screen while progress modal shown | UI preserved, no crash | |
| Low memory kill | Trigger low memory condition | State recoverable on restart | |
| Power button (screen off) | Turn off screen during operation | Continues in background or pauses gracefully | |

---

## 6. Progress UI Tests

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Progress modal visibility | Start any long operation | Progress modal appears immediately | |
| Page count display | Process multi-page PDF | Shows "Page X of Y" | |
| Time estimate display | Process 20+ page PDF | Shows estimated time remaining | |
| Time estimate accuracy | Time estimate vs actual completion | Within reasonable margin (±30%) | |
| Progress percentage accuracy | Watch progress during compression | Progresses smoothly 0-100% | |
| Cancel button works (OCR) | Press cancel during OCR | Operation stops, temp files cleaned | |
| Modal closes on error | Trigger error during operation | Modal closes, error shown | |
| Modal closes on success | Complete any operation | Modal closes, result shown | |
| Progress consistency | Test all 7 tools with progress | Same modal style across all | |

### Progress Modal Checklist (per feature)
| Feature | Page Progress | Time Estimate | Cancel | Modal Style |
|---------|--------------|---------------|--------|-------------|
| Compress PDF | | | N/A | |
| Merge PDF | | | N/A | |
| Split PDF | | | N/A | |
| Protect PDF | | | N/A | |
| Sign PDF | | | N/A | |
| Image to PDF | | | N/A | |
| OCR/Searchable | | | Yes | |

---

## 7. Memory & Resource Tests

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Repeated operations | Compress same PDF 10 times | No memory leak, stable performance | |
| Multiple file selection | Add 20+ files to merge | Handles gracefully | |
| Low storage space | Fill device storage, try operation | "Insufficient storage" error | |
| Cache cleanup on startup | Install, use, restart | Old temp files cleaned | |

---

## 8. RTL and CJK Text Tests

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Arabic PDF content | Process PDF with Arabic text | Text preserved correctly | |
| Hebrew PDF content | Process PDF with Hebrew text | Text preserved correctly | |
| Chinese PDF content | Process PDF with Chinese text | Text preserved correctly | |
| Japanese PDF content | Process PDF with Japanese text | Text preserved correctly | |
| Mixed direction content | PDF with LTR and RTL mixed | All text preserved | |

---

## 9. Error Recovery Tests

| Test Case | Steps | Expected Result | Pass/Fail |
|-----------|-------|-----------------|-----------|
| Network error during download | Simulate network loss | Clear error, retry option | |
| Disk full during write | Fill disk mid-operation | Error shown, no corruption | |
| Invalid output path | Trigger invalid path scenario | Error caught, user notified | |
| OutOfMemory error | Process oversized file | OOM caught, user-friendly message | |

---

## 10. Feature-Specific Tests

### Compress PDF
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Low compression level | ~20-30% reduction, high quality | |
| Medium compression level | ~40-55% reduction | |
| High compression level | ~60-75% reduction | |
| PDF with images | Images compressed, readable | |
| PDF with text only | Still compresses (font optimization) | |

### Merge PDF
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Merge 2 PDFs | Single output file created | |
| Merge 10 PDFs | Handles correctly | |
| Reorder before merge | Order preserved in output | |
| Different page sizes | All pages included | |

### Split PDF
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Split by range (1-5) | 5-page output created | |
| Split multiple ranges | Multiple outputs created | |
| Individual page extraction | Each page separate file | |
| Invalid range (page 999) | Error message shown | |

### OCR
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Clear text image | High confidence, accurate text | |
| Blurry image | Lower confidence, partial text | |
| Handwritten text | Attempts recognition | |
| Multiple languages | Detects and extracts | |

### PDF to Image
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Single page PDF | One image output | |
| Multi-page PDF | Multiple images output | |
| High resolution setting | Large image files | |
| Low resolution setting | Smaller image files | |

### Image to PDF
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Single image | One-page PDF | |
| Multiple images | Multi-page PDF | |
| Reorder images | Order preserved | |
| Large image (4K+) | Handles without OOM | |

### Organize Pages
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Rotate single page | Only selected page rotated | |
| Rotate all pages | All pages rotated | |
| Delete pages | Pages removed, others intact | |
| Reorder pages | New order saved correctly | |

### Protect PDF
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Add password | Password required to open | |
| Strong password | Encryption applied | |
| Remove password | PDF unlocked successfully | |

### Word to PDF / PDF to Word
| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Simple document | Converts correctly | |
| Document with images | Images included | |
| Document with tables | Tables preserved | |
| Complex formatting | Best-effort conversion | |

---

## 11. Device Compatibility Matrix

| Device Category | Test Coverage | Notes |
|-----------------|---------------|-------|
| Low-end (2-3GB RAM) | All features | Check memory warnings |
| Mid-range (4-6GB RAM) | All features | Should work smoothly |
| High-end (8GB+ RAM) | All features | Full performance |
| Android 8.0 | Basic flow | Minimum supported |
| Android 10 | Full testing | Scoped storage |
| Android 11+ | Full testing | Storage access changes |
| Android 13+ | Full testing | Notification permission |

---

## 12. Final Acceptance Checklist

| Criteria | Status |
|----------|--------|
| All features functional | |
| No crashes in testing | |
| Progress UI consistent | |
| Error messages clear | |
| Temp files cleaned | |
| Memory stable after repeated use | |
| Large file warnings work | |
| Password features secure | |
| RTL/CJK text handled | |
| Android version compatibility | |

---

## Test Environment Setup

1. **Test PDFs to prepare:**
   - 1-page simple PDF
   - 10-page mixed content PDF
   - 50-page document PDF
   - 100-page document PDF
   - Password-protected PDF
   - Corrupted PDF (truncated)
   - PDF with CJK text
   - PDF with Arabic text
   - Image-heavy PDF
   - Text-only PDF

2. **Test devices needed:**
   - Low-end Android device (2-3GB RAM)
   - Mid-range Android device
   - Android 10 device
   - Android 13+ device

3. **Test images:**
   - Clear text image (for OCR)
   - Blurry image
   - High-resolution image
   - Multiple images for batch

---

*Last updated: February 2026*
*Version: 1.0*
