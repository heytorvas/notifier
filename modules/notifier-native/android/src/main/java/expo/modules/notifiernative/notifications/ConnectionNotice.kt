package expo.modules.notifiernative.notifications

internal object ConnectionNotice {
  enum class Event { LINK_LOST, LINK_RESTORED, SENDER_DOWN, SENDER_UP }

  fun forPairing(receiver: Boolean, previous: String?, next: String?): Event? {
    if (!receiver || next == null || next == previous) return null
    val failed = next.startsWith(DeliveryPolicy.PAIRING_FAILURE_PREFIX)
    val wasFailed = previous?.startsWith(DeliveryPolicy.PAIRING_FAILURE_PREFIX) == true
    return when {
      failed && !wasFailed -> Event.LINK_LOST
      next == DeliveryPolicy.PAIRING_RESTORED && wasFailed -> Event.LINK_RESTORED
      else -> null
    }
  }

  fun forSender(receiver: Boolean, previous: String, next: String): Event? {
    if (!receiver || previous == next) return null
    return when {
      next == "down" -> Event.SENDER_DOWN
      previous == "down" && next == "up" -> Event.SENDER_UP
      else -> null
    }
  }

  fun title(event: Event): String = when (event) {
    Event.LINK_LOST -> "Connection lost"
    Event.LINK_RESTORED -> "Connection restored"
    Event.SENDER_DOWN -> "Not delivering"
    Event.SENDER_UP -> "Delivering again"
  }

  fun body(event: Event): String = when (event) {
    Event.LINK_LOST -> "This phone can't reach Notifier right now. Alerts may be delayed."
    Event.LINK_RESTORED -> "This phone can reach Notifier again."
    Event.SENDER_DOWN -> "The sending device is not reading notifications."
    Event.SENDER_UP -> "The sending device is reading notifications again."
  }
}
