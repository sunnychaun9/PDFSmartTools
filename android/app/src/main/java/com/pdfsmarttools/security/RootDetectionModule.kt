package com.pdfsmarttools.security

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import java.io.File

class RootDetectionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RootDetection"

    @ReactMethod
    fun isDeviceRooted(promise: Promise) {
        try {
            val rooted = checkSuBinary() || checkRootManagementApps() || checkTestKeys()
            promise.resolve(rooted)
        } catch (e: Exception) {
            promise.resolve(false) // Fail safe - don't block users on error
        }
    }

    /**
     * Check for su binary in common locations
     */
    private fun checkSuBinary(): Boolean {
        val paths = arrayOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/su",
            "/system/bin/.ext/.su",
            "/system/usr/we-need-root/su",
            "/data/local/su",
            "/data/local/bin/su",
            "/data/local/xbin/su",
        )
        return paths.any { File(it).exists() }
    }

    /**
     * Check for known root management apps
     */
    private fun checkRootManagementApps(): Boolean {
        val packages = arrayOf(
            "com.topjohnwu.magisk",        // Magisk
            "eu.chainfire.supersu",         // SuperSU
            "com.koushikdutta.superuser",   // Superuser
            "com.noshufou.android.su",      // Superuser (legacy)
            "com.thirdparty.superuser",     // Third-party superuser
            "com.kingroot.kinguser",        // KingRoot
        )
        val pm = reactApplicationContext.packageManager
        return packages.any { pkg ->
            try {
                pm.getPackageInfo(pkg, 0)
                true
            } catch (e: Exception) {
                false
            }
        }
    }

    /**
     * Check for test-keys in build properties (non-official ROM)
     */
    private fun checkTestKeys(): Boolean {
        val buildTags = android.os.Build.TAGS
        return buildTags != null && buildTags.contains("test-keys")
    }
}
