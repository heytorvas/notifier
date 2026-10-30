package expo.modules.notifiernative.notifications

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationContentTest {
  @Test
  fun keepsPlainTitleAndBody() {
    val content = extractNotificationText(
      NotificationTextSources(
        title = "Transferência recebida",
        text = "Recebemos sua transferência de R$ 0,01.",
      ),
    )

    assertEquals("Transferência recebida", content?.title)
    assertEquals("Recebemos sua transferência de R$ 0,01.", content?.summary)
    assertEquals(content?.summary, content?.detail)
  }

  @Test
  fun readsMessagingTextWhenStandardBodyIsMissing() {
    val pix = "Você recebeu um Pix de Heytor Victor Araujo Silva ***.447.093-** no valor de R$ 0,01."
    val content = extractNotificationText(
      NotificationTextSources(
        title = "Pix Recebido",
        messages = listOf(pix),
      ),
    )

    assertEquals("Pix Recebido", content?.title)
    assertEquals(pix, content?.detail)
  }

  @Test
  fun keepsShortAndExpandedTextWhenTheyDiffer() {
    val content = extractNotificationText(
      NotificationTextSources(
        title = "Pix Recebido",
        text = "Pix recebido",
        bigText = "Você recebeu um Pix de R$ 0,01.",
      ),
    )

    assertEquals("Pix recebido", content?.summary)
    assertEquals("Pix recebido\nVocê recebeu um Pix de R$ 0,01.", content?.detail)
  }

  @Test
  fun blankBigTextDoesNotHideTheNormalBody() {
    val content = extractNotificationText(
      NotificationTextSources(
        title = "Pix Recebido",
        text = "Valor de R$ 0,01.",
        bigText = "   ",
      ),
    )

    assertEquals("Valor de R$ 0,01.", content?.detail)
  }

  @Test
  fun joinsDistinctInboxLines() {
    val content = extractNotificationText(
      NotificationTextSources(
        title = "Inbox",
        textLines = listOf("First transfer", "Second transfer"),
      ),
    )

    assertEquals("First transfer", content?.summary)
    assertEquals("First transfer\nSecond transfer", content?.detail)
  }

  @Test
  fun dropsEmptyNotifications() {
    assertNull(extractNotificationText(NotificationTextSources(title = "  ", text = "")))
  }

  @Test
  fun payloadKeepsTheFullBodyAndAddsSummaryOnlyWhenShorter() {
    val expanded = alertPayload(
      packageName = "com.example.bank",
      appName = "Bank",
      content = NotificationText("Pix", "Pix recebido", "Você recebeu um Pix."),
      postedAt = 10,
      sourceKey = "1",
    )
    val json = JSONObject(expanded)
    assertEquals("Você recebeu um Pix.", json.getString("text"))
    assertEquals("Pix recebido", json.getString("summary"))

    val same = JSONObject(
      alertPayload(
        packageName = "com.example.bank",
        appName = "Bank",
        content = NotificationText("Pix", "Valor", "Valor"),
        postedAt = 10,
        sourceKey = "1",
      ),
    )
    assertFalse(same.has("summary"))
    assertEquals("Valor", same.getString("text"))
  }
}
