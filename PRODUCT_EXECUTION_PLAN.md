# PRODUCT EXECUTION PLAN

**Project:** PDFSmartTools
**Platform:** Android (React Native 0.83.1 + Kotlin 2.1.20)
**PDF Engine:** Apache PDFBox Android 2.0.27.0
**Goal:** Revenue-generating offline PDF utility competing with iLovePDF/Adobe on Android
**Status:** Pre-launch (versionCode 1, subscriptions disabled, no Play Store listing)

---

## PHASE 1 -- Architecture Hardening

### Objective

Eliminate structural gaps that would cause production crashes, data loss, or unrecoverable errors before any user-facing release.

### Why This Phase Matters

The codebase has no React error boundary, no crash reporting, and several architectural inconsistencies. Shipping without these guarantees means crashes are invisible, users churn silently, and bugs cannot be triaged.

### Technical Implementation Tasks

#### 1.1 Add React Error Boundary Component

- Create `src/presentation/components/error/ErrorBoundary.tsx`
- Implement `componentDidCatch` and `getDerivedStateFromError`
- Render a fallback UI with: error description, "Restart" button (resets navigation to Home), "Report" button (copies error to clipboard)
- Wrap `RootNavigator` inside `ErrorBoundary` in `src/app/AppProviders.tsx` (insert between `FeatureGateProvider` and `{children}`)
- Add per-screen try-catch in each screen's top-level render using `ErrorBoundary` wrappers for isolated recovery

#### 1.2 Fix ProgressTracker Throttling Bug

- In `android/app/src/main/java/com/pdfsmarttools/common/ProgressTracker.kt`, line ~57: `lastUpdateTime` is updated AFTER the throttle check, causing the first call to always pass and subsequent rapid calls to potentially skip
- Fix: Move `lastUpdateTime = now` inside the "should update" branch, not after the throttle check
- Verify with unit test: emit 20 progress events within 50ms, assert only 1-2 are actually emitted

#### 1.3 Move FilePickerModule to Correct Package

- `android/app/src/main/java/com/pdfsmarttools/pdfcompressor/FilePickerModule.kt` is misplaced
- Create `android/app/src/main/java/com/pdfsmarttools/filepicker/` package
- Move `FilePickerModule.kt` and create `FilePickerPackage.kt` in the new package
- Update `MainApplication.kt` package registration

#### 1.4 Extract Engine Logic from Large Modules

- `PdfToImageModule.kt` (~400+ lines): Extract rendering loop to `PdfToImageEngine.kt`
- `PdfPageManagerModule.kt` (~500+ lines): Extract thumbnail/rotation logic to `PdfPageManagerEngine.kt`
- `PdfSignerModule.kt` (~300+ lines): Extract rendering loop to `PdfSignerEngine.kt`
- Keep modules as thin bridge adapters: parameter conversion, Promise handling, event emission only

#### 1.5 Add Android onTrimMemory Integration

- In `MainApplication.kt`, override `onTrimMemory(level: Int)`
- On `TRIM_MEMORY_RUNNING_LOW` or higher: call `System.gc()`, log memory state via `PdfBoxHelper.currentMemoryMb()`
- On `TRIM_MEMORY_COMPLETE`: cancel any active operation via a global cancellation registry

#### 1.6 Fix Interstitial Ad Unit ID Duplication

- In `src/domain/ads/adService.ts`: `BANNER` and `INTERSTITIAL` production IDs are identical (`ca-app-pub-2002876774760881/9314442021`)
- Create a separate interstitial ad unit in AdMob console
- Replace the duplicated ID

### Architecture Changes

- New directory: `src/presentation/components/error/`
- New package: `com.pdfsmarttools.filepicker`
- New engine files: `PdfToImageEngine.kt`, `PdfPageManagerEngine.kt`, `PdfSignerEngine.kt`

### Risks

- Error boundary may swallow errors that should propagate (mitigate: log all caught errors before rendering fallback)
- Moving FilePickerModule changes its React Native name string -- verify `NativeModules.FilePickerModule` resolution still works

### Success Criteria

- App survives a deliberate `throw new Error()` in any screen render without white-screen crash
- ProgressTracker emits max 10 events/second under load
- No module file exceeds 200 lines of business logic (bridge code excluded)

### Exit Condition

All 6 tasks merged. Manual crash injection test passes. Clean `npx react-native run-android --mode=release` build.

### Estimated Complexity

**Medium**

---

## PHASE 2 -- Core Engine Optimization

### Objective

Improve PDF processing throughput, reduce memory peaks, and fix correctness issues in the native engines.

### Why This Phase Matters

Current engines process pages sequentially with no streaming. Compression of a 100-page image-heavy PDF takes 30-60 seconds. OCR runs at ~1-2 pages/second. These times are uncompetitive with native apps that parallelize or stream.

### Technical Implementation Tasks

#### 2.1 Implement Page-Level Parallel Processing for Compression

- In `PdfCompressorEngine.kt`, replace the sequential page loop with a coroutine-based parallel processor
- Use `Dispatchers.Default` (CPU-bound) with a concurrency limit of `Runtime.getRuntime().availableProcessors() / 2` (leave cores for UI)
- Use `Semaphore(concurrency)` to limit simultaneous bitmap allocations
- Collect results via `async/await` per page, reinsert in order
- Challenge: PDFBox `PDDocument` is not thread-safe for mutation -- pages must be processed independently and results merged

#### 2.2 Implement Parallel OCR Processing

- In `PdfOcrEngine.kt`, render and OCR pages in parallel batches
- Pipeline: Render page N while ML Kit processes page N-1
- Use Kotlin `Channel` for producer-consumer pattern:
  - Producer coroutine: renders pages to bitmaps, sends to channel
  - Consumer coroutine: runs ML Kit inference, builds text layer
- Limit channel buffer to 3 (max 3 bitmaps in memory simultaneously)

#### 2.3 Optimize Bitmap Allocation in PDF-to-Image

- Current: Creates new bitmap per page, recycles after save
- Optimization: Reuse a single bitmap buffer for same-dimension pages (common in scanned PDFs)
- In `PdfToImageModule.kt`: Track previous bitmap dimensions, call `bitmap.eraseColor(Color.WHITE)` and reuse if dimensions match
- Reduces GC pressure by 60-80% for uniform documents

#### 2.4 Add Streaming Content URI Resolution

- `PdfBoxHelper.resolveInputFile()` currently copies entire content:// URI to cache before processing
- For split/extract operations that only need a page range: implement a `ParcelFileDescriptor`-based approach using `ContentResolver.openFileDescriptor()` directly with `PdfRenderer`
- Eliminates the full-file copy for viewer, thumbnail, and single-page operations

#### 2.5 Fix ScanPdfModule Threading Inconsistency

- `ScanPdfModule.kt` uses `Executors.newSingleThreadExecutor()` while all other modules use Kotlin coroutines
- Migrate to `CoroutineScope(Dispatchers.IO + SupervisorJob())`
- Add cancellation support (currently absent in ScanPdfModule)
- Add progress events (currently absent -- only module without progress reporting)

#### 2.6 Reduce PDFBox Memory Footprint for Large Documents

- When loading PDFs purely for page count or metadata extraction (preflight, getPageCount), use `PDDocument.load(file, MemoryUsageSetting.setupTempFileOnly())`
- This offloads stream data to temp files instead of heap
- Apply in: `PdfMergerEngine.getPageCount()`, `PdfSplitterEngine.getPageCount()`, `PdfPreflightModule.analyzePdf()`

