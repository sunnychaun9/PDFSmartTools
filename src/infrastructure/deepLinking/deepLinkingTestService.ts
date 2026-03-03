/**
 * PDF Deep Linking Testing Guide
 * 
 * Test commands and manual checklist for verifying PDF opening support
 * in PDF Smart Tools app across Android 11–14 devices
 */

/**
 * ADB TESTING COMMANDS
 * =====================
 * 
 * Prerequisites:
 * - Build and install the app: npx react-native run-android
 * - Device or emulator connected and debugged via adb
 * - Sample PDF available locally or in Downloads
 */

export const ADB_TEST_COMMANDS = {
  /**
   * Test 1: Open PDF from file:// URI (cold start)
   * 
   * Simulates user opening a PDF from File Manager by creating a file:// intent
   */
  TEST_FILE_URI_COLD_START: `adb shell am start -a android.intent.action.VIEW \\
  -d "file:///storage/emulated/0/Download/sample.pdf" \\
  -t application/pdf \\
  com.pdfsmarttools/.MainActivity`,

  /**
   * Test 2: Open PDF from content:// URI (scoped storage)
   * 
   * Simulates opening a PDF from cloud providers, Gmail, WhatsApp
   * Note: Replace content_uri with actual content:// URI
   */
  TEST_CONTENT_URI_COLD_START: `adb shell am start -a android.intent.action.VIEW \\
  -d "content://com.android.providers.downloads.documents/document/123" \\
  -t application/pdf \\
  com.pdfsmarttools/.MainActivity`,

  /**
   * Test 3: Open PDF while app is already running (foreground)
   * 
   * Send URI intent to running app instance
   */
  TEST_CONTENT_URI_FOREGROUND: `adb shell am start -a android.intent.action.VIEW \\
  -d "content://com.google.android.gms.drive.api/openFile/pdf123" \\
  -t application/pdf \\
  com.pdfsmarttools/.MainActivity`,

  /**
   * Test 4: Verify intent filter is registered
   * 
   * Check that MainActivity has the PDF intent-filter
   */
  VERIFY_INTENT_FILTER: `adb shell cmd package resolve-activity \\
  --brief -a android.intent.action.VIEW \\
  -t application/pdf \\
  com.pdfsmarttools`,

  /**
   * Test 5: Verify FileProvider is configured
   * 
   * Confirms FileProvider authority is registered
   */
  VERIFY_FILE_PROVIDER: `adb shell cmd package resolve-activity \\
  --brief -t application/pdf \\
  com.pdfsmarttools/.MainActivity`,

  /**
   * Test 6: Push sample PDF to Downloads for File Manager testing
   * 
   * Creates a test PDF that can be opened via File Manager
   */
  PUSH_SAMPLE_PDF: `adb push /path/to/sample.pdf /sdcard/Download/test.pdf`,

  /**
   * Test 7: Clear app data and test cold start
   * 
   * Ensures app initializes from scratch with deep link
   */
  CLEAR_APP_DATA_AND_TEST: `adb shell pm clear com.pdfsmarttools && \\
adb shell am start -a android.intent.action.VIEW \\
  -d "file:///storage/emulated/0/Download/test.pdf" \\
  -t application/pdf \\
  com.pdfsmarttools/.MainActivity`,

  /**
   * Test 8: Logcat filter for deep linking
   * 
   * Watch logs for deep linking debug messages
   */
  WATCH_DEEPLINK_LOGS: `adb logcat | grep -i "DeepLink\\|PDF\\|Intent"`,

  /**
   * Test 9: Get detailed activity information
   * 
   * View registered intent filters for MainActivity
   */
  DUMP_MANIFEST: `adb shell dumpsys package com.pdfsmarttools | grep -A 20 MainActivity`,
};

/**
 * MANUAL TESTING CHECKLIST
 * ========================
 * 
 * Use this checklist to verify PDF opening works across different scenarios
 * and Android versions.
 */

