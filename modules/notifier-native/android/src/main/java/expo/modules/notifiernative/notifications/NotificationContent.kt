package expo.modules.notifiernative.notifications

internal data class NotificationTextSources(
  val title: String? = null,
  val titleBig: String? = null,
  val text: String? = null,
  val bigText: String? = null,
  val subText: String? = null,
  val summaryText: String? = null,
  val infoText: String? = null,
  val ticker: String? = null,
  val textLines: List<String> = emptyList(),
  val messages: List<String> = emptyList(),
)

internal data class NotificationText(
  val title: String,
  val summary: String,
  val detail: String,
)

internal fun extractNotificationText(sources: NotificationTextSources): NotificationText? {
  val title = sequenceOf(sources.title, sources.titleBig)
    .firstNonBlank()
    ?.take(MAX_TITLE)
    .orEmpty()
  val ordered = sequence {
    yield(sources.text)
    yield(sources.subText)
    yield(sources.infoText)
    yield(sources.ticker)
    yield(sources.bigText)
    yieldAll(sources.textLines)
    yieldAll(sources.messages)
    yield(sources.summaryText)
  }.mapNotNull { it?.trim()?.takeIf(String::isNotEmpty) }
    .filter { it != title }
    .distinct()
    .toList()

  if (title.isEmpty() && ordered.isEmpty()) return null

  val summary = ordered.firstOrNull().orEmpty().take(MAX_SUMMARY)
  val detail = ordered
    .filter { line -> ordered.none { other -> other.length > line.length && other.contains(line) } }
    .joinToString("\n")
    .ifBlank { summary }
    .take(MAX_DETAIL)

  return NotificationText(title = title, summary = summary, detail = detail)
}

internal fun alertPayload(
  packageName: String,
  appName: String,
  content: NotificationText,
  postedAt: Long,
  sourceKey: String,
): String {
  val payload = org.json.JSONObject()
    .put("version", 1)
    .put("sourcePackage", packageName)
    .put("sourceApp", appName.take(MAX_APP_NAME))
    .put("title", content.title)
    .put("text", content.detail)
    .put("postedAt", postedAt)
    .put("sourceKey", sourceKey)
  if (content.summary.isNotBlank() && content.summary != content.detail) {
    payload.put("summary", content.summary)
  }
  return payload.toString()
}

private fun Sequence<String?>.firstNonBlank(): String? =
  firstNotNullOfOrNull { it?.trim()?.takeIf(String::isNotEmpty) }

private const val MAX_TITLE = 256
private const val MAX_SUMMARY = 180
private const val MAX_DETAIL = 1_500
private const val MAX_APP_NAME = 100
