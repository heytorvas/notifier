package expo.modules.notifiernative.notifications

internal object DeliveryPolicy {
  fun isExpired(now: Long, expiresAt: Long): Boolean = now > expiresAt

  fun shouldRetry(statusCode: Int): Boolean =
    statusCode == 408 ||
      statusCode == 425 ||
      statusCode == 429 ||
      statusCode >= 500
}
