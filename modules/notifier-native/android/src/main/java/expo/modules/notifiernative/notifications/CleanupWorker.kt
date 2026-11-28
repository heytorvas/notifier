package expo.modules.notifiernative.notifications

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.network.RelayClient
import java.util.concurrent.TimeUnit

internal class CleanupWorker(
  context: Context,
  workerParameters: WorkerParameters,
) : Worker(context, workerParameters) {
  override fun doWork(): Result {
    val store = NotifierStore(applicationContext)
    val cleanup = store.pendingCleanup ?: return Result.success()
    return runCatching {
      RelayClient.connected(applicationContext, cleanup.relayUrl).unpair(cleanup.inboxId, cleanup.token)
      store.clearPendingCleanup()
      Result.success()
    }.getOrElse { error ->
      if (error is RelayClient.RelayException && DeliveryPolicy.isInboxMissing(error.statusCode, error.message)) {
        store.clearPendingCleanup()
        Result.success()
      } else if (
        error is RelayClient.RelayException &&
        error.statusCode == 404 &&
        DeliveryPolicy.retryMissingRoute(runAttemptCount)
      ) {
        Result.retry()
      } else if (error is RelayClient.RelayException && !DeliveryPolicy.shouldRetry(error.statusCode)) {
        store.clearPendingCleanup()
        Result.failure()
      } else {
        Result.retry()
      }
    }
  }

  companion object {
    private const val UNIQUE_WORK_NAME = "notifier-inbox-cleanup"

    fun enqueue(context: Context) {
      val request = OneTimeWorkRequestBuilder<CleanupWorker>()
        .setConstraints(
          Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build(),
        )
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        UNIQUE_WORK_NAME,
        ExistingWorkPolicy.REPLACE,
        request,
      )
    }
  }
}
