package expo.modules.notifiernative.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.notifiernative.R

internal object ConnectionNotifications {
  fun show(context: Context, event: ConnectionNotice.Event) {
    if (!canPost(context)) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Connection", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Tells this phone when Notifier loses or regains its connection"
          lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        },
      )
    }
    val notifications = NotificationManagerCompat.from(context)
    val (id, previous) = ids(event)
    notifications.cancel(TAG, previous)
    notifications.notify(TAG, id, notification(context, event))
  }

  private fun notification(context: Context, event: ConnectionNotice.Event): Notification {
    val text = ConnectionNotice.body(event)
    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notifier_notification)
      .setContentTitle(ConnectionNotice.title(event))
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .build()
  }

  private fun ids(event: ConnectionNotice.Event): Pair<Int, Int> = when (event) {
    ConnectionNotice.Event.LINK_LOST -> LINK_LOST to LINK_RESTORED
    ConnectionNotice.Event.LINK_RESTORED -> LINK_RESTORED to LINK_LOST
    ConnectionNotice.Event.SENDER_DOWN -> SENDER_DOWN to SENDER_UP
    ConnectionNotice.Event.SENDER_UP -> SENDER_UP to SENDER_DOWN
  }

  private fun canPost(context: Context): Boolean =
    (
      Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
      ) && NotificationManagerCompat.from(context).areNotificationsEnabled()

  private const val CHANNEL_ID = "connection_status"
  private const val TAG = "notifier.connection"
  private const val LINK_LOST = 0x4E4F5401
  private const val LINK_RESTORED = 0x4E4F5402
  private const val SENDER_DOWN = 0x4E4F5403
  private const val SENDER_UP = 0x4E4F5404
}
