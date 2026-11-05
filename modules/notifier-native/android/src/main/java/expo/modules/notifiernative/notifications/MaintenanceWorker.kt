package expo.modules.notifiernative.notifications

import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import java.util.concurrent.TimeUnit

internal class MaintenanceWorker(
  context: Context,
  workerParameters: WorkerParameters,
) : Worker(context, workerParameters) {
  override fun doWork(): Result {
    val context = applicationContext
    val pairing = NotifierStore(context).pairingState
    if (pairing?.role == DeviceRole.TRANSMITTER) {
      ListenerRecovery.rebindIfNeeded(context)
    }
    PairingSync.refresh(context)
    return Result.success()
  }

  companion object {
    private const val UNIQUE_WORK_NAME = "notifier-maintenance"

    fun enqueue(context: Context) {
      val request = PeriodicWorkRequestBuilder<MaintenanceWorker>(15, TimeUnit.MINUTES).build()
      WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        UNIQUE_WORK_NAME,
        ExistingPeriodicWorkPolicy.UPDATE,
        request,
      )
    }
  }
}

internal object ListenerRecovery {
  @Volatile
  private var announcedDisconnected = false

  fun rebindIfNeeded(context: Context) {
    val granted = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    val now = SystemClock.elapsedRealtime()
    if (!ListenerBinding.shouldRebind(granted, ListenerConnectionState.connected, now, ListenerBinding.lastAttemptElapsedMs)) {
      if (ListenerConnectionState.connected) announcedDisconnected = false
      return
    }
    ListenerBinding.lastAttemptElapsedMs = now
    NotificationListenerService.requestRebind(
      ComponentName(context, NotifierListenerService::class.java),
    )
    if (!announcedDisconnected) {
      announcedDisconnected = true
      DeviceJournal(context).quietly { addDiagnostic("Listener is not connected. Rebind requested.") }
    }
  }

  fun noteConnected() {
    announcedDisconnected = false
  }
}
