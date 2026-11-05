package expo.modules.notifiernative.notifications

import org.json.JSONArray
import org.json.JSONObject

internal data class AlertRecord(
  val id: String,
  val at: Long,
  val direction: String,
  val appName: String,
  val packageName: String,
  val title: String,
  val text: String,
  val status: String,
  val detail: String,
)

internal data class DiagnosticRecord(
  val id: String,
  val at: Long,
  val message: String,
)

internal object AlertJournal {
  const val LIMIT = 400

  fun upsert(records: List<AlertRecord>, record: AlertRecord): List<AlertRecord> =
    byRecent(records.filterNot { it.id == record.id } + record).take(LIMIT)

  fun encode(records: List<AlertRecord>): String {
    val array = JSONArray()
    records.forEach { record ->
      array.put(
        JSONObject()
          .put("id", record.id)
          .put("at", record.at)
          .put("direction", record.direction)
          .put("appName", record.appName)
          .put("packageName", record.packageName)
          .put("title", record.title)
          .put("text", record.text)
          .put("status", record.status)
          .put("detail", record.detail),
      )
    }
    return array.toString()
  }

  fun decode(encoded: String?): List<AlertRecord> {
    if (encoded.isNullOrBlank()) return emptyList()
    return runCatching {
      val array = JSONArray(encoded)
      buildList {
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          val id = item.optString("id")
          val direction = item.optString("direction")
          val status = item.optString("status")
          if (id.isBlank() || direction !in DIRECTIONS || status !in STATUSES) continue
          add(
            AlertRecord(
              id = id,
              at = item.optLong("at"),
              direction = direction,
              appName = item.optString("appName").take(MAX_APP_NAME),
              packageName = item.optString("packageName").take(MAX_PACKAGE),
              title = item.optString("title").take(MAX_TITLE),
              text = item.optString("text").take(MAX_TEXT),
              status = status,
              detail = item.optString("detail").take(MAX_DETAIL),
            ),
          )
        }
      }
    }.getOrDefault(emptyList()).let(::byRecent)
  }

  private fun byRecent(records: List<AlertRecord>): List<AlertRecord> =
    records.sortedWith(compareByDescending<AlertRecord> { it.at }.thenByDescending { it.id })

  private val DIRECTIONS = setOf("in", "out")
  private val STATUSES = setOf("pending", "delivered", "failed")
  private const val MAX_APP_NAME = 100
  private const val MAX_PACKAGE = 200
  private const val MAX_TITLE = 256
  private const val MAX_TEXT = 1_500
  private const val MAX_DETAIL = 160
}

internal object DiagnosticJournal {
  const val LIMIT = 80

  fun append(records: List<DiagnosticRecord>, record: DiagnosticRecord): List<DiagnosticRecord> =
    byRecent(records + record).take(LIMIT)

  fun encode(records: List<DiagnosticRecord>): String {
    val array = JSONArray()
    records.forEach { record ->
      array.put(
        JSONObject()
          .put("id", record.id)
          .put("at", record.at)
          .put("message", record.message),
      )
    }
    return array.toString()
  }

  fun decode(encoded: String?): List<DiagnosticRecord> {
    if (encoded.isNullOrBlank()) return emptyList()
    return runCatching {
      val array = JSONArray(encoded)
      buildList {
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          val id = item.optString("id")
          val message = item.optString("message").trim()
          if (id.isBlank() || message.isEmpty()) continue
          add(DiagnosticRecord(id, item.optLong("at"), message.take(MAX_MESSAGE)))
        }
      }
    }.getOrDefault(emptyList()).let { byRecent(it).take(LIMIT) }
  }

  private fun byRecent(records: List<DiagnosticRecord>): List<DiagnosticRecord> =
    records.sortedWith(compareByDescending<DiagnosticRecord> { it.at }.thenByDescending { it.id })

  private const val MAX_MESSAGE = 180
}

internal object ListenerBinding {
  const val REBIND_INTERVAL_MS = 30_000L

  @Volatile
  var lastAttemptElapsedMs: Long = 0L

  fun shouldRebind(
    permissionGranted: Boolean,
    listenerConnected: Boolean,
    nowMs: Long,
    lastAttemptMs: Long,
  ): Boolean =
    permissionGranted && !listenerConnected && nowMs - lastAttemptMs >= REBIND_INTERVAL_MS

  fun listenerConnected(
    isTransmitter: Boolean,
    permissionGranted: Boolean,
    serviceConnected: Boolean,
  ): Boolean = permissionGranted && (!isTransmitter || serviceConnected)
}