### Architecture Changes

- New utility: `ParallelPageProcessor.kt` in `common/` -- reusable coroutine-based page processing framework
- New utility: `BitmapPool.kt` in `common/` -- bitmap reuse for same-dimension pages

### Risks

- PDFBox thread-safety: `PDDocument` modification is not thread-safe. Parallel reads are safe; parallel writes require synchronization or separate documents
- ML Kit thread-safety: `TextRecognizer` is thread-safe for concurrent `process()` calls per Google documentation
- Bitmap reuse may produce visual artifacts if `eraseColor` is insufficient -- validate with before/after checksums

### Success Criteria

- Compression of 100-page PDF (MEDIUM level) completes in < 20 seconds (down from 30-60s)
- OCR throughput reaches 3-5 pages/second (up from 1-2)
- Memory peak during merge of 5x50MB PDFs stays under 300MB
- ScanPdfModule supports cancellation and progress events

### Exit Condition

All 6 tasks merged. Benchmark suite passes. No regression in existing test suite (118 tests).

### Estimated Complexity

**High**

---

## PHASE 3 -- PDF Signing Rewrite

### Objective

Replace the current bitmap-overlay signing approach with structural PDF annotation-based signing that preserves text selectability, searchability, and file size.

### Why This Phase Matters

The current `PdfSignerModule` re-renders every page of the PDF as a bitmap and composites the signature as an image overlay. This destroys text layers, inflates file size 3-10x, and breaks accessibility. Users who sign a 1MB text PDF get back a 10MB image-based PDF they cannot search or copy from.

### Technical Implementation Tasks

#### 3.1 Research PDFBox Annotation API

- PDFBox supports `PDAnnotationRubberStamp` and custom appearance streams via `PDAppearanceDictionary`
- Alternative: Use `PDPageContentStream` in APPEND mode to draw the signature image on top of existing content (preserves underlying text layer)
- Decision: Use `PDPageContentStream(document, page, AppendMode.APPEND, true, true)` approach -- simpler and more reliable than annotation streams

#### 3.2 Implement Structural Signing Engine

- Create `android/app/src/main/java/com/pdfsmarttools/pdfsigner/PdfSignerEngine.kt`
- Load input PDF with `PDDocument.load(file)`
- For the target page:
  - Decode signature Base64 to `android.graphics.Bitmap`
  - Convert Bitmap to `PDImageXObject` using `JPEGFactory.createFromImage(document, bitmap, 0.95f)`
  - Open `PDPageContentStream(document, page, AppendMode.APPEND, true, true)`
  - Call `contentStream.drawImage(signatureImage, x, y, width, height)`
  - Close content stream
- Save via `PdfBoxHelper.atomicSave()`
- Validate output

#### 3.3 Handle Coordinate System Translation

- PDF coordinate system: origin at bottom-left, Y increases upward
- Android coordinate system: origin at top-left, Y increases downward
- Translation formula: `pdfY = pageHeight - androidY - signatureHeight`
- Update `PdfSignerModule.kt` to apply this translation before passing to engine
- Update `src/native/pdfSigner.ts` types to document coordinate expectations

#### 3.4 Preserve Non-Signed Pages Without Re-Rendering

- Current approach renders ALL pages as bitmaps (even unsigned ones)
- New approach: Only modify the signed page. All other pages pass through untouched
- Use `PDDocument.save()` directly -- PDFBox only rewrites modified pages

#### 3.5 Add Watermark via Content Stream (Not Bitmap)

- Current free-user watermark is drawn on Canvas (bitmap-based)
- New approach: Use `PDPageContentStream` with `PDExtendedGraphicsState` (alpha) to draw text watermark
- Reuse `PdfBoxHelper.addWatermarkToPage()` which already implements this pattern
- Apply watermark only to signed page for free users

#### 3.6 Update Module Bridge

- Simplify `PdfSignerModule.kt` to be a thin bridge:
  - Validate inputs
  - Call `PdfSignerEngine.signPdf()`
  - Emit progress events
  - Resolve Promise
- Remove all Bitmap rendering, Canvas drawing, and PdfDocument (Android) code
- Remove `PdfRenderer` import -- no longer needed

#### 3.7 Add Regression Tests

- Test 1: Sign a text PDF, verify output is searchable (extract text with PDFTextStripper, compare)
- Test 2: Sign a 10-page PDF, verify file size increase is < 200KB (signature image only, not full re-render)
- Test 3: Verify signature position matches input coordinates after Y-axis translation
- Test 4: Verify non-signed pages are byte-identical to input

### Architecture Changes

- New file: `PdfSignerEngine.kt` (replaces bitmap logic in module)
- Deleted: All `PdfRenderer`, `PdfDocument`, `Canvas`, `Bitmap` usage from signing flow
- Modified: `PdfSignerModule.kt` becomes thin bridge

### Risks

- PDFBox's `PDPageContentStream` in APPEND mode may conflict with existing content streams on complex PDFs (encrypted, linearized)
- Signature transparency: JPEG compression removes alpha channel. Use PNG-based `LosslessFactory.createFromImage()` instead if transparency is required
- Performance regression: `PDDocument.load()` for structural signing may be slower than `PdfRenderer` for very large files (mitigate: pre-flight check)

### Success Criteria

- Signed PDF retains full text selectability (verified by PDFTextStripper extraction)
- File size increase is proportional to signature image size only (< 500KB for typical signature)
- Signing a 100-page PDF takes < 5 seconds (structural, not rendering all pages)
- Visual position matches input coordinates within 2px tolerance

### Exit Condition

All 7 tasks merged. Text extraction test passes on 10 sample PDFs. File size regression test passes.

### Estimated Complexity

**High**

---

## PHASE 4 -- Performance Optimization

### Objective

Reduce operation times, eliminate UI jank during progress updates, and optimize memory usage across all operations.

### Why This Phase Matters

User retention in utility apps correlates directly with perceived speed. A 60-second compression that could be 15 seconds is a 1-star review waiting to happen. Memory-related crashes on mid-range devices (3-4GB RAM) are the most common production failure mode.

### Technical Implementation Tasks

#### 4.1 Implement React.memo on Expensive Components

- Wrap all screen-level components with `React.memo()`:
  - `HomeScreen`, `RecentFilesScreen`, `SettingsScreen`, `PdfViewerScreen`
- Wrap sub-components that receive stable props:
  - `ToolCard`, `ToolListItem`, `FileCard` in `HomeScreen`
  - `ProgressModal`, `ProgressBar` in feedback components
- Add `useMemo` for computed values in large screens (style objects, filtered lists)

#### 4.2 Optimize Progress Update Rendering

- Current: Each progress event triggers `setState` → full screen re-render
- Optimization: Use `useRef` for progress state, update `ProgressModal` via direct ref manipulation
- Alternative: Move `ProgressModal` to its own context with `React.memo` isolation so progress updates do not re-render the parent screen
- Measure: Profile with React DevTools before/after, target < 2ms per progress update render

#### 4.3 Reduce GC Frequency in Native Engines

- Current: `System.gc()` called every 3-5 pages
- Issue: GC pauses cause 50-200ms jank visible in progress animations
- Change: Remove explicit `System.gc()` calls. Rely on bitmap recycling and `finally` blocks
- Monitor: Log heap usage via `PdfBoxHelper.currentMemoryMb()` at page boundaries. Only trigger `System.gc()` if heap exceeds 80% of `Runtime.maxMemory()`

