package expo.modules.notifiernative.notifications

import expo.modules.notifiernative.network.RelayClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class ProbeRetriesTest {
  @Test
  fun transportFailuresAreRetriedUntilTheLastProbe() {
    val dns = UnknownHostException("relay.example")
    assertTrue(ProbeRetries.again(0, dns))
    assertTrue(ProbeRetries.again(1, dns))
    assertFalse(ProbeRetries.again(2, dns))
    assertTrue(ProbeRetries.again(0, SocketException("Connection reset")))
    assertEquals(400L, ProbeRetries.delayMs(0))
    assertEquals(800L, ProbeRetries.delayMs(1))
  }

  @Test
  fun aTimeoutIsNotRetriedBecauseEachAttemptAlreadyWaitedForTheRelay() {
    assertFalse(ProbeRetries.again(0, SocketTimeoutException("timeout")))
  }

  @Test
  fun httpAndLocalFailuresAreNotRetriedUnlessTheStatusIsTransient() {
    assertTrue(ProbeRetries.again(0, RelayClient.RelayException(503, "Unavailable.")))
    assertTrue(ProbeRetries.again(0, RelayClient.RelayException(429, "Too many.")))
    assertFalse(ProbeRetries.again(0, RelayClient.RelayException(401, "Unauthorized.")))
    assertFalse(ProbeRetries.again(0, RelayClient.RelayException(404, DeliveryPolicy.INBOX_MISSING)))
    assertFalse(ProbeRetries.again(0, IllegalStateException("parse")))
  }
}
