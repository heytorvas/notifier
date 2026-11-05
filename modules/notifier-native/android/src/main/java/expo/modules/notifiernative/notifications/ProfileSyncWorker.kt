package expo.modules.notifiernative.notifications

import android.content.Context
import android.os.Build
import android.util.Base64
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.data.PairingState
import expo.modules.notifiernative.network.RelayClient
import expo.modules.notifiernative.security.CryptoStore
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

internal class ProfileSyncWorker(
  context: Context,
  workerParameters: WorkerParameters,
) : Worker(context, workerParameters) {
  override fun doWork(): Result {
    val store = NotifierStore(applicationContext)
    val pairing = store.pairingState ?: return Result.success()
    val relayUrl = store.relayUrl ?: return Result.failure()
    val client = RelayClient(relayUrl)
    return runCatching {
      when (pairing.role) {
        DeviceRole.RECEIVER -> syncReceiver(store, client, pairing.inboxId, pairing.ownerToken)
        DeviceRole.TRANSMITTER -> syncTransmitter(store, client, pairing)
      }
    }.getOrElse { error ->
      if (error is RelayClient.RelayException && DeliveryPolicy.isInboxMissing(error.statusCode, error.message)) {
        PairingSync.forgetPeer(applicationContext)
        Result.success()
      } else if (error is RelayClient.RelayException && !DeliveryPolicy.shouldRetry(error.statusCode)) {
        Result.failure()
      } else {
        Result.retry()
      }
    }
  }

  private fun syncReceiver(
    store: NotifierStore,
    client: RelayClient,
    inboxId: String,
    ownerToken: String?,
  ): Result {
    if (ownerToken == null) return Result.success()
    client.publishDevice(inboxId, ownerToken, deviceBrand(), deviceModel())
    val status = client.pairingStatus(inboxId, ownerToken)
    if (status.claimedAt != null) store.pairedAt = status.claimedAt
    return Result.success()
  }

  private fun syncTransmitter(
    store: NotifierStore,
    client: RelayClient,
    pairing: PairingState,
  ): Result {
    val senderToken = pairing.senderToken ?: return Result.success()
    val key = CryptoStore.decode(pairing.pairingKey)
    send(
      client = client,
      inboxId = pairing.inboxId,
      senderToken = senderToken,
      key = key,
      payload = profilePayload(store),
    )
    sendIcons(store, client, pairing.inboxId, senderToken, key)

    val device = runCatching { client.fetchDevice(pairing.inboxId, senderToken) }.getOrElse { error ->
      if (error is RelayClient.RelayException && DeliveryPolicy.isInboxMissing(error.statusCode, error.message)) {
        PairingSync.forgetPeer(applicationContext)
        return Result.success()
      }
      if (error is RelayClient.RelayException && !DeliveryPolicy.shouldRetry(error.statusCode)) {
        return Result.success()
      }
      throw error
    }
    if (device.brand.isNotBlank()) store.peerBrand = device.brand
    if (device.model.isNotBlank()) store.peerModel = device.model
    if (device.pairedAt != null) store.pairedAt = device.pairedAt
    val waitingForPeer = device.brand.isBlank() && device.model.isBlank()
    return if (waitingForPeer && runAttemptCount < MAX_PEER_ATTEMPTS) Result.retry() else Result.success()
  }

  private fun sendIcons(
    store: NotifierStore,
    client: RelayClient,
    inboxId: String,
    senderToken: String,
    key: ByteArray,
  ) {
    val packageManager = applicationContext.packageManager
    store.selectedPackages.forEach { packageName ->
      @Suppress("DEPRECATION")
      val updatedAt = runCatching { packageManager.getPackageInfo(packageName, 0).lastUpdateTime }.getOrDefault(0L)
      val token = "$packageName:$updatedAt"
      if (token in store.syncedIcons) return@forEach
      val drawable = runCatching { packageManager.getApplicationIcon(packageName) }.getOrNull() ?: return@forEach
      val jpeg = RelayIconEncoder.jpeg(drawable) ?: return@forEach
      val payload = JSONObject()
        .put("version", 2)
        .put("kind", "icon")
        .put("packageName", packageName)
        .put("image", Base64.encodeToString(jpeg, Base64.NO_WRAP))
        .toString()
      if (!send(client, inboxId, senderToken, key, payload)) return@forEach
      store.markIconSynced(token)
    }
  }

  private fun profilePayload(store: NotifierStore): String {
    val packageManager = applicationContext.packageManager
    val apps = JSONArray()
    store.selectedPackages.forEach { packageName ->
      val name = runCatching {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
      }.getOrDefault(packageName)
      apps.put(JSONObject().put("packageName", packageName).put("name", name.take(100)))
    }
    return JSONObject()
      .put("version", 2)
      .put("kind", "profile")
      .put("brand", deviceBrand())
      .put("model", deviceModel())
      .put("pairedAt", store.pairedAt ?: 0L)
      .put("apps", apps)
      .toString()
  }

  private fun send(
    client: RelayClient,
    inboxId: String,
    senderToken: String,
    key: ByteArray,
    payload: String,
  ): Boolean {
    val (nonce, ciphertext) = CryptoStore.encryptPayload(key, payload)
    if (ciphertext.length > MAX_CIPHERTEXT) return false
    client.send(inboxId, senderToken, UUID.randomUUID().toString(), nonce, ciphertext)
    return true
  }

  companion object {
    private const val UNIQUE_WORK_NAME = "notifier-profile-sync"
    private const val MAX_CIPHERTEXT = 3_400
    private const val MAX_PEER_ATTEMPTS = 4

    fun enqueue(context: Context) {
      val request = OneTimeWorkRequestBuilder<ProfileSyncWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        UNIQUE_WORK_NAME,
        ExistingWorkPolicy.REPLACE,
        request,
      )
    }

    private fun deviceBrand(): String = sanitizeLabel(Build.MANUFACTURER)
    private fun deviceModel(): String = sanitizeLabel(Build.MODEL)

    private fun sanitizeLabel(value: String): String =
      value.trim().replace(Regex("[\\u0000-\\u001F\\u007F]"), "").take(40)
  }
}
