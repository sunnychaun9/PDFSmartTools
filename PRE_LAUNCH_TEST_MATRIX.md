# Pre-Launch Test Matrix

## 10.1 — Full Feature Matrix

Test every feature in 3 user states. Mark each cell: PASS / FAIL / N/A

| # | Tool | Free (under limit) | Free (limit reached) | Pro |
|---|------|:------------------:|:--------------------:|:---:|
| 1 | Image to PDF | [ ] | [ ] | [ ] |
| 2 | Compress (LOW) | [ ] | [ ] | [ ] |
| 3 | Compress (MEDIUM) | [ ] | [ ] | [ ] |
| 4 | Compress (HIGH) | [ ] | [ ] | [ ] |
| 5 | Merge | [ ] | [ ] | [ ] |
| 6 | Split | [ ] | [ ] | [ ] |
| 7 | OCR (extract text) | [ ] | [ ] | [ ] |
| 8 | Scan to PDF | [ ] | [ ] | [ ] |
| 9 | Scan to Searchable PDF | [ ] | [ ] | [ ] |
| 10 | Sign PDF | [ ] | [ ] | [ ] |
| 11 | Organize Pages | [ ] | [ ] | [ ] |
| 12 | PDF to Image | [ ] | [ ] | [ ] |
| 13 | Protect PDF | [ ] | [ ] | [ ] |
| 14 | Unlock PDF | [ ] | [ ] | [ ] |
| 15 | Word to PDF | [ ] | [ ] | [ ] |
| 16 | PDF to Word | [ ] | [ ] | [ ] |
| 17 | PDF Viewer | [ ] | [ ] | [ ] |

### Per-cell verification checklist:
- [ ] Operation completes without crash
- [ ] Correct output produced
- [ ] Watermark present (Free) / absent (Pro)
- [ ] Usage limit enforced (Free, limit reached shows upgrade prompt)
- [ ] Ad shown (Free) / no ad (Pro)
- [ ] Progress indicator shown during operation
- [ ] Success/error feedback displayed
- [ ] Share button works on result

---

## 10.2 — Edge Case Testing

| # | Test Case | Expected Behavior | Result |
|---|-----------|-------------------|--------|
| 1 | Empty PDF (0 pages) | Clear error: "PDF has no pages" | [ ] |
| 2 | Single-page PDF | Processes normally | [ ] |
| 3 | PDF with only images (no text) | Compress/OCR work correctly | [ ] |
| 4 | PDF with only text (no images) | Compress (LOW) still reduces size | [ ] |
| 5 | Password-protected PDF (correct pwd) | Unlock succeeds | [ ] |
| 6 | Password-protected PDF (wrong pwd) | Clear error message | [ ] |
| 7 | PDF with form fields | Form fields preserved in merge/split | [ ] |
| 8 | PDF > 100MB | Warning shown, chunked processing | [ ] |
| 9 | PDF > 500MB | Blocked with "split first" guidance | [ ] |
| 10 | PDF with Unicode filename (日本語.pdf) | File picked and processed correctly | [ ] |
| 11 | PDF from content:// URI (Gmail) | Resolved and processed | [ ] |
| 12 | PDF from WhatsApp share | Intent handled, viewer opens | [ ] |
| 13 | Corrupted PDF (truncated) | Error: "file appears to be damaged" | [ ] |
| 14 | Renamed file (.txt -> .jpg) | Image to PDF shows error | [ ] |
| 15 | No storage permission | Permission prompt shown | [ ] |
| 16 | Low storage (< 50MB free) | Clear error: "not enough storage" | [ ] |
| 17 | Cancel during operation | Operation stops, temp files cleaned | [ ] |
| 18 | Back button during operation | Confirmation dialog shown | [ ] |
| 19 | App backgrounded during operation | WorkManager continues (long ops) | [ ] |
| 20 | Rapid double-tap on action button | Only one operation starts | [ ] |

---

## 10.3 — Device Compatibility Testing

### Android Versions

| API | Version | Scoped Storage | Permission Model | Result |
|-----|---------|---------------|-----------------|--------|
| 26 | Android 8.0 | No | Runtime | [ ] |
| 29 | Android 10 | Opt-in | Runtime | [ ] |
| 30 | Android 11 | Enforced | Runtime | [ ] |
| 33 | Android 13 | Enforced | READ_MEDIA_IMAGES | [ ] |
| 34 | Android 14 | Enforced | Photo picker | [ ] |

### OEM Testing

| OEM | Device | Android Ver | Known Issues | Result |
|-----|--------|-------------|-------------|--------|
| Samsung | Galaxy S/A series | | KNOX, custom file picker | [ ] |
| Xiaomi | Redmi/Poco | | MIUI background restrictions | [ ] |
| Google | Pixel | | Stock Android reference | [ ] |
| OnePlus | Any | | OxygenOS memory management | [ ] |

### Per-device checklist:
- [ ] App installs and launches
- [ ] File picker opens and returns files
- [ ] Camera opens for scan feature
- [ ] Notifications appear (WorkManager)
- [ ] Dark mode toggles correctly
- [ ] Deep linking (PDF intent) works
- [ ] No ANR or crash in 10-minute session
- [ ] Memory returns to baseline after operations

---

## Sign-off

| Area | Tester | Date | Status |
|------|--------|------|--------|
| Feature Matrix | | | |
| Edge Cases | | | |
| Device Compat | | | |
| Final Approval | | | |
