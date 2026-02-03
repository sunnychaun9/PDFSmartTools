package com.pdfsmarttools.intent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream

class IntentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var initialIntentHandled = false

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "IntentModule"

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        // Not used
    }

    override fun onNewIntent(intent: Intent) {
        handleIntent(intent)
    }

    @ReactMethod
    fun getInitialIntent(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve(null)
                return
            }

            val intent = activity.intent
            if (intent == null) {
                promise.resolve(null)
                return
            }

            val result = processIntent(intent)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INTENT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun clearIntent() {
        reactContext.currentActivity?.intent = Intent()
    }

    private fun handleIntent(intent: Intent) {
        val result = processIntent(intent) ?: return

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onPdfIntent", result)
    }

    private fun processIntent(intent: Intent): WritableMap? {
        val action = intent.action
        val type = intent.type

        if (action != Intent.ACTION_VIEW || type != "application/pdf") {
            return null
        }

        val uri = intent.data ?: return null

        // Copy the file to app's cache directory to ensure we have read access
        val filePath = copyToCache(uri) ?: return null
        val fileName = getFileName(uri)

        val result = Arguments.createMap()
        result.putString("filePath", filePath)
        result.putString("fileName", fileName)
        result.putString("uri", uri.toString())
        return result
    }

    private fun copyToCache(uri: Uri): String? {
        return try {
            val resolver = reactContext.contentResolver
            val inputStream = resolver.openInputStream(uri) ?: return null

            val fileName = "intent_pdf_${System.currentTimeMillis()}.pdf"
            val cacheFile = File(reactContext.cacheDir, fileName)

            // Use buffered copy for better memory efficiency with large files
            FileOutputStream(cacheFile).use { output ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                }
                output.flush()
            }
            inputStream.close()

            cacheFile.absolutePath
        } catch (e: Exception) {
            null
        }
    }

    private fun getFileName(uri: Uri): String {
        var name = "document.pdf"

        try {
            val cursor = reactContext.contentResolver.query(uri, null, null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (nameIndex >= 0) {
                        name = it.getString(nameIndex) ?: name
                    }
                }
            }
        } catch (e: Exception) {
            // Use default name
        }

        return name
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }
}
