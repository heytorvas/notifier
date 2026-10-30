package expo.modules.notifiernative.notifications

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MirroredPayloadTest {
  @Test
  fun versionOneUsesTextWhenSummaryIsAbsent() {
    val payload = MirroredPayload.parse(
      JSONObject()
        .put("version", 1)
        .put("sourcePackage", "com.example.bank")
        .put("sourceApp", "Bank")
        .put("title", "Pix")
        .put("text", "Valor de R$ 0,01.")
        .toString(),
    ) as MirroredPayload.Alert

    assertEquals("Valor de R$ 0,01.", payload.summary)
    assertEquals("Valor de R$ 0,01.", payload.detail)
  }

  @Test
  fun versionOneKeepsAShorterSummary() {
    val payload = MirroredPayload.parse(
      """{"version":1,"sourceApp":"Bank","title":"Pix","summary":"Pix recebido","text":"Você recebeu um Pix."}""",
    ) as MirroredPayload.Alert

    assertEquals("Pix recebido", payload.summary)
    assertEquals("Você recebeu um Pix.", payload.detail)
  }

  @Test
  fun rejectsIconPayloadsThatCouldEscapeTheIconDirectory() {
    assertNull(MirroredPayload.parse("""{"version":2,"kind":"icon","packageName":"../secrets","image":"${"a".repeat(32)}"}"""))
  }

  @Test
  fun readsProfileAppsAndIgnoresUnknownFutureVersions() {
    val profile = MirroredPayload.parse(
      """{"version":2,"kind":"profile","brand":"Google","model":"Pixel 8","pairedAt":20,"apps":[{"packageName":"com.example.bank","name":"Bank"}]}""",
    ) as MirroredPayload.Profile

    assertEquals("Pixel 8", profile.model)
    assertEquals(1, profile.apps.size)
    assertTrue(MirroredPayload.parse("""{"version":3,"kind":"profile"}""") == null)
  }
}
