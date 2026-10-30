package expo.modules.notifiernative.data

import org.json.JSONObject

internal enum class DeviceRole(val value: String) {
  RECEIVER("receiver"),
  TRANSMITTER("transmitter");

  companion object {
    fun from(value: String): DeviceRole? = entries.firstOrNull { it.value == value }
  }
}

internal data class PairingState(
  val role: DeviceRole,
  val inboxId: String,
  val ownerToken: String?,
  val pairingToken: String?,
  val senderToken: String?,
  val pairingKey: String,
  val receiverClaimed: Boolean = false,
) {
  val isComplete: Boolean
    get() = inboxId.isNotBlank() &&
      pairingKey.isNotBlank() &&
      when (role) {
        DeviceRole.RECEIVER ->
          !ownerToken.isNullOrBlank() && (receiverClaimed || !pairingToken.isNullOrBlank())
        DeviceRole.TRANSMITTER -> !senderToken.isNullOrBlank()
      }
}

internal object PairingStateCodec {
  fun encode(state: PairingState): String =
    JSONObject()
      .put("version", 1)
      .put("role", state.role.value)
      .put("inboxId", state.inboxId)
      .put("ownerToken", state.ownerToken)
      .put("pairingToken", state.pairingToken)
      .put("senderToken", state.senderToken)
      .put("pairingKey", state.pairingKey)
      .put("receiverClaimed", state.receiverClaimed)
      .toString()

  fun decode(encoded: String): PairingState? = runCatching {
    val json = JSONObject(encoded)
    require(json.optInt("version") == 1)
    val state = PairingState(
      role = requireNotNull(DeviceRole.from(json.getString("role"))),
      inboxId = json.getString("inboxId"),
      ownerToken = json.optString("ownerToken").takeIf(String::isNotBlank),
      pairingToken = json.optString("pairingToken").takeIf(String::isNotBlank),
      senderToken = json.optString("senderToken").takeIf(String::isNotBlank),
      pairingKey = json.getString("pairingKey"),
      receiverClaimed = json.optBoolean("receiverClaimed", false),
    )
    state.takeIf(PairingState::isComplete)
  }.getOrNull()
}

internal data class RemoteAppRecord(
  val packageName: String,
  val name: String,
)

internal data class PendingCleanup(
  val relayUrl: String,
  val inboxId: String,
  val ownerToken: String,
)

internal object PendingCleanupCodec {
  fun encode(cleanup: PendingCleanup): String =
    JSONObject()
      .put("version", 1)
      .put("relayUrl", cleanup.relayUrl)
      .put("inboxId", cleanup.inboxId)
      .put("ownerToken", cleanup.ownerToken)
      .toString()

  fun decode(encoded: String): PendingCleanup? = runCatching {
    val json = JSONObject(encoded)
    require(json.optInt("version") == 1)
    PendingCleanup(
      relayUrl = json.getString("relayUrl").also { require(it.isNotBlank()) },
      inboxId = json.getString("inboxId").also { require(it.isNotBlank()) },
      ownerToken = json.getString("ownerToken").also { require(it.isNotBlank()) },
    )
  }.getOrNull()
}
