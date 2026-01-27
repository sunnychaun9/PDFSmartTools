package com.pdfsmarttools.textrecognition

import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.*
import java.io.File

class TextRecognitionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.Builder().build())

    override fun getName(): String = "TextRecognition"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun recognizeText(imagePath: String, isPro: Boolean, promise: Promise) {
        scope.launch {
            try {
                // Send initial progress
                sendProgressEvent(0, "Preparing image...")

                val file = File(imagePath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "Image file not found: $imagePath")
                    return@launch
                }

                sendProgressEvent(20, "Loading image...")

                // Create InputImage from file path
                val image = InputImage.fromFilePath(reactContext, Uri.fromFile(file))

                sendProgressEvent(40, "Processing with ML Kit...")

                // Use suspendCancellableCoroutine to bridge the callback-based API
                val result = suspendCancellableCoroutine<com.google.mlkit.vision.text.Text> { continuation ->
                    recognizer.process(image)
                        .addOnSuccessListener { text ->
                            continuation.resume(text) {}
                        }
                        .addOnFailureListener { e ->
                            continuation.cancel(e)
                        }
                }

                sendProgressEvent(80, "Extracting text...")

                // Build the response
                val blocks = Arguments.createArray()
                var totalConfidence = 0f
                var blockCount = 0

                for (block in result.textBlocks) {
                    val blockMap = Arguments.createMap().apply {
                        putString("text", block.text)
                        putDouble("confidence", (block.lines.firstOrNull()?.confidence ?: 0f).toDouble())

                        // Bounding box
                        block.boundingBox?.let { rect ->
                            val boxMap = Arguments.createMap().apply {
                                putInt("left", rect.left)
                                putInt("top", rect.top)
                                putInt("right", rect.right)
                                putInt("bottom", rect.bottom)
                            }
                            putMap("boundingBox", boxMap)
                        }

                        // Lines within this block
                        val linesArray = Arguments.createArray()
                        for (line in block.lines) {
                            val lineMap = Arguments.createMap().apply {
                                putString("text", line.text)
                                putDouble("confidence", (line.confidence ?: 0f).toDouble())
                            }
                            linesArray.pushMap(lineMap)

                            line.confidence?.let {
                                totalConfidence += it
                                blockCount++
                            }
                        }
                        putArray("lines", linesArray)
                    }
                    blocks.pushMap(blockMap)
                }

                sendProgressEvent(100, "Complete!")

                val response = Arguments.createMap().apply {
                    putString("text", result.text)
                    putArray("blocks", blocks)
                    putInt("blockCount", result.textBlocks.size)
                    putDouble("averageConfidence", if (blockCount > 0) (totalConfidence / blockCount).toDouble() else 0.0)
                    putBoolean("hasText", result.text.isNotEmpty())
                }

                promise.resolve(response)

            } catch (e: Exception) {
                promise.reject("OCR_ERROR", e.message ?: "Unknown error during text recognition", e)
            }
        }
    }

    private fun sendProgressEvent(progress: Int, status: String) {
        val params = Arguments.createMap().apply {
            putInt("progress", progress)
            putString("status", status)
        }
        sendEvent("TextRecognitionProgress", params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
        recognizer.close()
    }
}
