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
  fun pairingCheckLogsAFailureOnceUntilItChanges() {
    assertEquals("Pairing check failed (503)", DeliveryPolicy.pairingFailureMessage(null, 503))
    assertNull(DeliveryPolicy.pairingFailureMessage(503, 503))
    assertEquals("Pairing check failed", DeliveryPolicy.pairingFailureMessage(503, DeliveryPolicy.NETWORK_FAILURE))
    assertNull(DeliveryPolicy.pairingFailureMessage(DeliveryPolicy.NETWORK_FAILURE, DeliveryPolicy.NETWORK_FAILURE))
  }
}
