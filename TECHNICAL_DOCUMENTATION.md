# PDF Smart Tools - Technical Documentation

> Generated: 2026-02-27 | Based on: Full codebase analysis

---

## 1. Project Overview

| Field | Value |
|-------|-------|
| **App Name** | PDF Smart Tools (`com.pdfsmarttools`) |
| **Platform** | Android-only (React Native) |
| **Development Stage** | Late Alpha / Early Beta -- functional core with 15 working PDF tools, disabled monetization, no backend |
| **Architecture** | Layered monolith: React Native UI layer + custom Kotlin native modules for PDF processing |
| **Version** | 0.0.1 (as declared in `package.json`) |

The application is a local-only, on-device PDF manipulation tool. All PDF processing happens natively on the Android device using Android SDK APIs, PdfBox-Android, Apache POI, and Google ML Kit. There is **no backend server, no cloud API, and no remote data transmission**.

---

## 2. Tech Stack Analysis

### Frontend

| Component | Technology |
|-----------|------------|
| **Framework** | React Native 0.83.1 (React 19.2.0) |
| **Language** | TypeScript 5.8.3 |
| **State Management** | React Context API + `useState`/`useCallback`/`useMemo` hooks (no Redux/Zustand/MobX) |
| **Routing** | React Navigation 7 (`@react-navigation/native-stack`, `@react-navigation/bottom-tabs`) |
| **UI Library** | Custom component library (no external UI kit) |
| **Animations** | `react-native-reanimated` 4.2.1, React Native `Animated` API |
| **Gesture Handling** | `react-native-gesture-handler` 2.30.0 |
| **PDF Viewing** | `react-native-pdf` 7.0.3 |
| **Camera** | `react-native-camera` 4.2.1 |
| **Image Picking** | `react-native-image-picker` 8.2.1 |
| **Signature Drawing** | `react-native-signature-canvas` 5.0.2, `react-native-svg` 15.15.1 |
| **WebView** | `react-native-webview` 13.16.0 |
| **Ads** | `react-native-google-mobile-ads` 16.0.1 |
| **IAP** | `react-native-iap` 14.7.6 (installed but **disabled** via feature flag) |
| **Storage** | `@react-native-async-storage/async-storage` 2.2.0 |
| **File System** | `react-native-fs` 2.20.0, `react-native-blob-util` 0.24.6 |
| **Sharing** | `react-native-share` 12.2.4 |
| **In-App Review** | `react-native-in-app-review` 4.4.2 |

### Native Modules (Android/Kotlin)

17 custom native modules registered in `MainApplication.kt`:

| Module | Purpose |
|--------|---------|
| `PdfCompressor` | PDF compression via DPI reduction |
| `PdfMerger` | Merge multiple PDFs |
| `PdfSplitter` | Split PDF by page ranges |
| `PdfSigner` | Visual signature overlay |
| `PdfProtector` | AES-256 password protection |
| `PdfUnlock` | Remove PDF password (with correct password) |
| `PdfToImage` | Convert PDF pages to PNG/JPEG |
| `PdfToWord` | Convert PDF to DOCX |
| `PdfOcr` | Create searchable PDFs via OCR |
| `PdfPageManager` | Rotate, delete, reorder pages |
| `PdfPreflight` | Pre-processing analysis |
| `TextRecognition` | Image OCR text extraction |
| `WordToPdf` | DOC/DOCX to PDF conversion |
| `ScanPdfModule` | Camera scan to PDF pipeline |
| `FilePicker` | System file picker (SAF) |
| `PdfShareModule` | FileProvider-based sharing |
| `InAppUpdate` | Google Play In-App Updates |
| `IntentModule` | Handle external PDF open intents |

### Native Android Dependencies (build.gradle)

| Library | Version | Purpose |
|---------|---------|---------|
| `com.tom-roush:pdfbox-android` | 2.0.27.0 | PDF encryption, text extraction, document model |
| `org.apache.poi:poi` | 5.2.3 | Word document reading (DOC) |
| `org.apache.poi:poi-ooxml` | 5.2.3 | DOCX reading |
| `org.apache.poi:poi-scratchpad` | 5.2.3 | Legacy DOC format (HWPF) |
| `com.google.mlkit:text-recognition` | 16.0.0 | On-device OCR |
| `com.google.android.play:app-update` | 2.1.0 | In-App Updates API |
| `com.android.billingclient:billing` | 6.0.1 | Google Play Billing (unused at runtime) |
| Android SDK `PdfRenderer` | Built-in | PDF page rendering |
| Android SDK `PdfDocument` | Built-in | PDF creation |

