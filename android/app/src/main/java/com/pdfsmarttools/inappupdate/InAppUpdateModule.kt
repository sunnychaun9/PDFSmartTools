package com.pdfsmarttools.inappupdate

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallState
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.play.core.ktx.isFlexibleUpdateAllowed

/**
 * Native module for Google Play In-App Updates (Flexible mode)
 * Allows the app to check for updates and prompt users to update
 * without blocking app usage.
 */
class InAppUpdateModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var appUpdateManager: AppUpdateManager? = null
    private var installStateUpdatedListener: InstallStateUpdatedListener? = null
    private var pendingPromise: Promise? = null

    companion object {
        private const val UPDATE_REQUEST_CODE = 1001
        private const val MODULE_NAME = "InAppUpdate"
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = MODULE_NAME

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Check if an update is available from the Play Store
     * Returns update info including availability and version details
     */
    @ReactMethod
    fun checkForUpdate(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No activity available")
                return
            }

            appUpdateManager = AppUpdateManagerFactory.create(activity)
            val appUpdateInfoTask = appUpdateManager?.appUpdateInfo

            appUpdateInfoTask?.addOnSuccessListener { appUpdateInfo ->
                val result = Arguments.createMap().apply {
                    putInt("updateAvailability", appUpdateInfo.updateAvailability())
                    putBoolean(
                        "isUpdateAvailable",
                        appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                    )
                    putBoolean(
                        "isFlexibleUpdateAllowed",
                        appUpdateInfo.isFlexibleUpdateAllowed
                    )
                    putInt("availableVersionCode", appUpdateInfo.availableVersionCode())
                    putInt("installStatus", appUpdateInfo.installStatus())
                    putBoolean(
                        "isUpdateDownloaded",
                        appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED
                    )
                }
                promise.resolve(result)
            }?.addOnFailureListener { exception ->
                promise.reject("CHECK_FAILED", exception.message, exception)
            }
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Start the flexible update flow
     * Downloads update in background while user continues using app
     */
    @ReactMethod
    fun startFlexibleUpdate(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No activity available")
                return
            }

            if (appUpdateManager == null) {
                appUpdateManager = AppUpdateManagerFactory.create(activity)
            }

            pendingPromise = promise

            // Register listener for download progress
            installStateUpdatedListener = InstallStateUpdatedListener { state ->
                handleInstallState(state)
            }
            appUpdateManager?.registerListener(installStateUpdatedListener!!)

            val appUpdateInfoTask = appUpdateManager?.appUpdateInfo
            appUpdateInfoTask?.addOnSuccessListener { appUpdateInfo ->
                if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                    appUpdateInfo.isFlexibleUpdateAllowed
                ) {
                    try {
                        val updateOptions = AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
                        appUpdateManager?.startUpdateFlowForResult(
                            appUpdateInfo,
                            activity,
                            updateOptions,
                            UPDATE_REQUEST_CODE
                        )
                    } catch (e: IntentSender.SendIntentException) {
                        pendingPromise?.reject("START_FAILED", e.message, e)
                        pendingPromise = null
                    }
                } else {
                    pendingPromise?.reject("UPDATE_NOT_AVAILABLE", "No flexible update available")
                    pendingPromise = null
                }
            }?.addOnFailureListener { exception ->
                pendingPromise?.reject("UPDATE_CHECK_FAILED", exception.message, exception)
                pendingPromise = null
            }
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message, e)
        }
    }

    /**
     * Handle install state changes and emit events to JS
     */
    private fun handleInstallState(state: InstallState) {
        val params = Arguments.createMap().apply {
            putInt("status", state.installStatus())
            putDouble("bytesDownloaded", state.bytesDownloaded().toDouble())
            putDouble("totalBytesToDownload", state.totalBytesToDownload().toDouble())
        }

        when (state.installStatus()) {
            InstallStatus.DOWNLOADING -> {
                val progress = if (state.totalBytesToDownload() > 0) {
                    (state.bytesDownloaded() * 100 / state.totalBytesToDownload()).toInt()
                } else 0
                params.putInt("progress", progress)
                sendEvent("InAppUpdateProgress", params)
            }
            InstallStatus.DOWNLOADED -> {
                sendEvent("InAppUpdateDownloaded", params)
                pendingPromise?.resolve(Arguments.createMap().apply {
                    putBoolean("downloaded", true)
                })
                pendingPromise = null
            }
            InstallStatus.FAILED -> {
                sendEvent("InAppUpdateFailed", params)
                pendingPromise?.reject("DOWNLOAD_FAILED", "Update download failed")
                pendingPromise = null
            }
            InstallStatus.CANCELED -> {
                sendEvent("InAppUpdateCanceled", params)
                pendingPromise?.reject("UPDATE_CANCELED", "Update was canceled by user")
                pendingPromise = null
            }
            InstallStatus.INSTALLED -> {
                sendEvent("InAppUpdateInstalled", params)
                unregisterListener()
            }
            else -> {
                // PENDING, INSTALLING, etc.
                sendEvent("InAppUpdateStatus", params)
            }
        }
    }

    /**
     * Complete the update by restarting the app
     * Should be called after update is downloaded
     */
    @ReactMethod
    fun completeUpdate(promise: Promise) {
        try {
            appUpdateManager?.completeUpdate()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("COMPLETE_ERROR", e.message, e)
        }
    }

    /**
     * Check if there's a downloaded update waiting to be installed
     */
    @ReactMethod
    fun checkDownloadedUpdate(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No activity available")
                return
            }

            if (appUpdateManager == null) {
                appUpdateManager = AppUpdateManagerFactory.create(activity)
            }

            appUpdateManager?.appUpdateInfo?.addOnSuccessListener { appUpdateInfo ->
                val isDownloaded = appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED
                promise.resolve(isDownloaded)
            }?.addOnFailureListener { exception ->
                promise.reject("CHECK_FAILED", exception.message, exception)
            }
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Unregister the install state listener
     */
    private fun unregisterListener() {
        installStateUpdatedListener?.let {
            appUpdateManager?.unregisterListener(it)
        }
        installStateUpdatedListener = null
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode == UPDATE_REQUEST_CODE) {
            when (resultCode) {
                Activity.RESULT_OK -> {
                    // Update flow started successfully
                    // Wait for InstallStateUpdatedListener to report download completion
                }
                Activity.RESULT_CANCELED -> {
                    pendingPromise?.reject("UPDATE_CANCELED", "User canceled the update")
                    pendingPromise = null
                }
                else -> {
                    pendingPromise?.reject("UPDATE_FAILED", "Update flow failed with code: $resultCode")
                    pendingPromise = null
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        // Not needed for in-app updates
    }

    override fun invalidate() {
        super.invalidate()
        unregisterListener()
        appUpdateManager = null
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