#### 4.4 Implement Lazy Image Loading for Home Screen

- `HomeScreen.tsx` renders 16 tool cards on mount with animations
- Optimization: Use `FlatList` with `initialNumToRender={8}` and `windowSize={3}` instead of ScrollView
- Add `getItemLayout` for fixed-height cards to skip measurement

#### 4.5 Reduce Bridge Event Overhead

- Current ProgressTracker throttles to 100ms (10 events/second)
- For long operations (100+ pages): Increase throttle to 250ms (4 events/second)
- In `ProgressTracker.kt`: Accept `minUpdateInterval` as constructor parameter
- Pass 250ms for compression, OCR, PDF-to-image; keep 100ms for fast operations (protect, unlock)

#### 4.6 Add Memory Budget System

- Create `MemoryBudget.kt` in `common/`:
  - `availableMemoryMb()`: `Runtime.maxMemory() - (totalMemory - freeMemory)`
  - `canAllocateBitmap(width, height, bytesPerPixel)`: Check if bitmap fits in budget
  - `reserveMemory(bytes)` / `releaseMemory(bytes)`: Track active allocations
- Integrate into all raster operations: check budget before `Bitmap.createBitmap()`
- If budget exceeded: reduce dimensions by 50% and retry, or reject with user-friendly error

### Architecture Changes

- New file: `android/app/src/main/java/com/pdfsmarttools/common/MemoryBudget.kt`
- Modified: All engine files to use `MemoryBudget` before bitmap allocation
- Modified: `ProgressTracker.kt` constructor signature

### Risks

- Removing `System.gc()` may increase peak memory on devices with slow GC. Monitor via telemetry (Phase 7).
- `React.memo` with incorrect dependency arrays can cause stale renders. Use `useCallback` consistently.

### Success Criteria

- Home screen FPS stays at 60fps during scroll (measured via Android GPU profiler)
- Progress updates cause < 2ms render time (measured via React Profiler)
- No `System.gc()` calls except emergency threshold
- Memory peak for any operation stays within 75% of `Runtime.maxMemory()`

### Exit Condition

All 6 tasks merged. Performance benchmarks documented. No regression in test suite.

### Estimated Complexity

**High**

---

## PHASE 5 -- Monetization Activation

### Objective

Complete Google Play Billing integration, activate the subscription system, and enable Pro tier revenue.

### Why This Phase Matters

The app currently generates zero revenue. Ad revenue alone ($0.50-2 eCPM) cannot sustain development. Subscriptions at $2-5/month are the primary revenue model for utility apps.

### Technical Implementation Tasks

#### 5.1 Set Up Google Play Console Products

- Create subscription products in Google Play Console:
  - `pro_monthly`: Monthly auto-renewing, $2.99/month (₹199)
  - `pro_yearly`: Yearly auto-renewing, $19.99/year (₹999), show as ₹83/month
- Configure base plans with backward-compatible pricing
- Set up offer phases if needed (free trial, introductory price)
- Note: SKUs already defined in `subscriptionService.ts` as `SUBSCRIPTION_SKUS`

#### 5.2 Implement Full BillingClient Integration

- Uncomment and fix the `react-native-iap` integration in `src/domain/subscription/subscriptionService.ts`
- Implement the full flow:
  1. `initializeIAP()`: Call `initConnection()`, set up purchase listeners via `purchaseUpdatedListener` and `purchaseErrorListener`
  2. `getSubscriptionProducts()`: Call `getSubscriptions([pro_monthly, pro_yearly])`, extract pricing from `subscriptionOfferDetailsAndroid`
  3. `purchaseSubscription(sku)`: Call `requestSubscription({sku, subscriptionOffers})`, handle offer tokens
  4. `restorePurchases()`: Call `getAvailablePurchases()`, validate receipts, update cached status
  5. `finalizeIAP()`: Call `endConnection()` on app termination
- Handle purchase states: `PURCHASED`, `PENDING`, `UNSPECIFIED_STATE`
- Call `finishTransaction()` after acknowledgment to prevent auto-refund

#### 5.3 Implement Receipt Validation

- For offline-first: Use local-only validation initially
  - Verify purchase token exists and is not expired
  - Cache status in AsyncStorage with expiration check
- Future: Add server-side validation endpoint for anti-piracy (Phase 12)
- Storage keys already defined: `@subscription_is_pro`, `@subscription_data`

#### 5.4 Enable Feature Flag

- In `src/config/featureFlags.ts`: Change `SUBSCRIPTIONS_ENABLED: false` to `SUBSCRIPTIONS_ENABLED: true`
- Verify all dependent code paths activate correctly:
  - `SubscriptionContext.tsx`: IAP initialization, product fetching, purchase flow
  - `ProScreen.tsx`: Plan selection UI, subscribe button
  - `ProGate.tsx`: Feature gating for Pro-only content
  - `UpgradePromptModal.tsx`: Upgrade prompt rendering
  - `featureGateService.ts`: Ad gate shows "Upgrade to Pro" option alongside "Watch Ad"

#### 5.5 Implement Subscription Status Caching with TTL

- On purchase: Cache `{ isPro: true, productId, purchaseDate, expirationDate }` to AsyncStorage
- On app launch: Check cached status. If expired (monthly > 30 days, yearly > 365 days), re-validate via `getAvailablePurchases()`
- On restore: Overwrite cache with server truth
- Offline handling: If cache exists and not expired, trust it. If network unavailable and cache expired, show grace period (3 days)

#### 5.6 Add Subscription Lifecycle Handlers

- Handle upgrade (monthly → yearly): Cancel old, start new, prorate
- Handle downgrade (yearly → monthly): Apply at renewal
- Handle cancellation: Continue access until period ends, then revert to free
- Handle billing retry: Google handles retry automatically; listen for `PENDING` state
- Handle price change: Re-acknowledge if required by Play Store policy

#### 5.7 Update UpgradePromptModal Integration

- When daily limit is reached in `FeatureGateContext.tsx`, show both options:
  - "Watch Ad" (existing flow)
  - "Upgrade to Pro" (navigate to ProScreen)
- Track conversion: Add `featureGateUpgradeClicks` counter in AsyncStorage for analytics

#### 5.8 Add Restore Purchase Flow

- In `ProScreen.tsx`: "Restore Purchase" button already exists
- Connect to `subscriptionService.restorePurchases()`
- Handle: no previous purchase found, purchase found and restored, network error
- Show appropriate notification via `SubscriptionContext.notification`

### Architecture Changes

- Modified: `src/config/featureFlags.ts` (enable flag)
- Modified: `src/domain/subscription/subscriptionService.ts` (full implementation)
- Modified: `src/presentation/context/SubscriptionContext.tsx` (activate all flows)
- Modified: `src/presentation/context/FeatureGateContext.tsx` (add upgrade option)

### Risks

- Google Play Billing requires a signed APK uploaded to Play Console for testing (even internal testing track)
- Purchase acknowledgment must happen within 3 days or Google auto-refunds
- Currency handling: `subscriptionOfferDetailsAndroid` returns localized pricing. Do not hardcode ₹ symbol; use `localizedPrice` from product details
- Race condition: User purchases on device A, opens app on device B. `getAvailablePurchases()` must sync

### Success Criteria

