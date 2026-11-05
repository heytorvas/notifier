package expo.modules.notifiernative.notifications

import android.app.Notification
import android.content.ComponentName
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.security.CryptoStore
import org.json.JSONObject
import java.util.UUID

class NotifierListenerService : NotificationListenerService() {
  override fun onCreate() {
    super.onCreate()
    runCatching { MaintenanceWorker.enqueue(this) }
  }

  override fun onListenerConnected() {
    ListenerConnectionState.connected = true
    ListenerRecovery.noteConnected()
    DeviceJournal(this).quietly { addDiagnostic("Listener connected") }
    super.onListenerConnected()
  }

  override fun onListenerDisconnected() {
    ListenerConnectionState.connected = false
    DeviceJournal(this).quietly { addDiagnostic("Listener disconnected") }
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

    val journal = DeviceJournal(applicationContext)
    val payload = notification.toPayload()
    if (payload == null) {
      journal.quietly {
        upsertAlert(notification.failure("No readable text"))
        addDiagnostic("Dropped an alert from ${notification.packageName}: no readable text")
      }
      return
    }
    val key = runCatching { CryptoStore.decode(pairing.pairingKey) }.getOrNull()
    val encrypted = key?.let { runCatching { CryptoStore.encryptPayload(it, payload) }.getOrNull() }
    if (key == null || encrypted == null) {
      journal.quietly {
        upsertAlert(notification.failure("Could not encrypt"))
        addDiagnostic("Could not encrypt an alert from ${notification.packageName}")
      }
      return
    }
    val messageId = UUID.randomUUID().toString()
    val content = JSONObject(payload)
    RelayMessageWorker.enqueue(
      context = applicationContext,
      messageId = messageId,
      inboxId = pairing.inboxId,
      nonce = encrypted.first,
      ciphertext = encrypted.second,
      expiresAt = notification.postTime + DELIVERY_TTL_MS,
    )
    journal.quietly {
      upsertAlert(
        AlertRecord(
          id = messageId,
          at = notification.postTime,
          direction = "out",
          appName = content.optString("sourceApp"),
          packageName = notification.packageName,
          title = content.optString("title"),
          text = content.optString("text"),
          status = "pending",
          detail = "",
        ),
      )
    }
  }

  private fun StatusBarNotification.failure(detail: String): AlertRecord {
    val sourcePackage = this.packageName
    val appName = runCatching {
      val info = this@NotifierListenerService.packageManager.getApplicationInfo(sourcePackage, 0)
      this@NotifierListenerService.packageManager.getApplicationLabel(info).toString()
    }.getOrDefault(sourcePackage)
    return AlertRecord(
      id = UUID.randomUUID().toString(),
      at = postTime,
      direction = "out",
      appName = appName,
      packageName = sourcePackage,
      title = "",
      text = "",
      status = "failed",
      detail = detail,
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
