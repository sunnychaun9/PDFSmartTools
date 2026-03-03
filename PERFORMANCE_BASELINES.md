# Performance Baselines

Measured on: [Device Model], Android [Version], [RAM]GB RAM
Date: ____

## Target Thresholds

| Metric | Acceptable | Warning | Critical |
|--------|-----------|---------|----------|
| Operation time (10 pages) | < 5s | 5-15s | > 15s |
| Operation time (50 pages) | < 30s | 30-60s | > 60s |
| Operation time (100 pages) | < 90s | 90-180s | > 180s |
| Peak memory (any op) | < 200MB | 200-400MB | > 400MB |
| App startup (cold) | < 3s | 3-5s | > 5s |

---

## Compression

| Pages | Level | Time (s) | Peak Memory (MB) | Input Size | Output Size | Ratio |
|-------|-------|----------|-------------------|------------|-------------|-------|
| 10 | LOW | | | | | |
| 10 | MEDIUM | | | | | |
| 10 | HIGH | | | | | |
| 50 | LOW | | | | | |
| 50 | MEDIUM | | | | | |
| 50 | HIGH | | | | | |
| 100 | LOW | | | | | |
| 100 | MEDIUM | | | | | |
| 100 | HIGH | | | | | |

## Merge

| Files | Total Pages | Time (s) | Peak Memory (MB) | Output Size |
|-------|-------------|----------|-------------------|-------------|
| 2 | 20 | | | |
| 3 | 50 | | | |
| 5 | 100 | | | |

## Split

| Input Pages | Split Into | Time (s) | Peak Memory (MB) |
|-------------|-----------|----------|-------------------|
| 10 | 2 parts | | |
| 50 | 5 parts | | |
| 100 | 10 parts | | |

## PDF to Image

| Pages | DPI | Time (s) | Peak Memory (MB) | Output Size |
|-------|-----|----------|-------------------|-------------|
| 10 | 150 | | | |
| 50 | 150 | | | |
| 100 | 150 | | | |

## Image to PDF

| Images | Avg Size | Time (s) | Peak Memory (MB) | Output Size |
|--------|----------|----------|-------------------|-------------|
| 3 | 2MB | | | |
| 10 | 2MB | | | |
| 20 | 5MB | | | |

## OCR (Text Extraction)

| Pages | Has Text | Time (s) | Peak Memory (MB) |
|-------|----------|----------|-------------------|
| 1 | Scanned | | |
| 10 | Scanned | | |
| 50 | Mixed | | |

## PDF to Word

| Pages | Content Type | Time (s) | Peak Memory (MB) | Output Size |
|-------|-------------|----------|-------------------|-------------|
| 10 | Text-heavy | | | |
| 50 | Mixed | | | |

## Word to PDF

| Pages | Content Type | Time (s) | Peak Memory (MB) | Output Size |
|-------|-------------|----------|-------------------|-------------|
| 10 | Text-heavy | | | |
| 50 | With images | | | |

## Sign PDF

| Pages | Signatures | Time (s) | Peak Memory (MB) |
|-------|-----------|----------|-------------------|
| 1 | 1 | | |
| 10 | 1 | | |

## Protect / Unlock PDF

| Pages | Time (s) | Peak Memory (MB) |
|-------|----------|-------------------|
| 10 | | |
| 100 | | |

## App Startup

| Metric | Cold Start (s) | Warm Start (s) |
|--------|---------------|----------------|
| First launch (onboarding) | | |
| Normal launch | | |
| Launch via PDF intent | | |

---

## How to Measure

### Time
```bash
# Use adb logcat to capture operation metrics
adb logcat -s PDFSmartTools PdfBoxHelper | grep "metrics"
```

### Memory
```bash
# Peak PSS during operation
adb shell dumpsys meminfo com.pdfsmarttools | grep "TOTAL PSS"
```

### APK Size
```bash
# Build release APK
cd android && ./gradlew assembleRelease
ls -lh app/build/outputs/apk/release/app-release.apk
```

---

## Regression Detection

Compare new measurements against baselines. Flag regressions:
- Time increased > 20%
- Memory increased > 30%
- Output size changed > 10% (may indicate quality change)
