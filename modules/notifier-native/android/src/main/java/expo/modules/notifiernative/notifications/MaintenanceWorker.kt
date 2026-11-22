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
    if (!granted || ListenerConnectionState.connected) {
      noteConnected(context)
    } else if (store.listenerDownSince == 0L) {
      store.listenerDownSince = now
    }
    val downFor = if (store.listenerDownSince == 0L) 0L else now - store.listenerDownSince
    val sinceReset = store.listenerResetAt.takeIf { it > 0L }?.let { now - it }
    val step = ListenerBinding.recoveryStep(
      shouldAttempt = ListenerBinding.shouldRebind(
        granted,
        ListenerConnectionState.connected,
        nowElapsed,
        ListenerBinding.lastAttemptElapsedMs,
      ),
      downForMs = downFor,
      millisSinceReset = sinceReset,
      resetsThisOutage = store.listenerResetCount,
    )
    if (step == ListenerBinding.RecoveryStep.NONE) return
    ListenerBinding.lastAttemptElapsedMs = nowElapsed
    if (step == ListenerBinding.RecoveryStep.RESET) {
      store.listenerResetAt = System.currentTimeMillis()
      store.listenerResetCount += 1
      resetComponent(context)
    }
    val component = ComponentName(context, NotifierListenerService::class.java)
    NotificationListenerService.requestRebind(component)
    val message = if (step == ListenerBinding.RecoveryStep.RESET) {
      ListenerBinding.RESET_ANNOUNCEMENT
    } else {
      ListenerBinding.REBIND_ANNOUNCEMENT
    }
    val journal = DeviceJournal(context)
    if (ListenerBinding.shouldAnnounce(journal.diagnostics().map(DiagnosticRecord::message), message)) {
      journal.quietly { addDiagnostic(message) }
    }
  }

  fun noteConnected(context: Context) {
    val store = NotifierStore(context)
    if (store.listenerResetCount == 0 && store.listenerResetAt == 0L && store.listenerDownSince == 0L) return
    store.listenerResetCount = 0
    store.listenerResetAt = 0L
    store.listenerDownSince = 0L
  }

  private fun resetComponent(context: Context) {
    val component = ComponentName(context, NotifierListenerService::class.java)
    val manager = context.packageManager
    manager.setComponentEnabledSetting(
      component,
      PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
      PackageManager.DONT_KILL_APP,
    )
    manager.setComponentEnabledSetting(
      component,
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
      PackageManager.DONT_KILL_APP,
    )
  }
}
