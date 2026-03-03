package com.pdfsmarttools.security

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap

class IntegrityCheckModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "IntegrityCheck"

    /**
     * Check basic app integrity:
     * - Is the app installed from Play Store?
     * - Is the app debuggable?
     * - Is the app running on an emulator?
     */
    @ReactMethod
    fun checkIntegrity(promise: Promise) {
        try {
            val context = reactApplicationContext
            val result = WritableNativeMap()

            // Check installer source
            val installer = context.packageManager.getInstallerPackageName(context.packageName)
            val fromPlayStore = installer == "com.android.vending" || installer == "com.google.android.feedback"
            result.putBoolean("fromPlayStore", fromPlayStore)
            result.putString("installer", installer ?: "unknown")

            // Check if debuggable
            val isDebuggable = (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
            result.putBoolean("isDebuggable", isDebuggable)

            // Check for emulator
            val isEmulator = checkEmulator()
            result.putBoolean("isEmulator", isEmulator)

            promise.resolve(result)
        } catch (e: Exception) {
            // Fail safe — don't block users
            val fallback = WritableNativeMap()
            fallback.putBoolean("fromPlayStore", true)
            fallback.putBoolean("isDebuggable", false)
            fallback.putBoolean("isEmulator", false)
            promise.resolve(fallback)
        }
    }

    private fun checkEmulator(): Boolean {
        return (android.os.Build.FINGERPRINT.startsWith("generic")
                || android.os.Build.FINGERPRINT.startsWith("unknown")
                || android.os.Build.MODEL.contains("google_sdk")
                || android.os.Build.MODEL.contains("Emulator")
                || android.os.Build.MODEL.contains("Android SDK built for x86")
                || android.os.Build.MANUFACTURER.contains("Genymotion")
                || android.os.Build.BRAND.startsWith("generic") && android.os.Build.DEVICE.startsWith("generic")
                || android.os.Build.PRODUCT == "google_sdk"
                || android.os.Build.PRODUCT == "sdk_gphone64_arm64"
                || android.os.Build.HARDWARE.contains("goldfish")
                || android.os.Build.HARDWARE.contains("ranchu"))
    }
}
