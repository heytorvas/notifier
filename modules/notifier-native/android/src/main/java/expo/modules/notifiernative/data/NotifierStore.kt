package expo.modules.notifiernative.data

import android.content.Context
import expo.modules.notifiernative.security.CryptoStore
import org.json.JSONArray
import org.json.JSONObject

internal class NotifierStore(context: Context) {
  private val preferences =
    context.getSharedPreferences("notifier_preferences", Context.MODE_PRIVATE)
  private val secureStore = CryptoStore(context)

  val pairingState: PairingState?
    get() = secureStore.get(KEY_PAIRING_STATE)?.let(PairingStateCodec::decode)

  var relayUrl: String?
    get() = preferences.getString(KEY_RELAY_URL, null)
    set(value) = preferences.edit().putString(KEY_RELAY_URL, value?.trimEnd('/')).apply()

  var selectedPackages: Set<String>
    get() = preferences.getStringSet(KEY_SELECTED_PACKAGES, emptySet())?.toSet().orEmpty()
    set(value) = preferences.edit().putStringSet(KEY_SELECTED_PACKAGES, value).apply()

  var pairedAt: Long?
    get() = preferences.getLong(KEY_PAIRED_AT, 0L).takeIf { it > 0L }
    set(value) {
      if (value == null || value <= 0L) preferences.edit().remove(KEY_PAIRED_AT).apply()
      else preferences.edit().putLong(KEY_PAIRED_AT, value).apply()
    }

  var peerBrand: String
    get() = preferences.getString(KEY_PEER_BRAND, "").orEmpty()
    set(value) = preferences.edit().putString(KEY_PEER_BRAND, value).apply()

  var peerModel: String
    get() = preferences.getString(KEY_PEER_MODEL, "").orEmpty()
    set(value) = preferences.edit().putString(KEY_PEER_MODEL, value).apply()

  var listenerResetCount: Int
    get() = preferences.getInt(KEY_LISTENER_RESETS, 0)
    set(value) = preferences.edit().putInt(KEY_LISTENER_RESETS, value).apply()

  var listenerResetAt: Long
    get() = preferences.getLong(KEY_LISTENER_RESET_AT, 0L)
    set(value) = preferences.edit().putLong(KEY_LISTENER_RESET_AT, value).apply()

  var listenerDownSince: Long
    get() = preferences.getLong(KEY_LISTENER_DOWN_SINCE, 0L)
    set(value) = preferences.edit().putLong(KEY_LISTENER_DOWN_SINCE, value).apply()

  var remoteApps: List<RemoteAppRecord>
    get() = decodeApps(preferences.getString(KEY_REMOTE_APPS, null))
    set(value) = preferences.edit().putString(KEY_REMOTE_APPS, encodeApps(value)).apply()

  val syncedIcons: Set<String>
    get() = preferences.getStringSet(KEY_SYNCED_ICONS, emptySet())?.toSet().orEmpty()

  fun markIconSynced(token: String) {
    preferences.edit().putStringSet(KEY_SYNCED_ICONS, syncedIcons + token).apply()
  }

  fun setFirebaseConfig(
    applicationId: String,
    apiKey: String,
    projectId: String,
    senderId: String,
  ) {
    preferences.edit()
      .putString(KEY_FIREBASE_APPLICATION_ID, applicationId)
      .putString(KEY_FIREBASE_API_KEY, apiKey)
      .putString(KEY_FIREBASE_PROJECT_ID, projectId)
      .putString(KEY_FIREBASE_SENDER_ID, senderId)
      .apply()
  }

  fun firebaseConfig(): FirebaseConfig? {
    val applicationId = preferences.getString(KEY_FIREBASE_APPLICATION_ID, null) ?: return null
    val apiKey = preferences.getString(KEY_FIREBASE_API_KEY, null) ?: return null
    val projectId = preferences.getString(KEY_FIREBASE_PROJECT_ID, null) ?: return null
    val senderId = preferences.getString(KEY_FIREBASE_SENDER_ID, null) ?: return null
    return FirebaseConfig(applicationId, apiKey, projectId, senderId)
  }

