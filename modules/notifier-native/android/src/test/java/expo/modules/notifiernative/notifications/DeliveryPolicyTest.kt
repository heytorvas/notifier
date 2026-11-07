package expo.modules.notifiernative.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeliveryPolicyTest {
  @Test
  fun expiresAtSevenDaysWithoutDroppingBoundaryValue() {
    val expiresAt = 1_000L
    assertFalse(DeliveryPolicy.isExpired(now = expiresAt, expiresAt = expiresAt))
    assertTrue(DeliveryPolicy.isExpired(now = expiresAt + 1, expiresAt = expiresAt))
  }

  @Test
  fun retriesOnlyTransientHttpFailures() {
    listOf(408, 425, 429, 500, 503).forEach {
      assertTrue("Expected $it to retry", DeliveryPolicy.shouldRetry(it))
    }
    listOf(400, 401, 403, 404, 410, 422).forEach {
      assertFalse("Expected $it to be terminal", DeliveryPolicy.shouldRetry(it))
    }
  }

  @Test
  fun onlyTheInboxMissingMessageMeansThePeerUnpaired() {
    assertTrue(DeliveryPolicy.isInboxMissing(404, DeliveryPolicy.INBOX_MISSING))
    assertFalse(DeliveryPolicy.isInboxMissing(404, "Not found."))
    assertFalse(DeliveryPolicy.isInboxMissing(401, DeliveryPolicy.INBOX_MISSING))
  }

  @Test
  fun sendFailureKeepsDeliveryIndependentOfAMissingRoute() {
    assertEquals(
      DeliveryPolicy.SendFailure.UNPAIRED,
      DeliveryPolicy.sendFailure(404, DeliveryPolicy.INBOX_MISSING),
    )
    assertEquals(DeliveryPolicy.SendFailure.REJECTED, DeliveryPolicy.sendFailure(404, "Not found."))
    assertEquals(DeliveryPolicy.SendFailure.REJECTED, DeliveryPolicy.sendFailure(401, "Unauthorized."))
    assertEquals(DeliveryPolicy.SendFailure.RETRY, DeliveryPolicy.sendFailure(503, "Unavailable."))
    assertEquals(DeliveryPolicy.SendFailure.RETRY, DeliveryPolicy.sendFailure(null, null))
  }

  @Test
  fun aMissingUnpairRouteRetriesForAwhileAndThenStops() {
    assertTrue(DeliveryPolicy.retryMissingRoute(0))
    assertTrue(DeliveryPolicy.retryMissingRoute(DeliveryPolicy.MISSING_ROUTE_ATTEMPTS - 1))
    assertFalse(DeliveryPolicy.retryMissingRoute(DeliveryPolicy.MISSING_ROUTE_ATTEMPTS))
  }

  @Test
  fun pairingCheckLogsAFailureOnceUntilTheOutcomeChanges() {
    assertFalse(DeliveryPolicy.shouldProbePairing(hasValidatedNetwork = false))
    assertTrue(DeliveryPolicy.shouldProbePairing(hasValidatedNetwork = true))

    val timeout = checkNotNull(
      DeliveryPolicy.nextPairingFailure(null, DeliveryPolicy.NETWORK_FAILURE, "SocketTimeoutException"),
    )
    assertEquals("Pairing check failed: SocketTimeoutException", timeout)
    assertNull(DeliveryPolicy.nextPairingFailure(timeout, DeliveryPolicy.NETWORK_FAILURE, "SocketTimeoutException"))
    assertEquals("Pairing check failed (503)", DeliveryPolicy.nextPairingFailure(timeout, 503, null))
    assertEquals(
      "Pairing check failed",
      DeliveryPolicy.nextPairingFailure(null, DeliveryPolicy.NETWORK_FAILURE, "   "),
    )
    assertEquals(
      "Pairing check failed: ${"n".repeat(60)}",
      DeliveryPolicy.nextPairingFailure(null, DeliveryPolicy.NETWORK_FAILURE, "n".repeat(80)),
    )

    val activity = listOf("Listener connected", timeout, DeliveryPolicy.PAIRING_RESTORED)
    assertEquals(timeout, DeliveryPolicy.newestPairingMessage(activity))
    assertEquals(
      DeliveryPolicy.PAIRING_RESTORED,
      DeliveryPolicy.newestPairingMessage(listOf("Listener connected", DeliveryPolicy.PAIRING_RESTORED, timeout)),
    )
    assertNull(DeliveryPolicy.newestPairingMessage(listOf("Listener connected")))
    assertEquals(
      timeout,
      DeliveryPolicy.nextPairingFailure(
        DeliveryPolicy.PAIRING_RESTORED,
        DeliveryPolicy.NETWORK_FAILURE,
        "SocketTimeoutException",
      ),
    )
  }
}
