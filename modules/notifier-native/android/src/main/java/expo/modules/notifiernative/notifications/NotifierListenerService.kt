package expo.modules.notifiernative.notifications

import android.app.Notification
import android.content.ComponentName
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.security.CryptoStore
import java.util.UUID

class NotifierListenerService : NotificationListenerService() {
  override fun onListenerConnected() {
    ListenerConnectionState.connected = true
    super.onListenerConnected()
  }

  override fun onListenerDisconnected() {
    ListenerConnectionState.connected = false
    requestRebind(ComponentName(this, NotifierListenerService::class.java))
    super.onListenerDisconnected()
  }

  override fun onDestroy() {
    ListenerConnectionState.connected = false
    super.onDestroy()
  }

  override fun onNotificationPosted(notification: StatusBarNotification) {
    val store = NotifierStore(applicationContext)
    val pairing = store.pairingState ?: return
    if (pairing.role != DeviceRole.TRANSMITTER) return
    if (notification.packageName == packageName) return
    if (notification.packageName !in store.selectedPackages) return
    if (notification.notification.flags and Notification.FLAG_ONGOING_EVENT != 0) return
    if (notification.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

    val key = runCatching { CryptoStore.decode(pairing.pairingKey) }.getOrNull() ?: return
    val payload = notification.toPayload() ?: return
    val (nonce, ciphertext) = runCatching {
      CryptoStore.encryptPayload(key, payload)
    }.getOrNull() ?: return
    RelayMessageWorker.enqueue(
      context = applicationContext,
      messageId = UUID.randomUUID().toString(),
      inboxId = pairing.inboxId,
      nonce = nonce,
      ciphertext = ciphertext,
      expiresAt = notification.postTime + DELIVERY_TTL_MS,
    )
  }

  private fun StatusBarNotification.toPayload(): String? {
    val extras = notification.extras
    val content = extractNotificationText(
      NotificationTextSources(
        title = extras.text(Notification.EXTRA_TITLE),
        titleBig = extras.text(Notification.EXTRA_TITLE_BIG),
        text = extras.text(Notification.EXTRA_TEXT),
        bigText = extras.text(Notification.EXTRA_BIG_TEXT),
        subText = extras.text(Notification.EXTRA_SUB_TEXT),
        summaryText = extras.text(Notification.EXTRA_SUMMARY_TEXT),
        infoText = extras.text(Notification.EXTRA_INFO_TEXT),
        ticker = notification.tickerText?.toString(),
        textLines = extras.lines(Notification.EXTRA_TEXT_LINES),
        messages = extras.messages(Notification.EXTRA_MESSAGES) +
          extras.messages(Notification.EXTRA_HISTORIC_MESSAGES),
      ),
    ) ?: return null

    val appName = runCatching {
      val info = packageManager.getApplicationInfo(packageName, 0)
      packageManager.getApplicationLabel(info).toString()
    }.getOrDefault(packageName)

    return alertPayload(
      packageName = packageName,
      appName = appName,
      content = content,
      postedAt = postTime,
      sourceKey = key.hashCode().toString(),
    )
  }

  companion object {
    private const val DELIVERY_TTL_MS = 7 * 24 * 60 * 60 * 1_000L
  }
}

private fun Bundle.text(key: String): String? =
  getCharSequence(key)?.toString()?.trim()?.takeIf(String::isNotEmpty)

private fun Bundle.lines(key: String): List<String> =
  getCharSequenceArray(key)
    ?.mapNotNull { it?.toString()?.trim()?.takeIf(String::isNotEmpty) }
    .orEmpty()

@Suppress("DEPRECATION")
private fun Bundle.messages(key: String): List<String> {
  val items = getParcelableArray(key) ?: return emptyList()
  return items.mapNotNull { item ->
    val bundle = item as? Bundle ?: return@mapNotNull null
    val text = bundle.getCharSequence("text")?.toString()?.trim().orEmpty()
    val sender = bundle.getCharSequence("sender")?.toString()?.trim().orEmpty()
    when {
      text.isEmpty() -> sender.takeIf(String::isNotEmpty)
      sender.isEmpty() || text.contains(sender) -> text
      else -> "$sender: $text"
    }
  }
}