- Complete purchase flow works on Play Console internal test track
- Restore purchase works after app reinstall
- Pro status correctly enables: no ads, no watermarks, no daily limits, no page restrictions
- Subscription cancellation correctly reverts to free at period end
- Cached status survives offline periods of up to 3 days

### Exit Condition

All 8 tasks merged. End-to-end purchase tested on internal test track. Restore purchase verified after reinstall.

### Estimated Complexity

**High**

---

## PHASE 6 -- UX & Conversion Optimization

### Objective

Improve visual polish, user flow clarity, and free-to-Pro conversion rate.

### Why This Phase Matters

Conversion rate from free to Pro is the single highest-leverage metric. A 1% improvement in conversion rate at 100K users = 1,000 additional subscribers. UX friction directly reduces conversion.

### Technical Implementation Tasks

#### 6.1 Replace Emoji Icons with Vector Icon Library

- Install `react-native-vector-icons` or `phosphor-react-native`
- Replace all emoji usage in `src/presentation/components/ui/Icon.tsx` (40+ icon names)
- Update `HomeScreen.tsx` tool icons: replace emoji strings with vector icon components
- Update `ProScreen.tsx`, `SettingsScreen.tsx`, all modal icons
- Ensure consistent sizing and color theming

#### 6.2 Add Onboarding Flow

- Create `src/presentation/screens/onboarding/OnboardingScreen.tsx`
- 3-screen horizontal swiper:
  - Screen 1: "All-in-One PDF Tools" (feature grid preview)
  - Screen 2: "100% Offline & Private" (privacy positioning)
  - Screen 3: "Upgrade for Unlimited Access" (Pro pitch with trial CTA)
- Show once on first launch (track via AsyncStorage `@onboarding_complete`)
- Add route to `RootNavigator.tsx` as initial route when not completed

#### 6.3 Add Success Screen with Upsell

- After each free operation, show success modal with:
  - File details (name, size, page count)
  - Action buttons (Share, Open, Save)
  - Remaining daily uses counter: "2 of 3 compressions remaining today"
  - When remaining = 1: Show "Go Pro for unlimited" inline prompt
  - When remaining = 0: Show "You've used all free compressions. Upgrade to Pro."

#### 6.4 Optimize ProScreen Conversion Flow

- Add free trial option if Play Console supports it (7-day trial)
- Show savings calculation dynamically: "Save X% with yearly plan"
- Add social proof: "Join X+ Pro users" (track install count)
- Add feature comparison table: Free vs Pro side-by-side
- Move "Restore Purchase" to bottom (de-emphasize)

#### 6.5 Implement Dark Mode Polish

- `ThemeContext.tsx` already supports light/dark/system
- Audit all screens for hardcoded colors that ignore theme:
  - Check all `StyleSheet.create()` calls for `#ffffff`, `#000000`, or other literal colors
  - Replace with `theme.background`, `theme.text`, etc.
- Test every screen in dark mode manually

#### 6.6 Add Haptic Feedback

- Install `react-native-haptic-feedback`
- Add subtle haptic on: button press, file pick success, operation complete, error
- Use `HapticFeedbackTypes.impactLight` for buttons, `notificationSuccess` for completion

#### 6.7 Improve Error Messages

- Audit all error modals across screens
- Replace technical messages with user-friendly alternatives:
  - "OUT_OF_MEMORY" → "This file is too large to process. Try a smaller file or close other apps."
  - "FILE_NOT_FOUND" → "The file could not be found. It may have been moved or deleted."
  - "PDF_CORRUPT" → "This PDF file appears to be damaged and cannot be processed."
- Add "Try Again" button on retryable errors, "OK" on non-retryable

### Architecture Changes

- New screen: `OnboardingScreen.tsx`
- New dependency: Icon library, haptic feedback library
- Modified: `Icon.tsx` complete rewrite
- Modified: All screens for dark mode audit

### Risks

- Icon library adds ~1-2MB to APK size (mitigate: use tree-shakeable library like Phosphor)
- Onboarding may increase time-to-first-action (mitigate: make skippable, max 3 screens)

### Success Criteria

- All screens render correctly in both light and dark mode
- No emoji characters visible in any UI element
- Onboarding completes in < 30 seconds
- Every error modal has a user-friendly message (no error codes visible to user)

### Exit Condition

All 7 tasks merged. Full visual QA pass in light and dark mode. Onboarding flow tested.

### Estimated Complexity

**Medium**

---

## PHASE 7 -- Crash Analytics & Telemetry

### Objective

Implement production crash reporting and usage analytics to enable data-driven iteration.

### Why This Phase Matters

Without crash data, production bugs are invisible. Without usage analytics, feature prioritization is guesswork. Without conversion funnel data, monetization optimization is impossible.

### Technical Implementation Tasks

#### 7.1 Integrate Firebase Crashlytics

- Add `@react-native-firebase/app` and `@react-native-firebase/crashlytics`
- Configure `google-services.json` in `android/app/`
- Add Firebase plugin to `android/app/build.gradle`
- Initialize in `MainApplication.kt` (auto-init)
- Enable native crash reporting (NDK crash handler)
- Set user properties: `isPro`, `appVersion`, `androidVersion`

#### 7.2 Add Custom Crash Context

- In `ErrorBoundary.tsx` (from Phase 1): Report JS errors to Crashlytics with component stack
- In every Kotlin module's catch block: Log non-fatal exceptions to Crashlytics with:
  - Operation type (merge, split, compress, etc.)
  - File size and page count
  - Device memory state
  - Compression level or other parameters
- Use `FirebaseCrashlytics.getInstance().recordException(exception)` for non-fatal reporting

#### 7.3 Integrate Firebase Analytics (Minimal)

- Add `@react-native-firebase/analytics`
- Track only essential events (privacy-first, no PII):
  - `operation_started`: { type, isPro, fileSize, pageCount }
  - `operation_completed`: { type, isPro, durationMs, outputSize }
  - `operation_failed`: { type, errorCode, fileSize }
  - `operation_cancelled`: { type, progressPercent }
  - `subscription_viewed`: { source }
  - `subscription_started`: { sku, price }
  - `subscription_restored`: {}
  - `ad_watched`: { type, feature }
  - `daily_limit_reached`: { feature, remaining }
- Create `src/infrastructure/analytics/analyticsService.ts` with typed event functions
- Disable analytics collection if user opts out (respect Android ad personalization setting)

#### 7.4 Add Performance Monitoring

- Add `@react-native-firebase/perf`
- Create custom traces for each operation type:
  - Start trace on operation begin, stop on complete/error
  - Add metrics: fileSize, pageCount, memoryPeakMb
- Monitor app startup time automatically
- Monitor screen render times for Home, PdfViewer, Settings

#### 7.5 Add ANR Detection

- Firebase Performance automatically detects ANRs
- Additionally: In `ProgressTracker.kt`, if elapsed time between updates exceeds 10 seconds, log a warning event
- In JS: If OperationManager receives no progress update for 15 seconds, log potential hang

#### 7.6 Privacy Compliance

- Add analytics opt-out toggle in `SettingsScreen.tsx` under "Privacy" section
- Store preference in AsyncStorage: `@analytics_enabled`
- When disabled: Call `analytics().setAnalyticsCollectionEnabled(false)` and `crashlytics().setCrashlyticsCollectionEnabled(false)`
- Default: Enabled (with disclosure in Privacy Policy)

### Architecture Changes

