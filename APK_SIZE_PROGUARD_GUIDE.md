# APK Size & ProGuard Verification Guide

## 1. Build Release APK

```bash
cd android
./gradlew assembleRelease
```

Output location:
```
android/app/build/outputs/apk/release/app-release.apk
```

Check size:
```bash
ls -lh app/build/outputs/apk/release/app-release.apk
```

## 2. APK Size Budget

| Component | Expected Size | Notes |
|-----------|:------------:|-------|
| Hermes JS bundle | ~2-4 MB | App JavaScript + dependencies |
| React Native core | ~8-12 MB | Native libraries (per ABI) |
| PDFBox Android | ~5-8 MB | PDF manipulation library |
| Apache POI | ~8-12 MB | Word processing (with exclusions) |
| ML Kit Text Recognition | ~3-5 MB | OCR on-device model |
| Firebase + Crashlytics | ~2-3 MB | Analytics & crash reporting |
| Vector Icons (fonts) | ~1-2 MB | MaterialCommunityIcons |
| Other deps | ~2-4 MB | WorkManager, Billing, Reanimated, etc. |
| **Total (per ABI)** | **~30-50 MB** | Single architecture |
| **Universal APK** | **~60-90 MB** | All architectures combined |

### Size Targets

| Build Type | Acceptable | Warning | Investigate |
|-----------|:----------:|:-------:|:-----------:|
| Per-ABI APK | < 40 MB | 40-60 MB | > 60 MB |
| Universal APK | < 80 MB | 80-120 MB | > 120 MB |
| AAB (Play Store) | < 50 MB | 50-80 MB | > 80 MB |

### Build AAB for Play Store

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## 3. Analyze APK Contents

### Using Android Studio APK Analyzer

1. Open Android Studio
2. Build > Analyze APK...
3. Select `app-release.apk`
4. Review:
   - **Raw File Size** vs **Download Size**
   - **lib/** — native .so files (largest contributor)
   - **classes.dex** — Java/Kotlin bytecode
   - **assets/** — JS bundle, fonts
   - **res/** — Android resources

### Using command-line

```bash
# List APK contents sorted by size
unzip -l app-release.apk | sort -rn -k 1 | head -30

# Check .so files per architecture
unzip -l app-release.apk | grep "\.so$" | sort -rn -k 1

# Check dex file size
unzip -l app-release.apk | grep "\.dex$"
```

## 4. ProGuard Verification

### Current Configuration

ProGuard is **enabled** for release builds:
```gradle
release {
    minifyEnabled true
    shrinkResources true
    proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
}
```

### Critical Keep Rules

Our `proguard-rules.pro` preserves:

| Rule | Reason |
|------|--------|
| `com.pdfsmarttools.**.*Module` | React Native bridge modules (reflection) |
| `com.pdfsmarttools.**.*Package` | React Native package registration |
| `com.tom_roush.pdfbox.**` | PDFBox Android (uses reflection) |
| `org.apache.poi.**` | Apache POI (uses reflection) |
| `com.facebook.react.**` | React Native framework |
| `com.facebook.hermes.**` | Hermes JS engine |
| `com.android.vending.billing.**` | Play Store billing |

### Verify ProGuard Didn't Break Anything

After building release APK, run this checklist on the release build:

```bash
# Install release APK
adb install -r app/build/outputs/apk/release/app-release.apk
```

| # | Test | What to Check | Pass |
|---|------|---------------|:----:|
| 1 | App launches | No crash on cold start | [ ] |
| 2 | All tools visible | HomeScreen shows all 15+ tools | [ ] |
| 3 | Compress PDF | Native module bridge works | [ ] |
| 4 | Merge PDF | PdfMergerModule not stripped | [ ] |
| 5 | Split PDF | PdfSplitterModule not stripped | [ ] |
| 6 | Sign PDF | PdfSignerModule not stripped | [ ] |
| 7 | OCR Extract | ML Kit classes preserved | [ ] |
| 8 | Image to PDF | PdfGenerator works | [ ] |
| 9 | PDF to Image | PdfToImageModule not stripped | [ ] |
| 10 | Protect PDF | PDFBox encryption classes present | [ ] |
| 11 | Unlock PDF | PDFBox decryption works | [ ] |
| 12 | Word to PDF | Apache POI classes preserved | [ ] |
| 13 | PDF to Word | Conversion module works | [ ] |
| 14 | Scan Document | Camera module not stripped | [ ] |
| 15 | Page Manager | PdfPageManagerModule works | [ ] |
| 16 | File Picker | FilePickerModule works | [ ] |
| 17 | Dark mode | Theme toggle works | [ ] |
| 18 | Crashlytics | `adb logcat -s FirebaseCrashlytics` shows init | [ ] |

### Check ProGuard Mapping File

The mapping file is generated at:
```
android/app/build/outputs/mapping/release/mapping.txt
```

Upload this to Firebase Crashlytics for deobfuscated crash reports:
```bash
# Firebase CLI
firebase crashlytics:mappingFile:upload \
  --app=YOUR_APP_ID \
  android/app/build/outputs/mapping/release/mapping.txt
```

### Debugging ProGuard Issues

If the release build crashes but debug works:

1. **Check logcat for ClassNotFoundException or NoSuchMethodException:**
   ```bash
   adb logcat -s AndroidRuntime | grep -E "ClassNotFound|NoSuchMethod|NoSuchField"
   ```

2. **Add missing keep rules:**
   ```proguard
   # If a specific class is stripped, add:
   -keep class com.example.StrippedClass { *; }
   ```

3. **Build with ProGuard but no obfuscation (for debugging):**
   Add to `proguard-rules.pro`:
   ```proguard
   -dontobfuscate
   ```
   Build, test, then remove once fixed.

4. **Check the seeds/usage reports:**
   Add to `proguard-rules.pro`:
   ```proguard
   -printseeds seeds.txt
   -printusage unused.txt
   ```
   Review `unused.txt` for accidentally removed classes.

## 5. Size Reduction Strategies

If APK size exceeds targets:

### Quick Wins
- **ABI splits**: Build per-architecture APKs
  ```gradle
  android {
      splits {
          abi {
              enable true
              reset()
              include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
              universalApk false
          }
      }
  }
  ```

- **Use AAB format**: Google Play generates optimized APKs per device

### If Still Too Large
- Audit unused POI modules (poi-scratchpad may not be needed)
- Check if ML Kit model can be downloaded on-demand instead of bundled
- Review `node_modules` for unnecessary React Native libraries
- Ensure `shrinkResources true` is active (already set)

## 6. Signing Verification

Verify the APK is properly signed:
```bash
# Check signing info
apksigner verify --verbose app-release.apk

# Or using jarsigner
jarsigner -verify -verbose -certs app-release.apk
```

Ensure:
- Release APK uses the release keystore (not debug)
- Keystore file is backed up securely (NOT in git)
- `keystore.properties` is in `.gitignore`
