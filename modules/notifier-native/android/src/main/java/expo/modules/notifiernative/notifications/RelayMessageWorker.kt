package expo.modules.notifiernative.notifications

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.network.RelayClient
import java.util.concurrent.TimeUnit

internal class RelayMessageWorker(
  context: Context,
  workerParameters: WorkerParameters,
) : Worker(context, workerParameters) {
  override fun doWork(): Result {
    val messageId = inputData.getString(KEY_MESSAGE_ID) ?: return Result.failure()
    val expectedInboxId = inputData.getString(KEY_INBOX_ID) ?: return Result.failure()
    val nonce = inputData.getString(KEY_NONCE) ?: return Result.failure()
    val ciphertext = inputData.getString(KEY_CIPHERTEXT) ?: return Result.failure()
    val expiresAt = inputData.getLong(KEY_EXPIRES_AT, 0)
    if (expiresAt <= 0 || DeliveryPolicy.isExpired(System.currentTimeMillis(), expiresAt)) {
      return Result.success()
    }

    val store = NotifierStore(applicationContext)
    val pairing = store.pairingState ?: return Result.success()
    if (pairing.role != DeviceRole.TRANSMITTER || pairing.inboxId != expectedInboxId) {
      return Result.success()
    }
    val senderToken = pairing.senderToken ?: return Result.success()
    val relayUrl = store.relayUrl ?: return Result.failure()

    return runCatching {
      RelayClient(relayUrl).send(
        pairing.inboxId,
        senderToken,
        messageId,
        nonce,
        ciphertext,
      )
      Result.success()
    }.getOrElse { error ->
      if (
        error is RelayClient.RelayException &&
        !DeliveryPolicy.shouldRetry(error.statusCode)
      ) {
        Result.failure()
      } else {
        Result.retry()
      }
    }
  }

  companion object {
    private const val KEY_MESSAGE_ID = "message_id"
    private const val KEY_INBOX_ID = "inbox_id"
    private const val KEY_NONCE = "nonce"
    private const val KEY_CIPHERTEXT = "ciphertext"
    private const val KEY_EXPIRES_AT = "expires_at"
    private const val UNIQUE_WORK_PREFIX = "notifier-message-"
    private const val MINIMUM_BACKOFF_MINUTES = 1L

    fun enqueue(
      context: Context,
      messageId: String,
      inboxId: String,
      nonce: String,
      ciphertext: String,
      expiresAt: Long,
    ) {
      val input = Data.Builder()
        .putString(KEY_MESSAGE_ID, messageId)
        .putString(KEY_INBOX_ID, inboxId)
        .putString(KEY_NONCE, nonce)
        .putString(KEY_CIPHERTEXT, ciphertext)
        .putLong(KEY_EXPIRES_AT, expiresAt)
        .build()
      val request = OneTimeWorkRequestBuilder<RelayMessageWorker>()
        .setInputData(input)
        .setConstraints(
          Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build(),
        )
        .setBackoffCriteria(
          BackoffPolicy.EXPONENTIAL,
          MINIMUM_BACKOFF_MINUTES,
          TimeUnit.MINUTES,
        )
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        "$UNIQUE_WORK_PREFIX$messageId",
        ExistingWorkPolicy.KEEP,
        request,
      )
    }
  }
}
