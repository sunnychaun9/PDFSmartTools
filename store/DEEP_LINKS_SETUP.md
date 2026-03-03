# Deep Links Setup Guide

## Android App Links Configuration

### What's Configured

1. **AndroidManifest.xml** — intent filter with `android:autoVerify="true"` for `https://pdfsmarttools.com/open/*`
2. **assetlinks.json** — Digital Asset Links file template (needs signing key fingerprint)

### Deployment Steps

#### 1. Get your signing key fingerprint

```bash
# For release keystore
keytool -list -v -keystore your-release-key.keystore -alias your-key-alias

# For Play App Signing (recommended)
# Get SHA-256 from: Play Console > Setup > App signing > App signing key certificate
```

Copy the `SHA-256` fingerprint (format: `AA:BB:CC:...`).

#### 2. Update assetlinks.json

Replace `TODO:REPLACE_WITH_RELEASE_SIGNING_KEY_SHA256_FINGERPRINT` in `store/assetlinks.json` with your actual fingerprint.

If using Play App Signing, add BOTH your upload key and Play's signing key:
```json
"sha256_cert_fingerprints": [
  "YOUR_UPLOAD_KEY_SHA256",
  "PLAY_APP_SIGNING_KEY_SHA256"
]
```

#### 3. Host assetlinks.json

Upload to your web server at:
```
https://pdfsmarttools.com/.well-known/assetlinks.json
```

Requirements:
- Must be served over HTTPS
- Must return `Content-Type: application/json`
- Must be accessible without redirects
- Must return HTTP 200

#### 4. Verify

```bash
# Test with Google's verification tool
https://developers.google.com/digital-asset-links/tools/generator

# Or via adb
adb shell am start -a android.intent.action.VIEW \
  -d "https://pdfsmarttools.com/open/viewer" \
  com.pdfsmarttools
```

### Supported Deep Link Paths

| Path | Action | Notes |
|------|--------|-------|
| `/open` | Opens app home | Default entry point |
| `/open/viewer` | Opens PDF viewer | Can add `?file=` param later |
| `/open/compress` | Opens compress tool | Direct tool access |
| `/open/merge` | Opens merge tool | Direct tool access |
| `/open/scan` | Opens scanner | Direct tool access |

### Handling Deep Links in React Native

Deep links are already handled by the existing `deepLinkingService` in `src/infrastructure/deepLinking/`. The navigation configuration maps URLs to screens.

### Testing Without a Domain

For development testing, use `adb` to simulate deep links:
```bash
# Test PDF intent
adb shell am start -a android.intent.action.VIEW \
  -t "application/pdf" \
  -d "content://path/to/test.pdf" \
  com.pdfsmarttools

# Test HTTPS deep link
adb shell am start -a android.intent.action.VIEW \
  -d "https://pdfsmarttools.com/open" \
  com.pdfsmarttools
```