- New directory: `src/infrastructure/analytics/`
- New file: `analyticsService.ts`
- New dependency: `@react-native-firebase/app`, `crashlytics`, `analytics`, `perf`
- Modified: `android/app/build.gradle` (Firebase plugin)
- Modified: `SettingsScreen.tsx` (opt-out toggle)

### Risks

- Firebase adds ~2-3MB to APK size
- Analytics events must not contain file names, paths, or any user-identifiable content
- Crashlytics may conflict with Hermes source maps (configure `react-native-firebase` Hermes support)

### Success Criteria

- Crashes appear in Firebase console within 5 minutes of occurrence
- Non-fatal exceptions from native modules appear with full context
- All 9 event types fire correctly in debug mode
- Analytics opt-out completely stops all data collection

### Exit Condition

All 6 tasks merged. Firebase console shows test crash, test events, and performance traces.

### Estimated Complexity

**Medium**

---

## PHASE 8 -- Security Hardening

### Objective

Protect against reverse engineering, unauthorized Pro access, and data exposure.

### Why This Phase Matters

Android APKs are trivially decompilable. A cracked Pro version distributed on third-party sites eliminates subscription revenue. Sensitive data in logs or storage enables exploitation.

### Technical Implementation Tasks

#### 8.1 Implement ProGuard/R8 Optimization for App Code

- Current ProGuard only keeps library classes. App code is not protected.
- Add obfuscation rules for app code in `proguard-rules.pro`:
  ```
  -keep class com.pdfsmarttools.**.Module* { *; }
  -keep class com.pdfsmarttools.**.Package* { *; }
  ```
- Keep module/package classes (React Native reflection) but obfuscate engines and helpers

#### 8.2 Add Root Detection

- Integrate `rootbeer` library or implement basic checks:
  - Check for su binary
  - Check for root management apps (Magisk, SuperSU)
  - Check for test-keys build properties
- On rooted device: Show warning (do not block -- too many false positives), log to analytics
- Store check result for Crashlytics user properties

#### 8.3 Secure Subscription Status Storage

- Current: `isPro` stored as plain boolean in AsyncStorage (trivially editable on rooted devices)
- Implement signed storage:
  - Generate HMAC-SHA256 of subscription data using Android Keystore-derived key
  - Store `{ data, signature }` pair
  - On read: Verify signature before trusting `isPro` status
- Use `android.security.keystore` via a small native module

#### 8.4 Add Certificate Pinning for Billing Verification

- When server-side receipt validation is added (Phase 12), pin the server certificate
- For now: Pin Google Play Billing API certificates using `network_security_config.xml`
- Add `android/app/src/main/res/xml/network_security_config.xml` with Play Store domains

#### 8.5 Sanitize Production Logging

- Current: `createTaggedLogger()` logs to logcat. In production, WARN+ levels still emit.
- Audit all `logger.warn()` and `logger.error()` calls for sensitive data:
  - File paths (may reveal username/directory structure)
  - Page count + file size combinations (may fingerprint documents)
  - Error messages from PDFBox (may contain internal state)
- Replace file paths with hashed identifiers in production logs
- In `logger.ts`: Add `sanitizePath()` function that strips directory prefix

#### 8.6 Disable Debug Features in Release

- Verify `__DEV__` checks are used consistently:
  - Ad unit IDs: Already using test/production switch
  - Logger level: Already filters to WARN+ in production
- Add explicit checks for:
  - `usageLimitService.resetUsage()` -- should be no-op in release or removed
  - Any developer-facing buttons or debug menus

#### 8.7 Add Integrity Verification

- Use Google Play Integrity API to detect:
  - APK tampering (modified Pro flag)
  - Non-Play Store installations
  - Emulator environments
- On integrity failure: Log to analytics. Do not block (too many edge cases). Use data to detect piracy scale.

### Architecture Changes

- New file: `android/app/src/main/res/xml/network_security_config.xml`
- New native module: `SecureStorageModule.kt` (Android Keystore integration)
- Modified: `proguard-rules.pro`
- Modified: `logger.ts` (path sanitization)

### Risks

- Root detection has false positives (some banking/enterprise apps root check legitimately). Never block functionality, only warn.
- Signed storage adds ~50ms to app startup (acceptable)
- Play Integrity API requires Play Services (not available on Huawei/custom ROMs)

### Success Criteria

- Decompiled APK shows obfuscated engine class names
- Manually editing AsyncStorage `isPro` value does not grant Pro access (signature verification fails)
- No file paths or sensitive data visible in `adb logcat` during release build
- Play Integrity check runs silently on supported devices

### Exit Condition

All 7 tasks merged. Security audit: attempt to bypass Pro via AsyncStorage edit fails. Release build logcat review shows no sensitive data.

### Estimated Complexity

**High**

---

## PHASE 9 -- Large File Handling & Stress Testing

### Objective

Ensure the app handles files of 200MB+, 500+ page documents, and concurrent memory pressure without crashing.

### Why This Phase Matters

Power users and enterprise users process large documents. OOM crashes on large files are the most common 1-star reviews for PDF apps. Reliability under stress is the difference between a tool and a toy.

### Technical Implementation Tasks

#### 9.1 Implement Progressive Loading for Merge

- Current: `PDDocument.load(file)` loads entire file into memory
- New: For merge operations on files > 50MB, use `PDDocument.load(file, MemoryUsageSetting.setupMixed(50 * 1024 * 1024))`
- This keeps up to 50MB in memory and spills overflow to temp files
- Measure: Merge 3x200MB PDFs, verify peak heap stays under 400MB

#### 9.2 Implement Chunked Compression for Large Files

- For PDFs > 100MB at MEDIUM/HIGH compression:
  - Split into 50-page chunks internally
  - Compress each chunk independently (load chunk, process, save, close, release)
  - Merge compressed chunks at the end
  - Use temp directory for chunk files, clean up on completion/error
- This reduces peak memory from "full document" to "50 pages"

#### 9.3 Add Hard Limits with User Communication

- In `PdfPreflightModule.kt`:
  - Reject files > 500MB with clear message: "Files larger than 500MB are not supported"
  - Reject documents with > 2000 pages for raster operations
  - Allow structural operations (protect, unlock) on any size
- In JS: Show specific guidance: "Split this file first, then process each part"

#### 9.4 Create Stress Test Suite

- Create `QA/stress_tests/` directory with test scripts:
  - `merge_5x100mb.sh`: Merge 5 files of 100MB each
  - `compress_500_pages.sh`: Compress a 500-page document at each level
  - `ocr_100_pages.sh`: OCR a 100-page scanned document
  - `pdf_to_image_200_pages.sh`: Convert 200 pages to images
  - `rapid_operations.sh`: 10 operations in sequence without restarting app
  - `low_memory.sh`: Run with `adb shell am memory-limit` to simulate 2GB device
- Each script: Measure time, peak memory, output correctness, crash occurrence

#### 9.5 Implement WorkManager for Long Operations

- For operations expected to take > 60 seconds (based on preflight analysis):
  - Prompt user: "This may take a while. Process in background?"
  - If yes: Hand off to Android `WorkManager` with `ForegroundService` type
  - Show persistent notification with progress
  - Allow app to be backgrounded without losing the operation
- Create `android/app/src/main/java/com/pdfsmarttools/common/PdfWorker.kt`:
  - Extends `CoroutineWorker`
  - Reads operation parameters from `inputData`
  - Reports progress via `setForeground(ForegroundInfo(notification))`
  - Writes result to `outputData`