### Backend

**No backend exists.** The application is entirely client-side. There are no API endpoints, no server code, no database, no cloud services, and no remote data storage. All operations execute locally on the device.

---

## 3. Feature Inventory (Based on Code Only)

### Core PDF Tools

| # | Feature | UI | Business Logic | Native Module | Status |
|---|---------|:---:|:--------------:|:-------------:|--------|
| 1 | **Scan Document** | Yes | Yes | `ScanPdfModule` + `EdgeProcessor` (JNI) | Fully functional -- camera capture, image processing (auto/grayscale/B&W/enhanced), edge detection, PDF generation |
| 2 | **Image to PDF** | Yes | Yes | `react-native-html-to-pdf` | Fully functional -- multi-image selection, drag-to-reorder, page size options, watermark for free users |
| 3 | **PDF to Image** | Yes | Yes | `PdfToImage` | Fully functional -- PNG/JPEG output, configurable quality, resolution capped for free users (1024px vs 2480px) |
| 4 | **Compress PDF** | Yes | Yes | `PdfCompressor` | Fully functional -- 3 compression levels (low/medium/high), progress tracking, size comparison report |
| 5 | **Merge PDFs** | Yes | Yes | `PdfMerger` | Fully functional -- multi-file merge, page count display, progress events |
| 6 | **Extract Text (OCR)** | Yes | Yes | `TextRecognition` (ML Kit) | Fully functional -- image OCR, text blocks with confidence scores, clipboard copy |
| 7 | **Scan to Searchable PDF** | Yes | Yes | `PdfOcr` (ML Kit) | Fully functional -- renders pages at 300 DPI, OCR with invisible text layer, cancel support, statistics |
| 8 | **Sign PDF** | Yes | Yes | `PdfSigner` | Fully functional -- signature drawing canvas (SVG), save/load signature, position placement on page |
| 9 | **Split PDF** | Yes | Yes | `PdfSplitter` | Fully functional -- page range parsing, single page extraction, free users limited to pages 1-2 |
| 10 | **Organize Pages** | Yes | Yes | `PdfPageManager` | Fully functional -- thumbnail generation, drag-to-reorder, rotate, delete, free users limited to 5 pages |
| 11 | **Protect PDF** | Yes | Yes | `PdfProtector` (PdfBox) | Fully functional -- AES-256 encryption, password validation (6-128 chars), encrypted status detection |
| 12 | **Unlock PDF** | Yes | Yes | `PdfUnlock` (PdfBox) | Fully functional -- password-based unlock only (no cracking), structured error codes |
| 13 | **Word to PDF** | Yes | Yes | `WordToPdf` (POI + PdfBox) | Fully functional -- DOC and DOCX support, paragraphs/tables/images, text wrapping, font selection |
| 14 | **PDF to Word** | Yes | Yes | `PdfToWord` (PdfBox + POI) | Fully functional -- text extraction with layout, optional image embedding, cancel support, 5-page limit for free |
| 15 | **View PDF** | Yes | Yes | `react-native-pdf` | Fully functional -- PDF rendering, file picker integration |

### User System

| Feature | UI | Logic | API | Status |
|---------|:---:|:-----:|:---:|--------|
| **User Authentication** | No | No | No | Not implemented -- no login, registration, or user accounts |
| **User Profile** | No | No | No | Not implemented |
| **Cloud Sync** | No | No | No | Not implemented (listed as "Coming soon" in Pro features) |

### Storage

| Feature | UI | Logic | API | Status |
|---------|:---:|:-----:|:---:|--------|
| **Recent Files** | Yes | Yes | No | Fully functional -- AsyncStorage-based, max 20 entries, auto-deduplication, relative date display |
| **Local File Management** | Yes | Yes | No | Functional -- saves to `Downloads/PDFSmartTools/`, duplicate filename handling, cache cleanup on startup |
| **Cloud Storage** | No | No | No | Not implemented |

### Payment / Monetization

