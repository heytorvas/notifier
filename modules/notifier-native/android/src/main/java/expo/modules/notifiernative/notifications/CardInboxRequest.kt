package expo.modules.notifiernative.notifications

import expo.modules.notifiernative.security.UrlBase64
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.security.KeyFactory
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec

internal data class CardInboxRow(
  val id: String,
  val sourceId: String,
  val card: String,
  val last4: String,
  val date: String,
  val merchant: String,
  val amountCents: Int,
  val installments: Int,
)

internal data class ServiceAccountKey(
  val email: String,
  val privateKey: PrivateKey,
)

internal object CardInboxRequest {
  fun url(spreadsheetId: String): String {
    val id = URLEncoder.encode(spreadsheetId, "UTF-8")
    val range = URLEncoder.encode("Cards!A1", "UTF-8")
    return "https://sheets.googleapis.com/v4/spreadsheets/$id/values/$range:append" +
      "?valueInputOption=RAW&insertDataOption=INSERT_ROWS"
  }

  fun body(row: CardInboxRow): String {
    val values = JSONArray().put(
      JSONArray()
        .put(row.id)
        .put(row.sourceId)
        .put(row.card)
        .put(row.last4)
        .put(row.date)
        .put(row.merchant)
        .put(row.amountCents.toString())
        .put(row.installments.toString()),
    )
    return JSONObject().put("values", values).toString()
  }
}

internal fun parseServiceAccount(json: String): ServiceAccountKey {
  val parsed = JSONObject(json)
  return ServiceAccountKey(
    email = parsed.getString("client_email"),
    privateKey = parsePkcs8(parsed.getString("private_key")),
  )
}

internal fun serviceAccountJwt(account: ServiceAccountKey, nowEpochSeconds: Long): String {
  val header = urlJson(JSONObject().put("alg", "RS256").put("typ", "JWT"))
  val claims = urlJson(
    JSONObject()
      .put("iss", account.email)
      .put("scope", "https://www.googleapis.com/auth/spreadsheets")
      .put("aud", "https://oauth2.googleapis.com/token")
      .put("iat", nowEpochSeconds)
      .put("exp", nowEpochSeconds + 3_600),
  )
  val signingInput = "$header.$claims"
  val signature = Signature.getInstance("SHA256withRSA")
  signature.initSign(account.privateKey)
  signature.update(signingInput.toByteArray(Charsets.UTF_8))
  return "$signingInput.${UrlBase64.encode(signature.sign())}"
}

private fun parsePkcs8(pem: String): PrivateKey {
  val body = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace("\\n", "")
    .replace("\r", "")
    .replace("\n", "")
    .trim()
  val key = KeyFactory.getInstance("RSA")
  return key.generatePrivate(PKCS8EncodedKeySpec(UrlBase64.decode(body)))
}

private fun urlJson(json: JSONObject): String =
  UrlBase64.encode(json.toString().toByteArray(Charsets.UTF_8))
