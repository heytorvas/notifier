package expo.modules.notifiernative.notifications

internal object DeliveryPolicy {
  const val INBOX_MISSING = "Inbox not found."
  const val PAIRING_FAILURE_PREFIX = "Pairing check failed"
  const val PAIRING_RESTORED = "Pairing check restored"

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

  fun shouldProbePairing(hasValidatedNetwork: Boolean): Boolean = hasValidatedNetwork

  fun newestPairingMessage(newestFirst: List<String>): String? =
    newestFirst.firstOrNull { it == PAIRING_RESTORED || it.startsWith(PAIRING_FAILURE_PREFIX) }

  fun nextPairingFailure(previous: String?, status: Int, reason: String?): String? {
    val message = describePairingFailure(status, reason)
    return message.takeIf { it != previous }
  }

  private fun describePairingFailure(status: Int, reason: String?): String {
    val base = if (status == NETWORK_FAILURE) {
      PAIRING_FAILURE_PREFIX
    } else {
      "$PAIRING_FAILURE_PREFIX ($status)"
    }
    val detail = reason?.trim()?.takeIf(String::isNotEmpty)?.take(MAX_FAILURE_REASON)
    return if (detail == null) base else "$base: $detail"
  }

  const val NETWORK_FAILURE = -1
  const val MISSING_ROUTE_ATTEMPTS = 20
  private const val MAX_FAILURE_REASON = 60

  fun retryMissingRoute(runAttemptCount: Int): Boolean = runAttemptCount < MISSING_ROUTE_ATTEMPTS

  enum class SendFailure { RETRY, UNPAIRED, REJECTED }
}