| Feature | UI | Logic | API | Status |
|---------|:---:|:-----:|:---:|--------|
| **Banner Ads** | Yes | Yes | Google AdMob | Fully functional -- `BannerAdView` component, hidden for Pro users |
| **Interstitial Ads** | Yes | Yes | Google AdMob | Functional -- `adService.ts` with test/prod ad unit IDs |
| **Rewarded Ads** | Yes | Yes | Google AdMob | Functional -- used for feature gate bypass when daily limit exceeded |
| **Subscriptions (IAP)** | Yes | **Disabled** | Google Play Billing | UI exists (`ProScreen`), all logic **stubbed** -- `FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED = false`, IAP imports commented out |
| **Usage Limits** | Yes | Yes | No | Functional -- daily limits per feature, auto-reset, AsyncStorage persistence |

### Analytics

| Feature | UI | Logic | API | Status |
|---------|:---:|:-----:|:---:|--------|
| **Analytics** | No | No | No | Not implemented -- no Firebase Analytics, Mixpanel, or any analytics SDK |
| **Crash Reporting** | No | No | No | Not implemented -- no Crashlytics, Sentry, or equivalent |

### Settings

| Feature | UI | Logic | API | Status |
|---------|:---:|:-----:|:---:|--------|
| **Theme (Light/Dark/System)** | Yes | Yes | No | Fully functional -- persisted to AsyncStorage, system-follow mode |
| **Default Compression Level** | Yes | Yes | No | Fully functional -- persisted setting |
| **Save Location Display** | Yes | Yes | No | Functional -- display only (not user-configurable) |
| **Rate App** | Yes | Yes | Google Play | Functional -- opens Play Store listing |
| **Share App** | Yes | Yes | No | Functional -- native share with Play Store link |
| **Privacy Policy Link** | Yes | Partial | No | Links to `https://pdfsmarttools.com/privacy` (external URL, not verified) |
| **In-App Rating** | No (auto) | Yes | Google Play In-App Review | Functional -- triggers after 3 successful actions, 7-day cooldown |
| **In-App Updates** | No (auto) | Yes | Google Play Core | Functional -- flexible update mode, background download, restart prompt |

---

## 4. Folder Structure Breakdown

```
PDFSmartTools/
├── android/                         # Android native project
│   └── app/src/main/java/com/pdfsmarttools/
│       ├── common/                  # Shared utilities (ProgressTracker)
│       ├── inappupdate/             # Google Play In-App Update module
│       ├── intent/                  # External PDF intent handler
│       ├── pdfcompressor/           # PDF compression (Module + Engine + FilePicker)
│       ├── pdfmerger/               # PDF merge (Module + Engine)
│       ├── pdfocr/                  # OCR searchable PDF (Module + Engine)
│       ├── pdfpagemanager/          # Page organize (Module)
│       ├── pdfprotector/            # PDF encryption (Module)
│       ├── pdfsigner/               # Visual signature (Module)
│       ├── pdfsplitter/             # PDF split (Module)
│       ├── pdftoimage/              # PDF to image (Module)
│       ├── pdftoword/               # PDF to DOCX (Module)
│       ├── pdfunlock/               # PDF unlock (Module)
│       ├── pdfshare/                # FileProvider sharing (Module)
│       ├── preflight/               # PDF pre-analysis (Module)
│       ├── scan/                    # Document scanner (Module + EdgeProcessor JNI)
│       ├── textrecognition/         # Image OCR (Module)
│       └── wordtopdf/              # Word to PDF (Module)
├── src/
│   ├── app/                         # App entry point and providers
│   │   ├── App.tsx                  # Root app component
│   │   └── AppProviders.tsx         # Context composition, deep linking, cache cleanup, update handler
│   ├── components/
│   │   ├── ads/                     # BannerAdView
│   │   ├── camera/                  # CameraPreview
│   │   ├── feedback/                # ProgressModal, ProgressBar, LoadingOverlay
│   │   ├── layout/                  # Header, SafeScreen, Spacer
│   │   ├── signature/               # SignaturePad (SVG + gesture-handler)
│   │   ├── subscription/            # ProGate, UpgradePromptModal
│   │   └── ui/                      # Button, Card, Text, Icon, AppModal
│   ├── config/                      # Feature flags
│   ├── context/                     # ThemeContext, SubscriptionContext, FeatureGateContext, RatingContext
│   ├── navigation/                  # RootNavigator, TabNavigator, route types
│   ├── screens/                     # 15 feature screens + home + recent + settings + pro
│   │   ├── home/                    # HomeScreen + ToolCard/ToolListItem components
│   │   ├── image-to-pdf/            # ImageToPdfScreen + ImageReorderScreen
│   │   ├── merge-pdf/               # MergePdfScreen
│   │   ├── ocr/                     # OcrScreen
│   │   ├── organize-pages/          # OrganizePagesScreen
│   │   ├── pdf-compressor/          # CompressPdfScreen
│   │   ├── pdf-to-image/            # PdfToImageScreen
│   │   ├── pdf-to-word/             # PdfToWordScreen
│   │   ├── pdf-unlock/              # UnlockPdfScreen
│   │   ├── pdf-viewer/              # PdfViewerScreen
│   │   ├── pro/                     # ProScreen
│   │   ├── protect-pdf/             # ProtectPdfScreen
│   │   ├── recent/                  # RecentFilesScreen
│   │   ├── scan-document/           # ScanDocumentScreen
│   │   ├── scan-to-searchable-pdf/  # ScanToSearchablePdfScreen
│   │   ├── settings/                # SettingsScreen
│   │   ├── sign-pdf/                # SignPdfScreen + SignatureCreateScreen
│   │   ├── split-pdf/               # SplitPdfScreen
│   │   └── word-to-pdf/             # WordToPdfScreen
│   ├── services/                    # 30 service files (PDF ops, ads, IAP, sharing, etc.)
│   ├── theme/                       # colors, typography, spacing, shadows
│   ├── types/                       # TypeScript type declarations
│   └── utils/                       # features, permissions, storage, progressUtils, safeOperations
├── __tests__/                       # Unit tests (6 test files)
├── patches/                         # patch-package patches
└── scripts/                         # Build/utility scripts
```

