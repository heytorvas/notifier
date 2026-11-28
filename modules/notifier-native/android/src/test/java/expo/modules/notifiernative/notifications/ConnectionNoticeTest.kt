package expo.modules.notifiernative.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class ConnectionNoticeTest {
  @Test
  fun receiverHearsTheLinkFailOnceAndAgainWhenItReturns() {
    val failed = "Pairing check failed: UnknownHostException"
    assertEquals(
      ConnectionNotice.Event.LINK_LOST,
      ConnectionNotice.forPairing(receiver = true, previous = null, next = failed),
    )
    assertNull(ConnectionNotice.forPairing(receiver = true, previous = failed, next = failed))
    assertNull(
      ConnectionNotice.forPairing(
        receiver = true,
        previous = failed,
        next = "Pairing check failed: SocketException",
      ),
    )
    assertEquals(
      ConnectionNotice.Event.LINK_RESTORED,
      ConnectionNotice.forPairing(
        receiver = true,
        previous = failed,
        next = DeliveryPolicy.PAIRING_RESTORED,
      ),
    )
    assertNull(
      ConnectionNotice.forPairing(
        receiver = false,
        previous = null,
        next = failed,
      ),
    )
  }

  @Test
  fun receiverHearsWhenTheSenderStopsAndResumesReading() {
    assertEquals(
      ConnectionNotice.Event.SENDER_DOWN,
      ConnectionNotice.forSender(receiver = true, previous = "up", next = "down"),
    )
    assertEquals(
      ConnectionNotice.Event.SENDER_DOWN,
      ConnectionNotice.forSender(receiver = true, previous = "unknown", next = "down"),
    )
    assertNull(ConnectionNotice.forSender(receiver = true, previous = "down", next = "down"))
    assertEquals(
      ConnectionNotice.Event.SENDER_UP,
      ConnectionNotice.forSender(receiver = true, previous = "down", next = "up"),
    )
    assertNull(ConnectionNotice.forSender(receiver = true, previous = "unknown", next = "up"))
    assertNull(ConnectionNotice.forSender(receiver = false, previous = "up", next = "down"))
  }

  @Test
  fun noticesStayFreeOfRelayAndExceptionDetail() {
    ConnectionNotice.Event.entries.forEach { event ->
      val text = "${ConnectionNotice.title(event)} ${ConnectionNotice.body(event)}"
      assertFalse(text.contains("Exception"))
      assertFalse(text.contains("http"))
      assertFalse(text.contains("relay"))
    }
  }
}