  var registrationId: String?
    get() = secureStore.get(KEY_REGISTRATION_ID)
    set(value) = setSecure(KEY_REGISTRATION_ID, value)

  val pendingCleanup: PendingCleanup?
    get() = secureStore.get(KEY_PENDING_CLEANUP)?.let(PendingCleanupCodec::decode)

  fun savePairing(state: PairingState) {
    require(state.isComplete) { "Cannot persist incomplete pairing state." }
    secureStore.put(KEY_PAIRING_STATE, PairingStateCodec.encode(state))
  }

  fun savePendingCleanup(cleanup: PendingCleanup) {
    secureStore.put(KEY_PENDING_CLEANUP, PendingCleanupCodec.encode(cleanup))
  }

  fun clearPendingCleanup() {
    secureStore.remove(KEY_PENDING_CLEANUP)
  }

  fun clearPairing() {
    preferences.edit()
      .remove(KEY_SELECTED_PACKAGES)
      .remove(KEY_PAIRED_AT)
      .remove(KEY_PEER_BRAND)
      .remove(KEY_PEER_MODEL)
      .remove(KEY_LISTENER_RESETS)
      .remove(KEY_LISTENER_RESET_AT)
      .remove(KEY_LISTENER_DOWN_SINCE)
      .remove(KEY_REMOTE_APPS)
      .remove(KEY_SYNCED_ICONS)
      .apply()
    secureStore.remove(KEY_PAIRING_STATE)
    secureStore.remove(KEY_REGISTRATION_ID)
  }

  private fun decodeApps(encoded: String?): List<RemoteAppRecord> {
    if (encoded.isNullOrBlank()) return emptyList()
    return runCatching {
      val array = JSONArray(encoded)
      buildList {
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          val packageName = item.optString("packageName")
          val name = item.optString("name")
          if (packageName.isNotBlank() && name.isNotBlank()) add(RemoteAppRecord(packageName, name))
        }
      }
    }.getOrDefault(emptyList())
  }

  private fun encodeApps(apps: List<RemoteAppRecord>): String {
    val array = JSONArray()
    apps.forEach { app ->
      array.put(JSONObject().put("packageName", app.packageName).put("name", app.name))
    }
    return array.toString()
  }

  private fun setSecure(key: String, value: String?) {
    if (value == null) {
      secureStore.remove(key)
    } else {
      secureStore.put(key, value)
    }
  }

  data class FirebaseConfig(
    val applicationId: String,
    val apiKey: String,
    val projectId: String,
    val senderId: String,
  )

  companion object {
    private const val KEY_RELAY_URL = "relay_url"
    private const val KEY_SELECTED_PACKAGES = "selected_packages"
    private const val KEY_PAIRED_AT = "paired_at"
    private const val KEY_PEER_BRAND = "peer_brand"
    private const val KEY_PEER_MODEL = "peer_model"
    private const val KEY_LISTENER_RESETS = "listener_resets"
    private const val KEY_LISTENER_RESET_AT = "listener_reset_at"
    private const val KEY_LISTENER_DOWN_SINCE = "listener_down_since"
    private const val KEY_REMOTE_APPS = "remote_apps"
    private const val KEY_SYNCED_ICONS = "synced_icons"
    private const val KEY_FIREBASE_APPLICATION_ID = "firebase_application_id"
    private const val KEY_FIREBASE_API_KEY = "firebase_api_key"
    private const val KEY_FIREBASE_PROJECT_ID = "firebase_project_id"
    private const val KEY_FIREBASE_SENDER_ID = "firebase_sender_id"
    private const val KEY_PAIRING_STATE = "pairing_state"
    private const val KEY_REGISTRATION_ID = "registration_id"
    private const val KEY_PENDING_CLEANUP = "pending_cleanup"
  }
}