### Architectural Organization

- **Feature-per-folder screens**: Each tool has its own directory under `src/screens/` with barrel exports.
- **Service layer**: 30 service files bridge React Native to native modules. Each native module gets a corresponding TypeScript service.
- **Context-based global state**: 4 contexts composed in `AppProviders.tsx` provide theme, subscription, feature gating, and rating state.
- **Component library**: Fully custom UI primitives -- no external UI kit dependency.
- **Native module pattern**: Each Kotlin module follows `Module + Package + (optional Engine)` structure. Each module is individually registered in `MainApplication.kt`.

### Code Quality Observations

- Consistent file naming and directory structure across all features.
- All components are memoized where appropriate (`React.memo`, `useMemo`, `useCallback`).
- Animations are consistently spring-based with `useNativeDriver: true`.
- Theme support is thorough -- every screen respects light/dark mode.
- Empty directories exist: `src/features/`, `src/hooks/`, `src/store/`, `src/services/analytics/`, `src/services/permissions/`, `src/services/storage/` -- these suggest planned but unimplemented architectural expansions.

---

## 5. PDF Processing Logic

### Is actual PDF manipulation implemented?

**Yes.** All 15 PDF tools perform real, on-device processing. There are zero mocked or simulated operations.

### Libraries Used

| Library | Operations |
|---------|-----------|
| **Android `PdfRenderer`** | Read PDF pages as bitmaps (used by: Compressor, Merger, Splitter, Signer, ToImage, PageManager, OCR, Preflight) |
| **Android `PdfDocument`** | Create new PDF files from bitmaps (used by: Compressor, Merger, Splitter, Signer, PageManager, OCR, Scanner) |
| **PdfBox-Android 2.0.27.0** | Structural PDF operations -- AES-256 encryption (Protector), password removal (Unlock), text extraction (ToWord), PDF creation from Word content (WordToPdf) |
| **Apache POI 5.2.3** | Read Word documents -- DOCX via `XWPFDocument`, DOC via `HWPFDocument` (WordToPdf, PdfToWord) |
| **Google ML Kit Text Recognition 16.0.0** | On-device OCR for text extraction from images and scanned PDF pages |
| **`react-native-html-to-pdf`** | Image-to-PDF conversion via HTML template rendering |
| **JNI `edge_processor`** | Native C/C++ library for document contour detection and perspective warp (Scanner) |

### Processing Paradigms

Two distinct approaches coexist:

1. **Render-based (rasterization)**: Used by Compressor, Merger, Splitter, Signer, ToImage, PageManager, OCR, Scanner. Opens PDF with `PdfRenderer`, renders pages as bitmaps, then writes bitmaps to a new `PdfDocument`. **Trade-off**: Output loses text searchability, vector graphics, bookmarks, form fields, and font data. Text becomes image pixels.

