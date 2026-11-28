package expo.modules.notifiernative.notifications

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.network.RelayClient

internal class RegistrationWorker(
  context: Context,
  workerParameters: WorkerParameters,
) : Worker(context, workerParameters) {
  override fun doWork(): Result {
    val store = NotifierStore(applicationContext)
    val relayUrl = store.relayUrl ?: return Result.success()
    val pairing = store.pairingState ?: return Result.success()
    val ownerToken = pairing.ownerToken ?: return Result.success()
    val registrationId = store.registrationId ?: return Result.success()
    return runCatching {
      RelayClient.connected(applicationContext, relayUrl).updateRegistration(pairing.inboxId, ownerToken, registrationId)
      Result.success()
    }.getOrElse { error ->
      if (error is RelayClient.RelayException && DeliveryPolicy.isInboxMissing(error.statusCode, error.message)) {
        PairingSync.forgetPeer(applicationContext)
        Result.success()
      } else if (error is RelayClient.RelayException && error.statusCode in 400..499) {
        Result.failure()
      } else {
        Result.retry()
      }
    }
  }

  companion object {
    private const val UNIQUE_WORK_NAME = "notifier-registration-sync"

    fun enqueue(context: Context) {
      val request = OneTimeWorkRequestBuilder<RegistrationWorker>()
        .setConstraints(
          Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build(),
        )
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        UNIQUE_WORK_NAME,
        ExistingWorkPolicy.REPLACE,
        request,
      )
    }
  }
}
