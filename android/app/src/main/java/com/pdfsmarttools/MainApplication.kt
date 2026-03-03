package com.pdfsmarttools

import android.app.Application
import android.content.ComponentCallbacks2
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.pdfsmarttools.pdfcompressor.PdfCompressorPackage
import com.pdfsmarttools.pdfshare.PdfSharePackage
import com.pdfsmarttools.pdfmerger.PdfMergerPackage
import com.pdfsmarttools.textrecognition.TextRecognitionPackage
import com.pdfsmarttools.pdfsigner.PdfSignerPackage
import com.pdfsmarttools.pdfsplitter.PdfSplitterPackage
import com.pdfsmarttools.pdftoimage.PdfToImagePackage
import com.pdfsmarttools.pdfprotector.PdfProtectorPackage
import com.pdfsmarttools.pdfunlock.PdfUnlockPackage
import com.pdfsmarttools.wordtopdf.WordToPdfPackage
import com.pdfsmarttools.inappupdate.InAppUpdatePackage
import com.pdfsmarttools.pdfocr.PdfOcrPackage
import com.pdfsmarttools.intent.IntentPackage
import com.pdfsmarttools.pdfpagemanager.PdfPageManagerPackage
import com.pdfsmarttools.pdftoword.PdfToWordPackage
import com.pdfsmarttools.preflight.PdfPreflightPackage
import com.pdfsmarttools.filepicker.FilePickerPackage
import com.pdfsmarttools.security.RootDetectionPackage
import com.pdfsmarttools.security.SecureStoragePackage
import com.pdfsmarttools.security.IntegrityCheckPackage
import com.pdfsmarttools.common.PdfWorkerPackage
import com.pdfsmarttools.common.DeviceCapabilityPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(PdfCompressorPackage())
          add(PdfSharePackage())
          add(PdfMergerPackage())
          add(TextRecognitionPackage())
          add(PdfSignerPackage())
          add(PdfSplitterPackage())
          add(PdfToImagePackage())
          add(PdfProtectorPackage())
          add(PdfUnlockPackage())
          add(WordToPdfPackage())
          add(InAppUpdatePackage())
          add(PdfOcrPackage())
          add(com.pdfsmarttools.scan.ScanPackage())
          add(IntentPackage())
          add(PdfPageManagerPackage())
          add(PdfToWordPackage())
          add(PdfPreflightPackage())
          add(FilePickerPackage())
          add(RootDetectionPackage())
          add(SecureStoragePackage())
          add(IntegrityCheckPackage())
          add(PdfWorkerPackage())
          add(DeviceCapabilityPackage())

          // Debug-only stress test module (excluded from release APK)
          if (BuildConfig.DEBUG) {
            try {
              val pkg = Class.forName("com.pdfsmarttools.debug.DebugStressTestPackage")
                .getDeclaredConstructor().newInstance() as com.facebook.react.ReactPackage
              add(pkg)
            } catch (_: ClassNotFoundException) { }
          }
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)

    when {
      level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> {
        Log.w(TAG, "onTrimMemory: COMPLETE — system critically low on memory, forcing GC")
        System.gc()
      }
      level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> {
        Log.w(TAG, "onTrimMemory: RUNNING_LOW — releasing memory via GC")
        System.gc()
      }
      level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE -> {
        Log.i(TAG, "onTrimMemory: RUNNING_MODERATE — memory pressure increasing")
      }
    }
  }

  companion object {
    private const val TAG = "PDFSmartTools"
  }
}
