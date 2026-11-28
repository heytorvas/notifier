package expo.modules.notifiernative.notifications

import expo.modules.notifiernative.network.RelayClient
import java.net.SocketException
import java.net.UnknownHostException

internal object ProbeRetries {
  const val ATTEMPTS = 3
  const val DELAY_MS = 400L

  fun again(attempt: Int, error: Throwable): Boolean {
    if (attempt >= ATTEMPTS - 1) return false
    return when (error) {
      is UnknownHostException, is SocketException -> true
      is RelayClient.RelayException -> DeliveryPolicy.shouldRetry(error.statusCode)
      else -> false
    }
  }

  fun delayMs(attempt: Int): Long = DELAY_MS * (attempt + 1)
}