2. **Structural (document model)**: Used by Protector, Unlock, ToWord, WordToPdf. Manipulates the PDF document model directly via PdfBox. **Advantage**: Preserves text, fonts, and structure.

### Memory Management

All native modules implement consistent memory safety:
- `MAX_BITMAP_PIXELS` cap (~50 million pixels)
- `RGB_565` pixel format (2 bytes/pixel instead of 4)
- Bitmap recycling in `finally` blocks
- Periodic `System.gc()` calls
- Two-pass bitmap loading with `inSampleSize` (Scanner)

---

## 6. Data Flow Mapping

### Typical PDF Tool Flow

```
User Action                    Logic Layer                  Processing                    Output
─────────────                  ───────────                  ──────────                    ──────
1. Tap tool on HomeScreen  →   Navigate to feature screen
2. Pick file (FilePicker)  →   filePicker.ts calls          NativeModules.FilePicker      → Returns local file path
                               FilePicker.pickPdfFile()      (Android SAF intent)
3. Pre-flight analysis     →   pdfPreflightService.ts       NativeModules.PdfPreflight    → Severity/recommendations
                               calls analyzePdf()            (PdfRenderer page analysis)
4. Feature gate check      →   FeatureGateContext checks    usageLimitService.ts          → Proceed / Show rewarded ad
                               canProceedWithFeature()       (AsyncStorage daily count)
5. Process PDF             →   Feature-specific service     NativeModules.Pdf*            → Temp file in cache dir
                               (e.g., pdfCompressor.ts)      (Kotlin + PdfRenderer/PdfBox)
6. Progress updates        →   NativeEventEmitter listens   ProgressTracker.kt emits      → ProgressModal UI updates
                               for progress events           events every 100ms
7. Move to Downloads       →   Service moves temp file      react-native-fs               → Final file in
                               to Downloads/PDFSmartTools/                                   Downloads/PDFSmartTools/
8. Record usage            →   consumeFeatureUse()          usageLimitService.ts          → AsyncStorage updated
9. Track for rating        →   RatingContext.trackAction()  ratingService.ts              → Prompt after 3 actions
10. Show result            →   Screen shows success modal   AppModal component            → Share/open options
```

### Deep Linking Flow (External PDF)

```
External App (file manager, email, etc.)
  → Android ACTION_VIEW intent (application/pdf MIME)
    → IntentModule.kt copies to cache
      → intentService.ts notifies JS
        → deepLinkingService.ts processes URI
          → Navigation resets to [Main, PdfViewer]
            → User views PDF
```

### Ad / Monetization Flow

```
User attempts action → FeatureGateContext.canProceedWithFeature()
  → usageLimitService.canUse(feature)
    ├── Has uses remaining → Proceed
    └── Limit exceeded → featureGateService shows callback modal
        → User watches RewardedAd → Proceed
        → User declines → Blocked
```

**No operations are mocked.** Every flow described above executes real processing.

---

## 7. Security Review

### File Handling

| Area | Status | Details |
|------|--------|---------|
| **Filename Sanitization** | Strong | `filePicker.ts` implements comprehensive sanitization: strips path traversal (`..`), normalizes unicode, removes leading dots, collapses consecutive dots, ensures valid extensions |
| **Content URI Handling** | Good | Files from `content://` URIs are copied to app cache before processing -- avoids permission revocation issues |
| **Temp File Cleanup** | Good | `cacheCleanupService.ts` removes stale files (>24h) on app startup; recognizes temp file patterns |
| **Atomic Writes** | Good | Native modules use temp file + rename pattern to prevent partial/corrupt output |
| **Error Message Sanitization** | Good (post-audit) | Multiple native modules sanitize error messages to prevent leaking sensitive info (passwords, file paths) |

### Permissions

Declared in `AndroidManifest.xml`:

| Permission | Scope | Risk |
|------------|-------|------|
| `INTERNET` | Always | Low -- used for ads and app updates only |
| `READ_EXTERNAL_STORAGE` | maxSdkVersion=32 | Medium -- scoped to legacy devices |
| `WRITE_EXTERNAL_STORAGE` | maxSdkVersion=29 | Medium -- scoped to legacy devices |
| `READ_MEDIA_IMAGES` | API 33+ | Low -- scoped media access |
| `CAMERA` | Always | Medium -- required for document scanner |
| `BILLING` | Always | Low -- Google Play billing |