- Bridge to React Native via event emitter (operation completion triggers event even if app is backgrounded)

#### 9.6 Add Device Capability Detection

- On app start, classify device:
  - **Low-end**: < 3GB RAM, < 4 cores
  - **Mid-range**: 3-6GB RAM, 4-6 cores
  - **High-end**: > 6GB RAM, 8+ cores
- Adjust defaults:
  - Low-end: Reduce bitmap dimensions by 25%, limit parallel processing to 1 thread, show warnings earlier
  - Mid-range: Default settings
  - High-end: Allow higher DPI, more parallel threads

### Architecture Changes

- New file: `PdfWorker.kt` (WorkManager integration)
- New directory: `QA/stress_tests/`
- Modified: `PdfPreflightModule.kt` (hard limits)
- Modified: `PdfCompressorEngine.kt` (chunked processing)
- Modified: `PdfMergerEngine.kt` (mixed memory settings)
- New dependency: `androidx.work:work-runtime-ktx`

### Risks

- WorkManager requires careful state management. If the process is killed mid-operation, the Worker must handle resumption or clean up partial output.
- `MemoryUsageSetting.setupMixed()` uses temp files that must be cleaned up on all exit paths.
- Stress testing requires large test PDFs (generate via script, do not commit to repo).

### Success Criteria

- 3x200MB merge completes without OOM on a 4GB device
- 500-page compression completes in < 3 minutes (chunked approach)
- All stress tests pass on 3 device tiers (low/mid/high)
- WorkManager operation survives app backgrounding and returns correct result

### Exit Condition

All 6 tasks merged. Stress test suite passes on 3 physical devices. WorkManager demo works end-to-end.

### Estimated Complexity

**Extreme**

---

## PHASE 10 -- Pre-Launch Quality Gate

### Objective

Perform final validation that every feature works correctly, performance meets targets, and no release-blocking issues remain.

### Why This Phase Matters

First impressions on Play Store are permanent. A buggy launch generates 1-star reviews that are nearly impossible to overcome in rankings. The quality gate ensures readiness.

### Technical Implementation Tasks

#### 10.1 Full Feature Matrix Test

Test every feature combination (22 tools x 3 user states):

| Tool | Free (under limit) | Free (limit reached) | Pro |
|------|--------------------|--------------------|-----|
| Image to PDF | | | |
| Compress (LOW/MED/HIGH) | | | |
| Merge | | | |
| Split | | | |
| OCR (extract text) | | | |
| Scan to PDF | | | |
| Scan to Searchable PDF | | | |
| Sign PDF | | | |
| Organize Pages | | | |
| PDF to Image | | | |
| Protect PDF | | | |
| Unlock PDF | | | |
| Word to PDF | | | |
| PDF to Word | | | |
| PDF Viewer | | | |

For each cell: Verify operation, watermark presence/absence, page limits, ad behavior.

#### 10.2 Edge Case Testing

- Empty PDF (0 pages)
- Single-page PDF
- PDF with only images (no text)
- PDF with only text (no images)
- Password-protected PDF (with correct and wrong password)
- PDF with form fields
- PDF > 100MB
- PDF with Unicode filename
- PDF from content:// URI (Gmail attachment, WhatsApp document)
- Corrupted PDF (truncated file)
- Image files that are not really images (renamed .txt to .jpg)

#### 10.3 Device Compatibility Testing

- Android 8.0 (API 26) -- minimum supported
- Android 10 (API 29) -- scoped storage transition
- Android 11 (API 30) -- scoped storage enforced
- Android 13 (API 33) -- READ_MEDIA_IMAGES permission
- Android 14 (API 34) -- latest stable
- Test on: Samsung, Xiaomi, Pixel, OnePlus (OEM-specific behaviors)

#### 10.4 Performance Baseline Documentation

- Measure and document for each operation:
  - Time for 10-page PDF
  - Time for 50-page PDF
  - Time for 100-page PDF
  - Peak memory usage
  - Output file size
- Create `PERFORMANCE_BASELINES.md` for regression detection

#### 10.5 Accessibility Audit

- Verify all buttons have `accessibilityLabel`
- Verify all images have `accessibilityRole="image"` with descriptions
- Verify screen reader navigation order is logical
- Verify touch targets are minimum 48x48dp
- Test with TalkBack enabled

#### 10.6 APK Size Audit

- Build release APK: `./gradlew assembleRelease`
- Analyze with Android Studio APK Analyzer
- Target: < 30MB total APK size
- Identify largest contributors (PDFBox, POI, ML Kit, Firebase)
- Consider: App Bundle (AAB) with on-demand delivery for ML Kit model

#### 10.7 ProGuard Verification

- Build release APK
- Decompile with jadx and verify:
  - Engine classes are obfuscated
  - No debug logs in decompiled code
  - No hardcoded API keys visible (except AdMob app ID which must be in manifest)
  - React Native bridge methods still resolve correctly

### Architecture Changes

None. This phase is validation only.

### Risks

- Finding critical bugs at this stage delays launch significantly. Mitigate by running lighter QA passes during earlier phases.

### Success Criteria

- 100% feature matrix cells pass
- All edge cases handled gracefully (no crashes, clear error messages)
- Tested on minimum 4 Android versions
- APK size < 30MB
- Zero ProGuard-related crashes in release build

### Exit Condition

Full test matrix completed and documented. Zero P0 or P1 bugs. Release build runs clean on 4+ devices.

### Estimated Complexity

**Medium** (effort-intensive, not technically complex)

---

## PHASE 11 -- Play Store Strategy & ASO

### Objective

Prepare and execute the Google Play Store listing for maximum organic visibility and download conversion.

### Why This Phase Matters

ASO (App Store Optimization) determines organic discovery. The listing page determines install conversion rate. Getting these right at launch is 10x more effective than fixing them later.

### Technical Implementation Tasks

#### 11.1 Prepare Store Listing Assets

- **App Icon**: Professional design, distinctive from competitors, recognizable at 48px
- **Feature Graphic**: 1024x500px, highlight "20+ PDF Tools | 100% Offline"
- **Screenshots**: 8 screenshots showing key features:
  1. Home screen with tool grid
  2. PDF Compression with file size reduction
  3. PDF Merge with drag-to-reorder
  4. Document scanning with edge detection
  5. OCR text extraction
  6. PDF Signing
  7. Password protection
  8. Pro upgrade screen
- **Video**: 30-second demo video (optional but high impact)

#### 11.2 Write Store Listing Copy

- **Title** (30 chars): "PDF Tools - Offline PDF Editor"
- **Short Description** (80 chars): "Compress, merge, split, sign, scan PDFs. 100% offline. No uploads needed."
- **Full Description**: 4000 chars covering:
  - Lead with privacy/offline positioning
  - List all 20+ features with brief descriptions
  - Free vs Pro comparison
  - Privacy commitment statement
  - Call to action for Pro upgrade
- **Keywords**: Target: "pdf editor", "pdf compressor", "merge pdf", "pdf scanner", "offline pdf"

#### 11.3 Configure Release Tracks

- **Internal Testing Track**: Used during Phase 5 for billing testing
- **Closed Testing Track**: 50-100 beta testers for real-world feedback
- **Open Testing Track**: Public beta (2-4 weeks before production launch)
- **Production Track**: Final release

#### 11.4 Set Up Pricing and Distribution

