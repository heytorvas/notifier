package expo.modules.notifiernative.notifications

import android.app.Notification
import android.content.ComponentName
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.security.CryptoStore
import java.lang.ref.WeakReference
import java.util.UUID

class NotifierListenerService : NotificationListenerService() {
  override fun onCreate() {
    super.onCreate()
    runCatching { MaintenanceWorker.enqueue(this) }
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    ListenerConnectionState.connected = true
    ListenerRecovery.noteConnected()
    ListenerSession.attach(this)
    DeviceJournal(this).quietly { addDiagnostic("Listener connected") }
    publishActiveNotifications()
  }

  override fun onListenerDisconnected() {
    ListenerSession.detach(this)
    ListenerConnectionState.connected = false
    DeviceJournal(this).quietly { addDiagnostic("Listener disconnected") }
    requestRebind(ComponentName(this, NotifierListenerService::class.java))
    super.onListenerDisconnected()
  }

  override fun onDestroy() {
    ListenerSession.detach(this)
    ListenerConnectionState.connected = false
    super.onDestroy()
  }

  override fun onNotificationPosted(notification: StatusBarNotification) {
    runCatching { forward(listOf(notification), catchUp = false) }
      .onFailure(::reportMirrorFailure)
  }

  internal fun publishActiveNotifications() {
    val active = runCatching { activeNotifications }.getOrNull() ?: return
    runCatching { forward(active.toList(), catchUp = true) }
      .onFailure(::reportMirrorFailure)
  }

  private fun forward(notifications: List<StatusBarNotification>, catchUp: Boolean) {
    if (notifications.isEmpty()) return
    synchronized(publishLock) {
      val store = NotifierStore(applicationContext)
      val pairing = store.pairingState ?: return
      if (pairing.role != DeviceRole.TRANSMITTER) return
      val journal = DeviceJournal(applicationContext)
      if (!catchUp) recordUnreadable(notifications, store, journal)
      val candidates = notifications.mapNotNull { it.toCandidate() }
      val pending = MirrorPolicy.pending(
        candidates = candidates,
        ownPackage = packageName,
        selectedPackages = store.selectedPackages,
        delivered = journal.deliveredIdentities(),
        journaled = journaledContent(journal),
      )
      if (pending.isEmpty()) return
      val key = runCatching { CryptoStore.decode(pairing.pairingKey) }.getOrNull()
      if (key == null) {
        journal.quietly { addDiagnostic("Could not encrypt an alert") }
        return
      }
      val now = System.currentTimeMillis()
      val sent = mutableListOf<String>()
      pending.forEach { candidate ->
        if (DeliveryPolicy.isExpired(now, candidate.postTime + DELIVERY_TTL_MS)) return@forEach
        val payload = alertPayload(
          packageName = candidate.packageName,
          appName = candidate.appName.ifBlank { candidate.packageName },
          content = NotificationText(
            title = candidate.title,
            summary = candidate.summary.ifBlank { candidate.text },
            detail = candidate.text,
          ),
          postedAt = candidate.postTime,
          sourceKey = candidate.key.hashCode().toString(),
        )
        val encrypted = runCatching { CryptoStore.encryptPayload(key, payload) }.getOrNull()
        if (encrypted == null) {
          journal.quietly { addDiagnostic("Could not encrypt an alert from ${candidate.packageName}") }
          return@forEach
        }
        val messageId = UUID.randomUUID().toString()
        val queued = runCatching {
          RelayMessageWorker.enqueue(
            context = applicationContext,
            messageId = messageId,
            inboxId = pairing.inboxId,
            nonce = encrypted.first,
            ciphertext = encrypted.second,
            expiresAt = candidate.postTime + DELIVERY_TTL_MS,
          )
        }.isSuccess
        if (!queued) {
          journal.quietly { addDiagnostic("Could not queue an alert from ${candidate.packageName}") }
          return@forEach
        }
        sent += MirrorPolicy.identity(candidate)
        journal.quietly {
          upsertAlert(
            AlertRecord(
              id = messageId,
              at = candidate.postTime,
              direction = "out",
              appName = candidate.appName.ifBlank { candidate.packageName },
              packageName = candidate.packageName,
              title = candidate.title,
              text = candidate.text,
              status = "pending",
              detail = "",
            ),
          )
        }
      }
      if (sent.isEmpty()) return
      journal.rememberDelivered(sent)
      if (catchUp) {
        journal.quietly { addDiagnostic("Queued ${sent.size} alerts still on screen") }
      }
    }
  }

  private fun recordUnreadable(
    notifications: List<StatusBarNotification>,
    store: NotifierStore,
    journal: DeviceJournal,
  ) {
    notifications.forEach { notification ->
      if (notification.packageName == packageName) return@forEach
      if (notification.packageName !in store.selectedPackages) return@forEach
      if (notification.notification.flags and Notification.FLAG_ONGOING_EVENT != 0) return@forEach
      if (notification.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return@forEach
      if (notification.toCandidate() != null) return@forEach
      journal.quietly {
        upsertAlert(notification.failure("No readable text"))
        addDiagnostic("Dropped an alert from ${notification.packageName}: no readable text")
      }
    }
  }

  private fun journaledContent(journal: DeviceJournal): Set<String> =
    journal.alerts().mapNotNull { alert ->
      if (alert.direction != "out") return@mapNotNull null
      if (alert.title.isBlank() && alert.text.isBlank()) return@mapNotNull null
      MirrorPolicy.contentKey(alert.packageName, alert.at, alert.title, alert.text)
    }.toSet()

  private fun reportMirrorFailure(error: Throwable) {
    DeviceJournal(applicationContext).quietly {
      addDiagnostic("Could not mirror an alert (${error.javaClass.simpleName})")
    }
  }

  private fun StatusBarNotification.toCandidate(): MirrorCandidate? {
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
    val sourcePackage = packageName
    return MirrorCandidate(
      key = key,
      packageName = sourcePackage,
      postTime = postTime,
      title = content.title,
      text = content.detail,
      ongoing = notification.flags and Notification.FLAG_ONGOING_EVENT != 0,
      groupSummary = notification.flags and Notification.FLAG_GROUP_SUMMARY != 0,
      appName = applicationLabel(sourcePackage),
      summary = content.summary,
    )
  }

  private fun applicationLabel(sourcePackage: String): String = runCatching {
    val info = packageManager.getApplicationInfo(sourcePackage, 0)
    packageManager.getApplicationLabel(info).toString()
  }.getOrDefault(sourcePackage)

  private fun StatusBarNotification.failure(detail: String): AlertRecord {
    val sourcePackage = this.packageName
    return AlertRecord(
      id = UUID.randomUUID().toString(),
      at = postTime,
      direction = "out",
      appName = applicationLabel(sourcePackage),
      packageName = sourcePackage,
      title = "",
      text = "",
      status = "failed",
      detail = detail,
    )
  }

  companion object {
    private val publishLock = Any()
    private const val DELIVERY_TTL_MS = 7 * 24 * 60 * 60 * 1_000L
  }
}

internal object ListenerSession {
  @Volatile
  private var active = WeakReference<NotifierListenerService>(null)

  fun attach(service: NotifierListenerService) {
    active = WeakReference(service)
  }

  fun detach(service: NotifierListenerService) {
    if (active.get() === service) active = WeakReference(null)
  }

  fun publishActive() {
    active.get()?.publishActiveNotifications()
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
