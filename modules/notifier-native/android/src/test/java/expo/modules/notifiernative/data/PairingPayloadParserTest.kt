package expo.modules.notifiernative.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PairingPayloadParserTest {
  @Test
  fun parsesValidPayload() {
    val parsed = PairingPayloadParser.parse(validPayload())

    assertEquals(INBOX_ID, parsed.inboxId)
    assertEquals(TOKEN, parsed.pairingToken)
    assertEquals(KEY, parsed.pairingKey)
  }

  @Test
  fun rejectsUnsupportedVersion() {
    assertThrows(IllegalArgumentException::class.java) {
      PairingPayloadParser.parse(validPayload().replace("\"version\":1", "\"version\":2"))
    }
  }

  @Test
  fun rejectsInvalidInboxId() {
    assertThrows(IllegalArgumentException::class.java) {
      PairingPayloadParser.parse(validPayload().replace(INBOX_ID, "../inboxes"))
    }
  }

  @Test
  fun rejectsInvalidPairingToken() {
    assertThrows(IllegalArgumentException::class.java) {
      PairingPayloadParser.parse(validPayload().replace(TOKEN, "not-a-token"))
    }
  }

  @Test
  fun rejectsInvalidKeyLength() {
    assertThrows(IllegalArgumentException::class.java) {
      PairingPayloadParser.parse(validPayload().replace(KEY, "AA=="))
    }
  }

  @Test
  fun rejectsOversizedPayloadBeforeParsing() {
    assertThrows(IllegalArgumentException::class.java) {
      PairingPayloadParser.parse(" ".repeat(4_097))
    }
  }

  private fun validPayload(): String =
    """{"version":1,"inboxId":"$INBOX_ID","pairingToken":"$TOKEN","key":"$KEY"}"""

  companion object {
    private const val INBOX_ID = "123e4567-e89b-42d3-a456-426614174000"
    private val TOKEN = "a".repeat(43)
    private const val KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
  }
}