### Identified Risks

| Risk | Severity | Details |
|------|----------|---------|
| **No certificate pinning** | Low | No network requests beyond ads/Play Store -- minimal attack surface |
| **Hardcoded ad unit IDs** | Low | Ad unit IDs in `adService.ts` -- standard practice for mobile ads |
| **Same ad unit ID for banner and interstitial** | Bug | `ca-app-pub-2002876774760881/9314442021` used for both `BANNER` and `INTERSTITIAL` types in `adService.ts` -- should be separate IDs |
| **No file encryption at rest** | Medium | Processed PDFs in `Downloads/PDFSmartTools/` are unencrypted and accessible to other apps |
| **Privacy policy URL unverified** | Low | `https://pdfsmarttools.com/privacy` linked from Settings -- not verified if live |
| **No ProGuard/R8 obfuscation config** | Medium | No custom ProGuard rules observed for native modules |
| **AsyncStorage for sensitive data** | Low | Usage limits, settings stored in AsyncStorage (unencrypted). No passwords or tokens stored. |

---

## 8. Missing Critical Components (For SaaS-Level Product)

Compared to Smallpdf / iLovePDF / Adobe Acrobat, the following are absent:

### Completely Missing

| Component | Impact |
|-----------|--------|
| **User Authentication** | No login, registration, profiles. Cannot identify users across devices |
| **Cloud Storage & Sync** | No file storage, no cross-device access, no file history |
| **Backend Server** | No API server for processing, storage, or user management |
| **Analytics & Crash Reporting** | No usage analytics, no crash reports, no performance monitoring |
| **Digital Signatures (PKCS#7)** | Current signing is visual overlay only -- not legally-binding cryptographic signatures |
| **PDF Form Filling** | No support for interactive PDF forms (text fields, checkboxes, dropdowns) |
| **PDF Annotation** | No highlighting, underlining, sticky notes, or drawing on PDFs |
| **PDF Editing (Text)** | No direct text editing within PDFs |
| **PDF Watermarking (standalone)** | Watermarks exist only as free-user markers, not as a user feature |
| **Batch Processing** | Cannot process multiple files in one operation (except merge) |
| **Multi-language OCR** | Only Latin script supported (ML Kit `TextRecognizerOptions.DEFAULT_OPTIONS`) |
| **iOS Support** | All native modules are Android-only. iOS is scaffolded but non-functional |
| **Web Version** | No web app or PWA |
| **Localization / i18n** | All strings are hardcoded in English |
| **Accessibility (a11y)** | No `accessibilityLabel`, `accessibilityRole`, or screen reader support observed |
| **Onboarding / Tutorial** | No first-run experience or feature tour |
| **Push Notifications** | No notification system |

### Incomplete / Partial

| Component | Current State | What's Missing |
|-----------|---------------|----------------|
| **Subscriptions** | UI exists, logic stubbed, IAP imported but disabled | Enable `FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED`, uncomment IAP code, test purchase flow, add receipt validation |
| **PDF Viewer** | Basic rendering via `react-native-pdf` | No search-in-PDF, no page thumbnails sidebar, no bookmarks, no text selection |
| **PDF Merge** | Render-based (rasterizes pages) | Structural merge to preserve text, bookmarks, links, form fields |
| **Pro Features UI** | `ProGate` component, `UpgradePromptModal` exist | Wired but non-functional since subscriptions are disabled |
| **Save Location** | Displayed in Settings, fixed to `Downloads/PDFSmartTools/` | Not user-configurable despite having a modal |
| **Terms of Service links** | Pressable elements in ProScreen | No `onPress` handler -- links do nothing |
| **Test Coverage** | 6 test files (utilities + services) | No screen tests, no integration tests, no E2E tests |
| **Error Reporting to User** | Per-module error handling | No centralized error boundary, no crash recovery UI |

### UI-Level Only (No Functional Backend)

| Component | Details |
|-----------|---------|
| **Cloud Backup** | Listed as "Coming soon" in Pro features list -- no implementation |
| **Terms of Service** | Pressable text in `ProScreen` with no navigation or URL |

---

## 9. Code Quality Audit

### Scalability Readiness: 5/10

**Strengths:**
- Feature-per-folder screen organization scales well for additional tools
- Native module pattern is consistent and repeatable
- Service layer cleanly abstracts native modules from UI

**Weaknesses:**
- No dependency injection -- services import `NativeModules` directly
- No API abstraction layer for future backend integration
- Empty architectural directories (`features/`, `hooks/`, `store/`) suggest an unfinished refactoring
- `MainApplication.kt` manually registers 17 packages -- should use autolinked or plugin-based discovery
- No CI/CD pipeline configuration found
- No environment-based configuration (dev/staging/prod)

### Separation of Concerns: 7/10

**Strengths:**
- Clear boundary between UI (screens/components) and business logic (services)
- Native modules encapsulate all platform-specific code
- Contexts provide clean state management without prop drilling
- Theme system is fully separated from component logic

**Weaknesses:**
- `HomeScreen.tsx` contains a large `handleToolPress` function with 14 if-else branches -- should use a route map
- Some screens directly import native modules instead of going through services
- The `subscriptionService.ts` barrel file re-exports only 9 of 30 services -- inconsistent import patterns

### Reusability: 7/10

**Strengths:**
- Custom component library (`Button`, `Card`, `Text`, `Icon`, `AppModal`) is well-designed and reusable
- `ProgressTracker` class (both Kotlin and TypeScript) provides standardized progress across all tools
- `ProgressModal` component is shared across all feature screens
- `safeOperations.ts` utilities (`withTimeout`, `withCleanup`, `createRetryableOperation`) are generic and reusable
- Theme tokens (colors, spacing, typography, shadows) enable consistent styling

**Weaknesses:**
- `Icon` component uses emoji mapping -- not scalable (should migrate to vector icons)
- `SignaturePad` is tightly coupled to `react-native-svg` + `react-native-gesture-handler` + `react-native-view-shot`
- No shared hook library despite `src/hooks/` existing as empty directory

### Technical Debt Level: Moderate

| Debt Item | Severity |
|-----------|----------|
| Commented-out IAP code in `subscriptionService.ts` (~200 lines) | Medium |
| Empty directories (`features/`, `hooks/`, `store/`, `services/analytics/`, `services/permissions/`, `services/storage/`) | Low |
| `nul` file (3.3MB) in project root -- appears to be accidental Windows NUL redirect | Low |
| Render-based merge/compress/split loses PDF fidelity | High |
| Same ad unit ID for banner and interstitial | Low |
| No TypeScript strict mode for native module interfaces | Medium |
| Pre-existing TypeScript errors with react-native module types | Low |
| `patch-package` patches exist but not audited | Low |
| Version stuck at 0.0.1 | Low |
| TODO comments scattered across 10+ files for subscription re-enablement | Medium |

---

## 10. Project Maturity Score

### Score: 6.0 / 10

### Reasoning

| Category | Score | Weight | Rationale |
|----------|-------|--------|-----------|
| **Core Feature Completeness** | 8/10 | 30% | 15 tools fully implemented with real native processing. All are functional end-to-end. |
| **Code Architecture** | 7/10 | 15% | Clean layered structure, good separation of concerns, consistent patterns. Empty planned directories and some tight coupling hold it back. |
| **Production Readiness** | 4/10 | 20% | No analytics, no crash reporting, no CI/CD, no E2E tests, disabled monetization, no backend, no i18n, no accessibility. |
| **Monetization** | 3/10 | 10% | Ads work, but subscriptions are fully disabled. No revenue path beyond ad impressions. Usage limits exist but cannot be lifted via purchase. |
| **Platform Coverage** | 3/10 | 10% | Android-only. No iOS, no web. |
| **Testing** | 3/10 | 10% | 6 unit test files covering utilities/services only. No component tests, no integration tests, no E2E tests. |
| **Security** | 6/10 | 5% | Post-audit hardening applied. Good filename sanitization, error message sanitization, atomic writes. Missing encryption at rest and ProGuard config. |

**Summary**: The project has a solid, functional core with 15 working PDF tools backed by real native processing. The code architecture is clean and consistent. However, it lacks the infrastructure layer required for a production SaaS product: no backend, no analytics, no crash reporting, disabled monetization, minimal testing, and Android-only platform support. It is a strong prototype / MVP that requires significant infrastructure investment before competing at the Smallpdf/iLovePDF tier.
