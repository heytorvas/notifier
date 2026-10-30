package expo.modules.notifiernative.notifications

import org.junit.Assert.assertFalse
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
}
