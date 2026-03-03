package com.pdfsmarttools.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

class SecureStorageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SecureStorage"

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "pdfsmarttools_hmac_key"
        private const val HMAC_ALGORITHM = "HmacSHA256"
    }

    /**
     * Get or create the HMAC key from Android Keystore
     */
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)

        // Check if key already exists
        if (keyStore.containsAlias(KEY_ALIAS)) {
            val entry = keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry
            return entry.secretKey
        }

        // Generate a new HMAC key in Keystore
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
            KEYSTORE_PROVIDER
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                .build()
        )
        return keyGenerator.generateKey()
    }

    /**
     * Sign data with HMAC-SHA256 using Android Keystore key
     * @param data The data string to sign
     * @param promise Returns the Base64-encoded signature
     */
    @ReactMethod
    fun sign(data: String, promise: Promise) {
        try {
            val key = getOrCreateKey()
            val mac = Mac.getInstance(HMAC_ALGORITHM)
            mac.init(key)
            val signature = mac.doFinal(data.toByteArray(Charsets.UTF_8))
            promise.resolve(Base64.encodeToString(signature, Base64.NO_WRAP))
        } catch (e: Exception) {
            promise.reject("SIGN_ERROR", "Failed to sign data: ${e.message}", e)
        }
    }

    /**
     * Verify data against an HMAC-SHA256 signature
     * @param data The original data string
     * @param signature The Base64-encoded signature to verify against
     * @param promise Returns true if signature is valid, false otherwise
     */
    @ReactMethod
    fun verify(data: String, signature: String, promise: Promise) {
        try {
            val key = getOrCreateKey()
            val mac = Mac.getInstance(HMAC_ALGORITHM)
            mac.init(key)
            val computed = mac.doFinal(data.toByteArray(Charsets.UTF_8))
            val expected = Base64.decode(signature, Base64.NO_WRAP)
            promise.resolve(computed.contentEquals(expected))
        } catch (e: Exception) {
            promise.resolve(false) // Fail closed - treat as invalid
        }
    }
}