- **Base Market**: India (INR pricing, largest Android market)
- **Expansion Markets**: US, UK, Germany, Brazil, Indonesia
- **Pricing**: Localized per market via Play Console auto-conversion
- **Countries**: All countries (no restrictions)
- **Content Rating**: Complete IARC questionnaire (expected: Everyone)

#### 11.5 Implement Deep Links for Play Store

- Configure `assetlinks.json` for verified deep links
- Set up `https://pdfsmarttools.com/.well-known/assetlinks.json`
- Enable Play Store "Instant App" if applicable (explore for lightweight PDF viewer)

#### 11.6 Prepare Privacy Policy and Terms

- Host Privacy Policy at `https://pdfsmarttools.com/privacy`
- Host Terms of Service at `https://pdfsmarttools.com/terms`
- Key claims to document:
  - No files uploaded to servers
  - No personal data collected beyond analytics (opt-out available)
  - Billing data handled by Google Play (not app)
  - Camera permission used only for document scanning

#### 11.7 Configure Play Console Features

- Enable pre-registration (if launching with marketing push)
- Set up store listing experiments (A/B test icon, screenshots, description)
- Configure timed publishing (select launch date)
- Enable Play App Signing (Google manages signing key)

### Architecture Changes

None. This phase is entirely Play Store and marketing.

### Risks

- Review rejection: Google may flag permissions (CAMERA, STORAGE) without adequate justification. Ensure permission declaration form is complete.
- Content policy: PDF tools that can remove passwords may trigger security review. Emphasize "only with correct password" in listing.
- First review wave: Early negative reviews dominate with low review count. Ensure quality via Phase 10.

### Success Criteria

- Store listing passes Google Play review on first submission
- All 8 screenshots render correctly on Play Store
- Privacy Policy and Terms accessible via provided URLs
- Internal/closed testing track operational

### Exit Condition

App approved on closed testing track. Store listing live (even if not production). At least 20 beta testers have provided feedback.

### Estimated Complexity

**Low** (non-technical, but time-consuming)

---

## PHASE 12 -- Post-Launch Growth Engine

### Objective

Implement retention loops, referral mechanisms, and server-side infrastructure for sustainable growth.

### Why This Phase Matters

Launch generates a spike. Growth requires systems that compound over time. Retention is more valuable than acquisition -- a retained user generates 12x more lifetime revenue.

### Technical Implementation Tasks

#### 12.1 Implement Server-Side Receipt Validation

- Deploy lightweight server (Node.js/Cloudflare Worker) for Play Store receipt validation
- On purchase: Send purchase token to server → server calls Google Play Developer API → validates → returns signed status
- Prevents: local subscription bypass, shared APK piracy
- Endpoint: `POST /api/validate-purchase { purchaseToken, productId, packageName }`

#### 12.2 Add Push Notification Support

- Integrate Firebase Cloud Messaging (FCM)
- Use cases:
  - Re-engagement: "You have 3 free compressions available today" (if inactive 3+ days)
  - Feature announcements: New tool launches
  - Subscription reminders: "Your trial ends in 2 days"
- Respect notification permissions (Android 13+ POST_NOTIFICATIONS)

#### 12.3 Implement Referral System

- Generate unique referral code per user (stored in AsyncStorage, synced to server)
- Share link: "Get PDFSmartTools Pro free for 7 days: https://pdfsmarttools.com/ref/CODE"
- On install with referral: Grant 7-day Pro trial to both referrer and referee
- Track via Firebase Dynamic Links or Play Store referral parameter

#### 12.4 Add A/B Testing Framework

- Use Firebase Remote Config for:
  - Paywall design variants (which ProScreen layout converts better)
  - Free tier limits (test 2/day vs 3/day vs 5/day for optimal conversion)
  - Ad frequency (every operation vs every 3rd operation)
  - Onboarding variants
- Log variant assignment to analytics for analysis

#### 12.5 Implement Widget for Quick Access

- Create Android home screen widget (4x1) with quick-action buttons:
  - Scan, Compress, Merge, More
- Uses `AppWidgetProvider` in Kotlin
- On tap: Deep links to specific tool screen
- Increases daily active usage

#### 12.6 Add Batch Processing (Pro Feature)

- Allow Pro users to select multiple files for batch compression, conversion, or watermark removal
- Queue operations with WorkManager (from Phase 9)
- Show batch progress in notification tray
- This becomes a high-value Pro differentiator

#### 12.7 Implement Usage Dashboard

- Create `src/presentation/screens/stats/UsageStatsScreen.tsx`
- Show: operations this week/month, total pages processed, storage saved by compression
- Gamification: "You've saved 500MB this month!" badges
- Accessible from Settings screen

#### 12.8 Localization

- Extract all strings to `src/localization/` or use `react-native-localize`
- Priority languages: English, Hindi, Portuguese, Spanish, Indonesian, German
- Localize: UI strings, error messages, store listing, screenshots
- Generate localized screenshots for Play Store (automated with fastlane)

### Architecture Changes

- New: Server-side validation endpoint
- New: `AppWidgetProvider` Kotlin implementation
- New: `UsageStatsScreen.tsx`
- New: FCM integration
- New dependency: `@react-native-firebase/messaging`, `@react-native-firebase/remote-config`

### Risks

- Server infrastructure introduces operational costs and maintenance burden
- Push notifications can cause uninstalls if over-used (limit to 2/week max)
- A/B testing requires statistical significance (minimum ~1000 users per variant)

### Success Criteria

- Server-side receipt validation catches 100% of spoofed purchases in testing
- Push notification opt-in rate > 60%
- Referral system generates measurable install attribution
- At least 2 A/B tests running by end of phase

### Exit Condition

Server deployed and validating receipts. FCM operational. At least one growth loop (referral or widget) live. Localization in at least 3 languages.

### Estimated Complexity

**Extreme**

---

## Feature Backlog (Future Pro Expansion)

### Tier 1: High-Demand Features (Next 6 Months)

| Feature | Description | Revenue Impact | Complexity |
|---------|-------------|---------------|------------|
| PDF Form Filling | Fill and save PDF form fields (AcroForms) | High | High |
| PDF Annotation | Highlight, underline, comment, draw on PDFs | High | High |
| Batch Watermark | Add custom text/image watermark to multiple PDFs | Medium | Medium |
| PDF Redaction | Permanently black out sensitive text/images | Medium | High |
| Cloud Backup (Pro) | Optional backup of settings/signatures to Google Drive | Medium | Medium |
| PDF Comparison | Side-by-side diff of two PDF versions | Low | Extreme |

### Tier 2: Differentiator Features (6-12 Months)

| Feature | Description | Revenue Impact | Complexity |
|---------|-------------|---------------|------------|
| AI-Powered OCR | Enhanced text recognition using on-device ML | Medium | Extreme |
| PDF/A Conversion | Convert to archival format for compliance | Low | High |
| Flatten PDF | Remove interactive elements (forms, annotations) | Low | Medium |
| Extract Images | Pull all images from a PDF as individual files | Low | Low |
| PDF Metadata Editor | Edit title, author, subject, keywords | Low | Low |
| Page Number Stamping | Add page numbers (header/footer) to PDFs | Low | Medium |

### Tier 3: Enterprise Features (12+ Months)