export const MANUAL_TEST_CHECKLIST = [
  {
    category: 'Cold Start (App Not Running)',
    tests: [
      {
        name: 'Open PDF from Downloads via File Manager (Android 11)',
        steps: [
          '1. Push test PDF to Downloads: adb push sample.pdf /sdcard/Download/',
          '2. Open File Manager',
          '3. Navigate to Downloads',
          '4. Long-press on test.pdf',
          '5. Select "Open with"',
          '6. Choose "PDF Smart Tools"',
        ],
        expectedResult:
          'App launches and PDF Viewer opens directly with the PDF loaded',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Open PDF from Gmail (Android 12)',
        steps: [
          '1. Send yourself an email with a PDF attachment',
          '2. Open Gmail app',
          '3. Open the email with PDF',
          '4. Long-press or tap the PDF attachment',
          '5. Select "Open with" → "PDF Smart Tools"',
        ],
        expectedResult:
          'App launches and PDF is displayed in viewer (may be copied to cache)',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Open PDF from WhatsApp (Android 13)',
        steps: [
          '1. Send yourself a PDF via WhatsApp',
          '2. Open WhatsApp chat',
          '3. Tap/long-press the PDF file',
          '4. Select "Open with" → "PDF Smart Tools"',
        ],
        expectedResult:
          'App launches with PDF loaded in viewer',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Open PDF from Google Drive (Android 14)',
        steps: [
          '1. Open Google Drive app',
          '2. Locate a PDF file',
          '3. Tap file or select "Open with"',
          '4. Choose "PDF Smart Tools"',
        ],
        expectedResult:
          'App launches and content:// URI is resolved and loaded in viewer',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
  {
    category: 'Foreground (App Already Running)',
    tests: [
      {
        name: 'Switch from another app while PDF Smart Tools is open',
        steps: [
          '1. Open PDF Smart Tools',
          '2. Open another app (Chrome, Gmail, Files)',
          '3. Open/tap a PDF in that app',
          '4. Select "Open with" → "PDF Smart Tools"',
          '5. App comes to foreground',
        ],
        expectedResult:
          'Foreground app recognizes deep link, closes current PDF, and opens new PDF in viewer',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Process multiple PDFs in sequence (all foreground)',
        steps: [
          '1. App is open with PDF loaded',
          '2. Open Files app',
          '3. Select PDF A → "Open with PDF Smart Tools"',
          '4. Back to Files, select PDF B → "Open with PDF Smart Tools"',
          '5. Back to Files, select PDF C → "Open with PDF Smart Tools"',
        ],
        expectedResult:
          'Each PDF opens correctly and replaces the previous viewer instance',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
  {
    category: 'Large PDFs & Performance',
    tests: [
      {
        name: 'Open large PDF (100+ pages)',
        steps: [
          '1. Push a large PDF (100+ pages, 50 MB+) to Downloads',
          '2. Open via File Manager → "Open with PDF Smart Tools"',
        ],
        expectedResult:
          'App launches and loads PDF without crashes or excessive delay (should show loading indicator)',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Zoom and scroll in large PDF without crashes',
        steps: [
          '1. Open large PDF',
          '2. Pinch to zoom (in and out)',
          '3. Scroll through pages rapidly',
          '4. Navigate to specific page via page jumper',
        ],
        expectedResult:
          'All interactions smooth; no ANRs or crashes',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
  {
    category: 'Permission Handling',
    tests: [
      {
        name: 'Read PDF without READ_EXTERNAL_STORAGE (Android 11+)',
        steps: [
          '1. Install app (READ_EXTERNAL_STORAGE is maxSdkVersion=32)',
          '2. Open PDF from File Manager (Android 11+)',
          '3. Check logcat for permission errors',
        ],
        expectedResult:
          'PDF opens without requesting READ_EXTERNAL_STORAGE (scoped storage in use)',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Handle permission denial gracefully',
        steps: [
          '1. Revoke app permissions: adb shell pm revoke com.pdfsmarttools android.permission.READ_MEDIA_IMAGES',
          '2. Try to open PDF from File Manager',
        ],
        expectedResult:
          'App shows error message, does not crash',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
  {
    category: 'Edge Cases',
    tests: [
      {
        name: 'PDF with special characters in filename',
        steps: [
          '1. Create PDF with filename like: "Report (2024) [FINAL].pdf"',
          '2. Open via File Manager → "PDF Smart Tools"',
        ],
        expectedResult:
          'PDF opens correctly, title displays properly',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'PDF from temporary/cache directory',
        steps: [
          '1. App copies content:// URI to cache internally',
          '2. Verify file is accessible and not deleted prematurely',
        ],
        expectedResult:
          'PDF remains accessible throughout viewer session',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Non-PDF file with .pdf extension',
        steps: [
          '1. Rename a text file to "fake.pdf"',
          '2. Try to open via "Open with PDF Smart Tools"',
        ],
        expectedResult:
          'App shows error (e.g., "Failed to load PDF") without crashing',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Password-protected PDF',
        steps: [
          '1. Create or find a password-protected PDF',
          '2. Open via "Open with PDF Smart Tools"',
        ],
        expectedResult:
          'App detects password protection and shows password modal (if implemented)',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
  {
    category: 'Device-Specific Tests (Recommend Testing All Android Versions)',
    tests: [
      {
        name: 'Android 11 (API 30) - Scoped Storage Transition',
        steps: [
          '1. Test PDF from Downloads',
          '2. Test PDF from cloud (Google Drive, OneDrive)',
          '3. Test PDF from messaging apps',
        ],
        expectedResult:
          'All PDFs open correctly using content:// URIs',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Android 12 (API 31) - Approximate Location & Data Access',
        steps: [
          '1. Ensure exported="true" on MainActivity (reviewed in manifest)',
          '2. Test all PDF opening scenarios',
        ],
        expectedResult:
          'No manifest warnings; app appears in Open With chooser',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Android 13 (API 33) - Per-App Language & Grammatical Gender',
        steps: [
          '1. Change app language in system settings (if implemented)',
          '2. Test PDF opening with different language locales',
        ],
        expectedResult:
          'Deep linking works regardless of app language',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Android 14 (API 34) - Runtime Permissions & Regional Preferences',
        steps: [
          '1. Test all PDF opening scenarios',
          '2. Review logcat for deprecation warnings',
        ],
        expectedResult:
          'No deprecated API usage; all permissions handled correctly',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
  {
    category: 'Integration with App Features',
    tests: [
      {
        name: 'PDF opened via intent can be shared',
        steps: [
          '1. Open PDF via deep link',
          '2. Tap share button in viewer',
          '3. Select a destination (email, messaging, etc.)',
        ],
        expectedResult:
          'PDF shares correctly without errors',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'PDF opened via intent appears in Recent Files',
        steps: [
          '1. Open PDF via deep link',
          '2. Navigate to Recent tab',
          '3. Close app and reopen',
        ],
        expectedResult:
          'Opened PDF appears in recent list (if feature is implemented)',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Saved page position is retained',
        steps: [
          '1. Open PDF via deep link',
          '2. Navigate to page 50',
          '3. Close viewer (back button)',
          '4. Open same PDF again',
        ],
        expectedResult:
          'PDF opens and resumes at page 50 (if resume feature is enabled)',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
  {
    category: 'Play Store Compliance',
    tests: [
      {
        name: 'App does NOT request to be default PDF handler',
        expectedResult:
          'App appears in Open With chooser only, never forces default (policy compliant)',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'Intent-filter only includes MIME type application/pdf',
        expectedResult:
          'Manifest shows only pdf MIME type in intent-filter (verified)',
        passFail: '□ PASS  □ FAIL',
      },
      {
        name: 'FileProvider grantUriPermissions="true" set',
        expectedResult:
          'Manifest shows FileProvider with grantUriPermissions (verified)',
        passFail: '□ PASS  □ FAIL',
      },
    ],
  },
];

/**
 * QUICK START TESTING GUIDE
 * =========================
 * 
 * 1. Build and install:
 *    npx react-native run-android
 * 
 * 2. Create a sample PDF:
 *    adb push /path/to/sample.pdf /sdcard/Download/
 * 
 * 3. Test via File Manager:
 *    - Open Files app → Downloads → test.pdf
 *    - Long-press → Open with → PDF Smart Tools
 *    - Verify app launches with PDF loaded
 * 
 * 4. Test via CLI (cold start):
 *    adb shell am start -a android.intent.action.VIEW \
 *      -d "file:///storage/emulated/0/Download/test.pdf" \
 *      -t application/pdf \
 *      com.pdfsmarttools/.MainActivity
 * 
 * 5. Test via CLI (foreground):
 *    adb shell am start -a android.intent.action.VIEW \
 *      -d "file:///storage/emulated/0/Download/test2.pdf" \
 *      -t application/pdf \
 *      com.pdfsmarttools/.MainActivity
 * 
 * 6. Watch logs:
 *    adb logcat | grep -i "DeepLink\|PDF\|Intent"
 * 
 * 7. Mark results in MANUAL_TEST_CHECKLIST above
 */

/**
 * TROUBLESHOOTING
 * ===============
 * 
 * Issue: "App not appearing in Open With chooser"
 * - Verify intent-filter is in AndroidManifest.xml
 * - Check: android:exported="true" on MainActivity
 * - Run: adb shell cmd package resolve-activity --brief -a android.intent.action.VIEW -t application/pdf com.pdfsmarttools
 * - Expected output: .MainActivity
 * 
 * Issue: "PDF not loading after opening"
 * - Check logcat for exceptions: adb logcat | grep -i "Exception\|Error\|PDF"
 * - Verify file permissions (content:// URIs should be auto-handled)
 * - Ensure PdfViewerScreen accepts filePath parameter with content:// URIs
 * 
 * Issue: "App crashes on second PDF open (foreground)"
 * - Check if deep link listener is properly unsubscribing
 * - Verify navigation state management in AppProviders
 * - Ensure pending PDF is cleared after navigation
 * 
 * Issue: "Scoped storage errors on Android 11+"
 * - Never use /sdcard paths directly on Android 11+
 * - Always use content:// URIs or copy to cache (already implemented)
 * - Check maxSdkVersion attributes in manifest (already set)
 */
