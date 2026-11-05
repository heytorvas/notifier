package expo.modules.notifiernative.notifications

internal object DeliveryPolicy {
  const val INBOX_MISSING = "Inbox not found."

  fun isExpired(now: Long, expiresAt: Long): Boolean = now > expiresAt

  fun shouldRetry(statusCode: Int): Boolean =
    statusCode == 408 ||
      statusCode == 425 ||
      statusCode == 429 ||
      statusCode >= 500

  fun isInboxMissing(statusCode: Int, message: String?): Boolean =
    statusCode == 404 && message == INBOX_MISSING

  fun sendFailure(statusCode: Int?, message: String?): SendFailure = when {
    statusCode != null && isInboxMissing(statusCode, message) -> SendFailure.UNPAIRED
    statusCode != null && !shouldRetry(statusCode) -> SendFailure.REJECTED
    else -> SendFailure.RETRY
  }

  fun pairingFailureMessage(previousStatus: Int?, status: Int): String? {
    if (previousStatus == status) return null
    return if (status == NETWORK_FAILURE) "Pairing check failed" else "Pairing check failed ($status)"
  }

  const val NETWORK_FAILURE = -1
  const val MISSING_ROUTE_ATTEMPTS = 20

  fun retryMissingRoute(runAttemptCount: Int): Boolean = runAttemptCount < MISSING_ROUTE_ATTEMPTS

  enum class SendFailure { RETRY, UNPAIRED, REJECTED }
}
