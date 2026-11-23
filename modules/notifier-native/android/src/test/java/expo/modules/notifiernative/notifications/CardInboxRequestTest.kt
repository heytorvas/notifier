package expo.modules.notifiernative.notifications

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

class CardInboxRequestTest {
  @Test
  fun appendTargetsTheExistingInboxTab() {
    val row = CardInboxRow("id-1", "source-1", "C6", "0567", "21/11/2026", "Loja", 2898, 1)
    val url = CardInboxRequest.url("sheet id")
    val body = JSONObject(CardInboxRequest.body(row))
    val values = body.getJSONArray("values").getJSONArray(0)

    assertTrue(url.startsWith("https://sheets.googleapis.com/"))
    assertTrue(url.contains("Cards"))
    assertFalse(url.contains("CardInbox"))
    assertTrue(url.contains("valueInputOption=RAW"))
    assertEquals(8, values.length())
    assertEquals("id-1", values.getString(0))
    assertEquals("source-1", values.getString(1))
    assertEquals("C6", values.getString(2))
    assertEquals("0567", values.getString(3))
    assertEquals("21/11/2026", values.getString(4))
    assertEquals("Loja", values.getString(5))
    assertEquals("2898", values.getString(6))
    assertEquals("1", values.getString(7))
  }

  @Test
  fun serviceAccountJwtVerifiesWithItsOwnKey() {
    val generator = KeyPairGenerator.getInstance("RSA")
    generator.initialize(2048)
    val pair = generator.generateKeyPair()
    val pem = "-----BEGIN PRIVATE KEY-----\n" +
      Base64.getMimeEncoder(64, byteArrayOf('\n'.code.toByte())).encodeToString(pair.private.encoded) +
      "\n-----END PRIVATE KEY-----"
    val account = parseServiceAccount(
      JSONObject()
        .put("client_email", "bot@test.iam.gserviceaccount.com")
        .put("private_key", pem)
        .toString(),
    )
    val jwt = serviceAccountJwt(account, 1_700_000_000L)
    val parts = jwt.split('.')

    assertEquals(3, parts.size)
    val verifier = Signature.getInstance("SHA256withRSA")
    verifier.initVerify(pair.public)
    verifier.update("${parts[0]}.${parts[1]}".toByteArray(Charsets.UTF_8))
    assertTrue(verifier.verify(expo.modules.notifiernative.security.UrlBase64.decode(parts[2])))
    val claims = JSONObject(
      String(expo.modules.notifiernative.security.UrlBase64.decode(parts[1]), Charsets.UTF_8),
    )
    assertEquals("bot@test.iam.gserviceaccount.com", claims.getString("iss"))
    assertEquals("https://www.googleapis.com/auth/spreadsheets", claims.getString("scope"))
  }
}
