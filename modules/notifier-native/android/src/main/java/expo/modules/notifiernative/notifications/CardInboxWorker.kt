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
import expo.modules.notifiernative.BuildConfig
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.security.UrlBase64
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal class CardInboxRejected(val status: Int) : IOException("Sheets rejected the row")

internal object CardInboxConfig {
  fun configured(): Boolean =
    BuildConfig.CARD_INBOX_SPREADSHEET_ID.isNotBlank() &&
      BuildConfig.CARD_INBOX_CREDENTIALS_B64.isNotBlank()

  fun secrets(): CardInboxSecrets? = runCatching {
    val spreadsheetId = BuildConfig.CARD_INBOX_SPREADSHEET_ID.trim()
    val encoded = BuildConfig.CARD_INBOX_CREDENTIALS_B64.trim()
    if (spreadsheetId.isEmpty() || encoded.isEmpty()) return null
    val json = String(UrlBase64.decode(pad(encoded)), Charsets.UTF_8)
    val parsed = JSONObject(json)
    if (parsed.optString("client_email").isBlank() || parsed.optString("private_key").isBlank()) {
      return null
    }
    CardInboxSecrets(spreadsheetId, json)
  }.getOrNull()

  private fun pad(value: String): String {
    val remainder = value.length % 4
    if (remainder == 0) return value
    return value + "=".repeat(4 - remainder)
  }
}

internal data class CardInboxSecrets(
  val spreadsheetId: String,
  val credentialsJson: String,
)

internal class CardInboxClient(private val secrets: CardInboxSecrets) {
  fun append(row: CardInboxRow) {
    val token = accessToken(parseServiceAccount(secrets.credentialsJson))
    post(
      url = CardInboxRequest.url(secrets.spreadsheetId),
      bearer = token,
      contentType = "application/json; charset=UTF-8",
      body = CardInboxRequest.body(row),
    )
  }

  private fun accessToken(account: ServiceAccountKey): String {
    val now = System.currentTimeMillis() / 1000
    val cached = cachedToken
    if (cached != null && cached.expiresAt - 60 > now) return cached.value
    val assertion = URLEncoder.encode(serviceAccountJwt(account, now), "UTF-8")
    val grant = URLEncoder.encode("urn:ietf:params:oauth:grant-type:jwt-bearer", "UTF-8")
    val response = post(
      url = TOKEN_URL,
      bearer = null,
      contentType = "application/x-www-form-urlencoded",
      body = "grant_type=$grant&assertion=$assertion",
    )
    val token = JSONObject(response).optString("access_token")
    if (token.isBlank()) throw IOException("Sheets token missing")
    cachedToken = CachedToken(token, now + 3_600)
    return token
  }

  private fun post(url: String, bearer: String?, contentType: String, body: String): String {
    require(URI(url).scheme == "https") { "Card inbox requires HTTPS." }
    val connection = URI(url).toURL().openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = TIMEOUT_MS
      connection.readTimeout = TIMEOUT_MS
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", contentType)
      if (bearer != null) connection.setRequestProperty("Authorization", "Bearer $bearer")
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      when (status) {
        in 200..299 -> payload
        401 -> throw CardInboxRejected(status)
        else -> throw IOException("Sheets status $status")
      }
    } finally {
      connection.disconnect()
    }
  }

  private data class CachedToken(val value: String, val expiresAt: Long)

  companion object {
    private const val TOKEN_URL = "https://oauth2.googleapis.com/token"
    private const val TIMEOUT_MS = 15_000
    private var cachedToken: CachedToken? = null
  }
}

internal class CardInboxWorker(
  context: Context,
  workerParameters: WorkerParameters,
) : Worker(context, workerParameters) {
  override fun doWork(): Result {
    val pairing = NotifierStore(applicationContext).pairingState
    if (pairing?.role != DeviceRole.TRANSMITTER) return Result.success()
    if (!CardInboxConfig.configured()) return Result.success()
    val secrets = CardInboxConfig.secrets()
    if (secrets == null) {
      if (reportedBadCredentials.compareAndSet(false, true)) {
        DeviceJournal(applicationContext).quietly { addDiagnostic("Could not read card credentials") }
      }
      return Result.failure()
    }
    val row = CardInboxRow(
      id = inputData.getString(KEY_ID) ?: return Result.failure(),
      sourceId = inputData.getString(KEY_SOURCE).orEmpty(),
      card = inputData.getString(KEY_CARD).orEmpty(),
      last4 = inputData.getString(KEY_LAST4).orEmpty(),
      date = inputData.getString(KEY_DATE).orEmpty(),
      merchant = inputData.getString(KEY_MERCHANT).orEmpty(),
      amountCents = inputData.getInt(KEY_AMOUNT, 0),
      installments = inputData.getInt(KEY_INSTALLMENTS, 1),
    )
    if (row.id.isBlank() || row.sourceId.isBlank() || row.card.isBlank() || row.amountCents == 0) {
      return Result.failure()
    }
    return runCatching { CardInboxClient(secrets).append(row) }.fold(
      onSuccess = {
        DeviceJournal(applicationContext).quietly { rememberCardSent(listOf(row.sourceId)) }
        Result.success()
      },
      onFailure = { error ->
        if (error is CardInboxRejected || runAttemptCount >= MAX_ATTEMPTS) {
          DeviceJournal(applicationContext).quietly { addDiagnostic("Could not record a card alert") }
          Result.failure()
        } else {
          Result.retry()
        }
      },
    )
  }

  companion object {
    private const val KEY_ID = "id"
    private const val KEY_SOURCE = "source"
    private const val KEY_CARD = "card"
    private const val KEY_LAST4 = "last4"
    private const val KEY_DATE = "date"
    private const val KEY_MERCHANT = "merchant"
    private const val KEY_AMOUNT = "amount"
    private const val KEY_INSTALLMENTS = "installments"
    private const val MAX_ATTEMPTS = 4
    private const val UNIQUE_PREFIX = "card-inbox-"

    fun enqueue(context: Context, sourceId: String, row: CardInboxRow) {
      val input = Data.Builder()
        .putString(KEY_ID, row.id)
        .putString(KEY_SOURCE, sourceId)
        .putString(KEY_CARD, row.card)
        .putString(KEY_LAST4, row.last4)
        .putString(KEY_DATE, row.date)
        .putString(KEY_MERCHANT, row.merchant.take(MAX_MERCHANT))
        .putInt(KEY_AMOUNT, row.amountCents)
        .putInt(KEY_INSTALLMENTS, row.installments)
        .build()
      val request = OneTimeWorkRequestBuilder<CardInboxWorker>()
        .setInputData(input)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
        .build()
      val workName = UNIQUE_PREFIX + workToken(sourceId)
      WorkManager.getInstance(context).enqueueUniqueWork(
        workName,
        ExistingWorkPolicy.KEEP,
        request,
      )
    }

    private const val MAX_MERCHANT = 256
    private val reportedBadCredentials = AtomicBoolean(false)

    private fun workToken(id: String): String {
      val digest = MessageDigest.getInstance("SHA-256").digest(id.toByteArray(Charsets.UTF_8))
      return digest.take(8).joinToString("") { "%02x".format(it) }
    }
  }
}
