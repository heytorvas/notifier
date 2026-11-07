package expo.modules.notifiernative.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

internal class CryptoStore(context: Context) {
  private val preferences =
    context.getSharedPreferences("notifier_secure_preferences", Context.MODE_PRIVATE)

  fun put(key: String, value: String) {
    check(preferences.edit().putString(key, seal(value)).commit()) {
      "Could not persist encrypted state."
    }
  }

  fun get(key: String): String? = preferences.getString(key, null)?.let(::open)

  fun seal(value: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, wrappingKey())
    return "${encode(cipher.iv)}:${encode(cipher.doFinal(value.toByteArray(Charsets.UTF_8)))}"
  }

  fun open(sealed: String): String? = try {
    val parts = sealed.split(':', limit = 2)
    require(parts.size == 2)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, wrappingKey(), GCMParameterSpec(TAG_BITS, decode(parts[0])))
    String(cipher.doFinal(decode(parts[1])), Charsets.UTF_8)
  } catch (_: Exception) {
    null
  }

  fun remove(key: String) {
    check(preferences.edit().remove(key).commit()) { "Could not clear encrypted value." }
  }

  private fun wrappingKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
      init(
        KeyGenParameterSpec.Builder(
          KEY_ALIAS,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .build(),
      )
      generateKey()
    }
  }

  companion object {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "notifier.local.wrapping.v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128

    fun randomKey(): ByteArray = ByteArray(32).also(SecureRandom()::nextBytes)

    fun encryptPayload(key: ByteArray, plaintext: String): Pair<String, String> {
      require(key.size == 32) { "A 256-bit pairing key is required." }
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"))
      return encode(cipher.iv) to encode(cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8)))
    }

    fun decryptPayload(key: ByteArray, nonce: String, ciphertext: String): String {
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(
        Cipher.DECRYPT_MODE,
        SecretKeySpec(key, "AES"),
        GCMParameterSpec(TAG_BITS, decode(nonce)),
      )
      return String(cipher.doFinal(decode(ciphertext)), Charsets.UTF_8)
    }

    fun encode(bytes: ByteArray): String = UrlBase64.encode(bytes)

    fun decode(value: String): ByteArray = UrlBase64.decode(value)
  }
}
