package expo.modules.notifiernative.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import android.graphics.Bitmap
import android.util.Base64
import expo.modules.notifiernative.R
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.data.RemoteAppRecord
import expo.modules.notifiernative.security.CryptoStore

class NotifierMessagingService : FirebaseMessagingService() {
  override fun onCreate() {
    super.onCreate()
    runCatching { MaintenanceWorker.enqueue(this) }
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val store = NotifierStore(applicationContext)
    val pairing = store.pairingState ?: return
    if (pairing.role != DeviceRole.RECEIVER) return
    val journal = DeviceJournal(applicationContext)
    val nonce = message.data["nonce"] ?: return
    val ciphertext = message.data["ciphertext"] ?: return
    val messageId = message.data["messageId"] ?: return
    val key = runCatching { CryptoStore.decode(pairing.pairingKey) }.getOrNull()
    val encoded = key?.let { runCatching { CryptoStore.decryptPayload(it, nonce, ciphertext) }.getOrNull() }
    if (encoded == null) {
      journal.quietly {
        upsertAlert(incomingFailure(messageId, "Could not decrypt"))
        addDiagnostic("Could not decrypt an alert")
      }
      return
    }
    when (val payload = MirroredPayload.parse(encoded)) {
      is MirroredPayload.Alert -> deliverAlert(journal, payload, messageId)
      is MirroredPayload.Icon -> storeIcon(payload)
      is MirroredPayload.Profile -> {
        storeProfile(payload)
        journal.quietly { addDiagnostic("Updated the other device") }
      }
      null -> {
        journal.quietly {
          upsertAlert(incomingFailure(messageId, "Unrecognized alert"))
          addDiagnostic("Dropped an unrecognized alert")
        }
      }
    }
  }

  override fun onRegistered(installationId: String) {
    val store = NotifierStore(applicationContext)
    store.registrationId = installationId
    RegistrationWorker.enqueue(applicationContext)
    DeviceJournal(applicationContext).quietly { addDiagnostic("Registration updated") }
  }

  override fun onDeletedMessages() {
    if (NotifierStore(applicationContext).pairingState?.role == DeviceRole.RECEIVER) {
      DeviceJournal(applicationContext).quietly { addDiagnostic("Firebase discarded queued alerts") }
      postDeliveryWarning()
    }
  }

  private fun deliverAlert(journal: DeviceJournal, payload: MirroredPayload.Alert, messageId: String) {
    if (
      payload.postedAt <= 0 ||
      DeliveryPolicy.isExpired(System.currentTimeMillis(), payload.postedAt + DELIVERY_TTL_MS)
    ) {
      journal.quietly {
        upsertAlert(payload.record(messageId, "failed", "Expired"))
        addDiagnostic("Dropped an expired alert")
      }
      return
    }
    if (
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      journal.quietly {
        upsertAlert(payload.record(messageId, "failed", "Notifications are blocked"))
        addDiagnostic("Could not post an alert: notifications are blocked")
      }
      return
    }
    postNotification(payload, messageId)
    journal.quietly { upsertAlert(payload.record(messageId, "delivered", "")) }
  }

  private fun incomingFailure(messageId: String, detail: String): AlertRecord =
    AlertRecord(
      id = messageId,
      at = System.currentTimeMillis(),
      direction = "in",
      appName = "",
      packageName = "",
      title = "",
      text = "",
      status = "failed",
      detail = detail,
    )

  private fun MirroredPayload.Alert.record(messageId: String, status: String, detail: String): AlertRecord =
    AlertRecord(
      id = messageId,
      at = postedAt.takeIf { it > 0 } ?: System.currentTimeMillis(),
      direction = "in",
      appName = appName,
      packageName = packageName,
      title = title,
      text = detailText(),
      status = status,
      detail = detail,
    )

  private fun MirroredPayload.Alert.detailText(): String = detail.ifBlank { summary }

  private fun storeIcon(payload: MirroredPayload.Icon) {
    val bytes = runCatching { Base64.decode(payload.imageBase64, Base64.DEFAULT) }.getOrNull() ?: return
    IconStore(applicationContext).write(payload.packageName, bytes)
  }

  private fun storeProfile(payload: MirroredPayload.Profile) {
    val store = NotifierStore(applicationContext)
    if (payload.brand.isNotBlank()) store.peerBrand = payload.brand
    if (payload.model.isNotBlank()) store.peerModel = payload.model
    if (payload.pairedAt != null) store.pairedAt = payload.pairedAt
    store.remoteApps = payload.apps.map { RemoteAppRecord(it.packageName, it.name) }
    IconStore(applicationContext).retain(payload.apps.map(RemoteApp::packageName).toSet())
  }

  private fun postNotification(payload: MirroredPayload.Alert, messageId: String) {
    if (
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) return

    val sourceApp = payload.appName.ifBlank { "App" }
    val displayTitle = if (payload.title.isBlank()) sourceApp else "$sourceApp · ${payload.title}"
    val summary = payload.summary.ifBlank { payload.detail }
    val detail = payload.detail.ifBlank { summary }
    val icon: Bitmap? = payload.packageName.takeIf(String::isNotBlank)?.let {
      IconStore(applicationContext).read(it)
    }

    createNotificationChannel()

    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notifier_notification)
      .setContentTitle(displayTitle)
      .setContentText(summary)
      .setStyle(NotificationCompat.BigTextStyle().bigText(detail))
      .setLargeIcon(icon)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .build()

    val stableId = messageId.hashCode()
    NotificationManagerCompat.from(this).notify(NOTIFICATION_TAG, stableId, notification)
  }

  private fun postDeliveryWarning() {
    if (
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) return
    createNotificationChannel()
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notifier_notification)
      .setContentTitle("Some mirrored alerts expired")
      .setContentText("Firebase discarded queued alerts while this device was offline.")
      .setStyle(
        NotificationCompat.BigTextStyle()
          .bigText("Firebase discarded queued alerts while this device was offline. Check the other device."),
      )
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .build()
    NotificationManagerCompat.from(this)
      .notify(NOTIFICATION_TAG, DELIVERY_WARNING_ID, notification)
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "Mirrored notifications",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Notifications securely mirrored from your paired Android device"
        lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
      },
    )
  }

  companion object {
    private const val CHANNEL_ID = "mirrored_notifications"
    private const val NOTIFICATION_TAG = "notifier.mirrored"
    private const val DELIVERY_WARNING_ID = 0x4E4F5449
    private const val DELIVERY_TTL_MS = 7 * 24 * 60 * 60 * 1_000L
  }
}