| Feature | Description | Revenue Impact | Complexity |
|---------|-------------|---------------|------------|
| Digital Certificate Signing | PKI-based legally binding signatures | High | Extreme |
| PDF/UA Accessibility | Create accessible PDFs (tagged, structured) | Medium | Extreme |
| SDK/API | Expose processing engine as a library for other apps | Medium | High |
| MDM Integration | Enterprise device management compatibility | Low | High |

---

## Technical Debt Log Template

Track all known technical debt. Review monthly. Prioritize during Phase transitions.

```markdown
### Technical Debt Log

| ID | Description | Location | Severity | Introduced | Phase to Fix | Status |
|----|-------------|----------|----------|------------|-------------|--------|
| TD-001 | Emoji icons used as placeholder for vector icons | src/presentation/components/ui/Icon.tsx | Low | Initial build | Phase 6 | Open |
| TD-002 | ScanPdfModule uses Executor instead of Coroutines | ScanPdfModule.kt | Low | Initial build | Phase 2 | Open |
| TD-003 | Banner and Interstitial use same ad unit ID | src/domain/ads/adService.ts | Medium | Initial build | Phase 1 | Open |
| TD-004 | Screen components exceed 1000 lines | PdfViewerScreen.tsx, SettingsScreen.tsx | Medium | Initial build | Ongoing | Open |
| TD-005 | No React.memo on screen components | All screens | Low | Initial build | Phase 4 | Open |
| TD-006 | Currency hardcoded to INR in ProScreen fallback | ProScreen.tsx | Medium | Initial build | Phase 5 | Open |
| TD-007 | App.test.tsx fails due to @react-navigation ESM issue | __tests__/App.test.tsx | Low | Initial build | Phase 10 | Open |
| TD-008 | No barrel exports in domain/ and data/ layers | Multiple | Low | Architecture Phase | Ongoing | Open |
| TD-009 | usageLimitService.resetUsage() accessible in production | usageLimitService.ts | Medium | Initial build | Phase 8 | Open |
| TD-010 | PDFBox loaded fully in memory for getPageCount() | Multiple engines | High | Initial build | Phase 2 | Open |
```

---

## Release Checklist Template

Execute before every Play Store release.

```markdown
### Release Checklist v[X.Y.Z]

#### Pre-Build
- [ ] All unit tests pass (`npm test` -- 118+ assertions, 0 failures)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] ESLint clean (`npm run lint`)
- [ ] No console.log statements in production code (grep verify)
- [ ] Feature flags set correctly (SUBSCRIPTIONS_ENABLED = true/false as intended)
- [ ] Ad unit IDs are production IDs (not test IDs)
- [ ] versionCode incremented in android/app/build.gradle
- [ ] versionName updated to match release

#### Build
- [ ] Clean build: `cd android && ./gradlew clean`
- [ ] Release AAB: `cd android && ./gradlew bundleRelease`
- [ ] APK size < 30MB (check with APK Analyzer)
- [ ] ProGuard mapping file saved: `android/app/build/outputs/mapping/release/mapping.txt`
- [ ] Upload mapping to Firebase Crashlytics for symbolication

#### Functional Verification (Release Build)
- [ ] Install release APK on physical device
- [ ] Compress PDF: success, correct output
- [ ] Merge 2 PDFs: success, correct page count
- [ ] Split PDF: success, correct ranges
- [ ] OCR: success, text extracted
- [ ] Sign PDF: success, text still selectable (Phase 3+)
- [ ] Protect PDF: success, password works
- [ ] Unlock PDF: success with correct password
- [ ] Deep link: Open PDF from file manager
- [ ] Purchase flow: Works on internal test track
- [ ] Restore purchase: Works after reinstall
- [ ] Ad display: Banner shows, interstitial loads
- [ ] Dark mode: All screens render correctly
- [ ] Error boundary: Force crash recovers gracefully

#### Security Verification
- [ ] No sensitive data in `adb logcat` during release
- [ ] AsyncStorage Pro flag tamper does not grant access
- [ ] ProGuard obfuscation verified via decompilation

#### Play Store
- [ ] Upload AAB to target track (internal/closed/production)
- [ ] Release notes written (user-facing changelog)
- [ ] Staged rollout percentage set (10% → 25% → 50% → 100%)
- [ ] Monitor Crashlytics for 24 hours post-rollout
- [ ] Check Play Console vitals (ANR rate < 0.47%, crash rate < 1.09%)

#### Post-Release
- [ ] Tag release in git: `git tag v[X.Y.Z]`
- [ ] Archive mapping file
- [ ] Update PERFORMANCE_BASELINES.md if operation times changed
- [ ] Review user feedback for next iteration
```

---

## Revenue Scaling Strategy

### Phase A: Foundation (Months 1-3 Post-Launch)

**Revenue Sources:**
- Google AdMob (banner + interstitial + rewarded)
- Pro subscriptions (monthly ₹199, yearly ₹999)

**Target Metrics:**
- 10K organic installs
- 2% free-to-trial conversion
- 50% trial-to-paid conversion
- eCPM: $0.50-1.00 (India), $2-5 (US/EU)

**Estimated Monthly Revenue:**
- Ad revenue: 10K DAU x 3 impressions x $0.001 avg = $30-100/month
- Subscription revenue: 100 subscribers x $3 avg = $300/month
- **Total: $330-400/month**

### Phase B: Growth (Months 3-6)

**Actions:**
- Launch in 6 languages (Phase 12)
- Begin paid acquisition: Google UAC at $0.10-0.30 CPI in India
- Implement referral system
- A/B test paywall variants
- Increase daily limits slightly (reduce pressure, improve ratings)

**Target Metrics:**
- 50K organic + paid installs
- 3% free-to-paid conversion (optimized paywall)
- 4.2+ Play Store rating

**Estimated Monthly Revenue:**
- Ad revenue: 30K DAU x 3 x $0.001 = $90-300/month
- Subscription revenue: 500 subscribers x $3 avg = $1,500/month
- **Total: $1,600-1,800/month**

### Phase C: Scale (Months 6-12)

**Actions:**
- Add high-value Pro features (annotation, form filling)
- Increase Pro price for new markets (US: $4.99/month)
- Launch yearly plan with 14-day free trial
- Implement server-side receipt validation (anti-piracy)
- Explore enterprise/B2B distribution

**Target Metrics:**
- 200K total installs
- 3.5% conversion rate
- < 5% monthly churn

**Estimated Monthly Revenue:**
- Ad revenue: 80K DAU x 3 x $0.001 = $240-800/month
- Subscription revenue: 2,000 subscribers x $3.50 avg = $7,000/month
- **Total: $7,200-7,800/month**

### Phase D: Maturity (12+ Months)

**Actions:**
- iOS launch (doubles TAM)
- Premium tier ($9.99/month) with advanced features (redaction, PDF/A, batch)
- Affiliate partnerships (office suite apps, document management)
- Enterprise licensing

**Target:**
- $20,000+/month recurring revenue
- Self-sustaining product with dedicated development budget

### Key Revenue Levers (Ranked by Impact)

1. **Conversion rate optimization** -- 1% improvement = 30% revenue increase
2. **Churn reduction** -- Each month of retained subscriber = full month revenue
3. **Geographic expansion** -- Higher eCPM markets (US, Germany, UK) increase per-user revenue 5x
4. **Feature-driven upgrades** -- Each new Pro feature is a conversion event
5. **Pricing optimization** -- Test $2.99 vs $3.99 vs $4.99 in high-income markets

---

*End of execution plan. Execute phases sequentially. Each "Next Phase" command continues from the next incomplete phase.*
