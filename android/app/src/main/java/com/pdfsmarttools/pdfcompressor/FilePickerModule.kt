package com.pdfsmarttools.pdfcompressor

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.*

class FilePickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pickerPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "FilePicker"

    @ReactMethod
    fun pickPdfFile(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("ACTIVITY_NULL", "Activity is null")
            return
        }

        pickerPromise = promise

        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/pdf"
        }

        try {
            activity.startActivityForResult(intent, REQUEST_CODE_PICK_PDF)
        } catch (e: Exception) {
            pickerPromise = null
            promise.reject("PICKER_ERROR", "Cannot open file picker: ${e.message}")
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_PICK_PDF) {
            return
        }

        val promise = pickerPromise ?: return
        pickerPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.resolve(null)
            return
        }

        val uri = data.data
        if (uri == null) {
            promise.resolve(null)
            return
        }

        try {
            val fileInfo = getFileInfo(uri)
            val result = Arguments.createMap().apply {
                putString("uri", uri.toString())
                putString("name", fileInfo.name)
                putDouble("size", fileInfo.size.toDouble())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("FILE_INFO_ERROR", "Failed to get file info: ${e.message}")
        }
    }

    override fun onNewIntent(intent: Intent) {
        // Not needed
    }

    private fun getFileInfo(uri: Uri): FileInfo {
        var name = "document.pdf"
        var size = 0L

        reactContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)

                if (nameIndex >= 0) {
                    name = cursor.getString(nameIndex) ?: "document.pdf"
                }
                if (sizeIndex >= 0) {
                    size = cursor.getLong(sizeIndex)
                }
            }
        }

        return FileInfo(name, size)
    }

    private data class FileInfo(val name: String, val size: Long)

    companion object {
        private const val REQUEST_CODE_PICK_PDF = 9001
    }
}
