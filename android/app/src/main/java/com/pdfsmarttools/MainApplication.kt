package com.pdfsmarttools

import android.app.Application
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
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
