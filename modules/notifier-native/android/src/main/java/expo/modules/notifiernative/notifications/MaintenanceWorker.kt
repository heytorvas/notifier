package expo.modules.notifiernative.notifications

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
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
      ListenerSession.publishActive()
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
  fun rebindIfNeeded(context: Context) {
    val store = NotifierStore(context)
    val granted = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    val nowElapsed = SystemClock.elapsedRealtime()
    val now = System.currentTimeMillis()
    val repaired = enableComponentIfDisabled(context)
    if (repaired) {
      val journal = DeviceJournal(context)
      val messages = journal.diagnostics().map(DiagnosticRecord::message)
      if (ListenerBinding.shouldAnnounce(messages, ListenerBinding.COMPONENT_REENABLED)) {
        journal.quietly { addDiagnostic(ListenerBinding.COMPONENT_REENABLED) }
      }
    }
    if (!granted || ListenerConnectionState.connected) {
      noteConnected(context)
    } else if (store.listenerDownSince == 0L) {
      store.listenerDownSince = now
    }
    val due = ListenerBinding.shouldRebind(
      granted,
      ListenerConnectionState.connected,
      nowElapsed,
      ListenerBinding.lastAttemptElapsedMs,
    ) || (repaired && granted && !ListenerConnectionState.connected)
    if (!due) return
    ListenerBinding.lastAttemptElapsedMs = nowElapsed
    NotificationListenerService.requestRebind(ComponentName(context, NotifierListenerService::class.java))
    val journal = DeviceJournal(context)
    if (ListenerBinding.shouldAnnounce(journal.diagnostics().map(DiagnosticRecord::message), ListenerBinding.REBIND_ANNOUNCEMENT)) {
      journal.quietly { addDiagnostic(ListenerBinding.REBIND_ANNOUNCEMENT) }
    }
  }

  fun noteConnected(context: Context) {
    val store = NotifierStore(context)
    if (store.listenerDownSince == 0L) return
    store.listenerDownSince = 0L
  }

  private fun enableComponentIfDisabled(context: Context): Boolean {
    val component = ComponentName(context, NotifierListenerService::class.java)
    val manager = context.packageManager
    if (manager.getComponentEnabledSetting(component) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
      return false
    }
    manager.setComponentEnabledSetting(
      component,
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
      PackageManager.DONT_KILL_APP,
    )
    return true
  }
}
