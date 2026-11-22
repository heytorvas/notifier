package expo.modules.notifiernative.network

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

internal class RelayClient(private val baseUrl: String) {
  init {
    require(URI(baseUrl).scheme == "https") { "The relay URL must use HTTPS." }
  }

  fun createInbox(fid: String): InboxCredentials {
    val response = request(
      path = "/v1/inboxes",
      method = "POST",
      body = JSONObject().put("fid", fid),
    )
    return InboxCredentials(
      inboxId = response.requireString("inboxId"),
      ownerToken = response.requireString("ownerToken"),
      pairingToken = response.requireString("pairingToken"),
    )
  }

  fun claimInbox(inboxId: String, pairingToken: String): ClaimResult {
    val response = request(
      path = "/v1/inboxes/$inboxId/claim",
      method = "POST",
      bearerToken = pairingToken,
      body = JSONObject(),
    )
    return ClaimResult(
      senderToken = response.requireString("senderToken"),
      claimedAt = response.optionalLong("claimedAt"),
    )
  }

  fun updateRegistration(inboxId: String, ownerToken: String, fid: String) {
    request(
      path = "/v1/inboxes/$inboxId/registration",
      method = "PUT",
      bearerToken = ownerToken,
      body = JSONObject().put("fid", fid),
    )
  }

  fun pairingStatus(inboxId: String, ownerToken: String): PairingStatus {
    val response = request(
      path = "/v1/inboxes/$inboxId/status",
      method = "GET",
      bearerToken = ownerToken,
      body = null,
    )
    return PairingStatus(
      claimed = response.getBoolean("claimed"),
      claimedAt = response.optionalLong("claimedAt"),
      senderListener = response.senderListener(),
    )
  }

  fun reportListener(inboxId: String, senderToken: String, listening: Boolean) {
    request(
      path = "/v1/inboxes/$inboxId/listener",
      method = "PUT",
      bearerToken = senderToken,
      body = JSONObject().put("listening", listening),
    )
  }

  fun publishDevice(inboxId: String, ownerToken: String, brand: String, model: String) {
    request(
      path = "/v1/inboxes/$inboxId/device",
      method = "PUT",
      bearerToken = ownerToken,
      body = JSONObject().put("brand", brand).put("model", model),
    )
  }

  fun fetchDevice(inboxId: String, senderToken: String): RemoteDevice {
    val response = request(
      path = "/v1/inboxes/$inboxId/device",
      method = "GET",
      bearerToken = senderToken,
      body = null,
    )
    return RemoteDevice(
      brand = response.optString("brand"),
      model = response.optString("model"),
      pairedAt = response.optionalLong("pairedAt"),
    )
  }

  fun send(
    inboxId: String,
    senderToken: String,
    messageId: String,
    nonce: String,
    ciphertext: String,
  ) {
    request(
      path = "/v1/inboxes/$inboxId/messages",
      method = "POST",
      bearerToken = senderToken,
      body = JSONObject()
        .put("version", 1)
        .put("messageId", messageId)
        .put("nonce", nonce)
        .put("ciphertext", ciphertext),
    )
  }

  fun unpair(inboxId: String, token: String) {
    request(
      path = "/v1/inboxes/$inboxId/unpair",
      method = "POST",
      bearerToken = token,
      body = JSONObject(),
    )
  }

  fun deleteInbox(inboxId: String, ownerToken: String) {
    request(
      path = "/v1/inboxes/$inboxId",
      method = "DELETE",
      bearerToken = ownerToken,
      body = JSONObject(),
    )
  }

  private fun request(
    path: String,
    method: String,
    body: JSONObject?,
    bearerToken: String? = null,
  ): JSONObject {
    val connection = URL("$baseUrl$path").openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = method
      connection.connectTimeout = CONNECT_TIMEOUT_MS
      connection.readTimeout = READ_TIMEOUT_MS
      connection.doOutput = body != null
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Accept", "application/json")
      bearerToken?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
      body?.let {
        connection.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
          writer.write(it.toString())
        }
      }

      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val responseBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
      if (status !in 200..299) {
        val message = runCatching { JSONObject(responseBody).optString("error") }.getOrNull()
        throw RelayException(status, message?.takeIf(String::isNotBlank) ?: "Relay request failed.")
      }
      if (responseBody.isBlank()) JSONObject() else JSONObject(responseBody)
    } finally {
      connection.disconnect()
    }
  }

  data class InboxCredentials(
    val inboxId: String,
    val ownerToken: String,
    val pairingToken: String,
  )

  data class ClaimResult(
    val senderToken: String,
    val claimedAt: Long?,
  )

  data class PairingStatus(
    val claimed: Boolean,
    val claimedAt: Long?,
    val senderListener: String,
  )

  data class RemoteDevice(
    val brand: String,
    val model: String,
    val pairedAt: Long?,
  )

  class RelayException(val statusCode: Int, message: String) : Exception(message)

  private fun JSONObject.requireString(key: String): String =
    getString(key).also { require(it.isNotBlank()) { "Relay returned an empty $key." } }

  private fun JSONObject.optionalLong(key: String): Long? =
    optLong(key).takeIf { has(key) && !isNull(key) && it > 0L }

  private fun JSONObject.senderListener(): String {
    val value = optString("senderListener")
    return if (value == "up" || value == "down" || value == "unknown") value else "unknown"
  }

  companion object {
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 15_000
  }
}
