package expo.modules.notifiernative.data

import expo.modules.notifiernative.security.CryptoStore
import org.json.JSONObject
import java.util.UUID

internal data class PairingPayload(
  val inboxId: String,
  val pairingToken: String,
  val pairingKey: String,
)

internal object PairingPayloadParser {
  fun parse(encoded: String): PairingPayload {
    require(encoded.toByteArray(Charsets.UTF_8).size <= MAX_PAYLOAD_BYTES) {
      "Pairing code is too large."
    }

    val json = JSONObject(encoded)
    require(json.optInt("version") == 1) { "Unsupported pairing code version." }
    val inboxId = json.requireValue("inboxId")
    require(runCatching { UUID.fromString(inboxId).toString() == inboxId.lowercase() }.getOrDefault(false)) {
      "Invalid inbox identifier."
    }

    val pairingToken = json.requireValue("pairingToken")
    require(TOKEN_REGEX.matches(pairingToken)) { "Invalid pairing token." }

    val pairingKey = json.requireValue("key")
    require(runCatching { CryptoStore.decode(pairingKey).size == KEY_BYTES }.getOrDefault(false)) {
      "Invalid pairing key."
    }

    return PairingPayload(inboxId, pairingToken, pairingKey)
  }

  private fun JSONObject.requireValue(key: String): String =
    getString(key).takeIf(String::isNotBlank) ?: error("Pairing code is missing $key.")

  private val TOKEN_REGEX = Regex("^[A-Za-z0-9_-]{43}$")
  private const val MAX_PAYLOAD_BYTES = 4_096
  private const val KEY_BYTES = 32
}
