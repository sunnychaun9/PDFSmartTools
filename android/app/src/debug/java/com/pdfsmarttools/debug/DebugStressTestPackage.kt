package com.pdfsmarttools.debug

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage for [DebugStressTestModule].
 * Same pattern as DeviceCapabilityPackage.
 *
 * Only exists in the debug source set — excluded from release APK.
 */
class DebugStressTestPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(DebugStressTestModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
