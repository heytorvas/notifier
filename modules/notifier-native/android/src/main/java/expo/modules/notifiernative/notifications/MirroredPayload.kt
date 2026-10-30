package expo.modules.notifiernative.notifications

import org.json.JSONArray
import org.json.JSONObject

internal data class RemoteApp(
  val packageName: String,
  val name: String,
)

internal sealed interface MirroredPayload {
  data class Alert(
    val packageName: String,
    val appName: String,
    val title: String,
    val summary: String,
    val detail: String,
    val postedAt: Long,
  ) : MirroredPayload

  data class Icon(
    val packageName: String,
    val imageBase64: String,
  ) : MirroredPayload

  data class Profile(
    val brand: String,
    val model: String,
    val pairedAt: Long?,
    val apps: List<RemoteApp>,
  ) : MirroredPayload

  companion object {
    fun parse(encoded: String): MirroredPayload? = runCatching {
      val json = JSONObject(encoded)
      when (json.optInt("version")) {
        1 -> parseAlert(json)
        2 -> when (json.optString("kind")) {
          "icon" -> parseIcon(json)
          "profile" -> parseProfile(json)
          else -> null
        }
        else -> null
      }
    }.getOrNull()

    private fun parseAlert(json: JSONObject): Alert {
      val detail = json.optString("text").trim()
      val summary = json.optString("summary").trim().ifBlank { detail }
      return Alert(
        packageName = json.optString("sourcePackage").trim(),
        appName = json.optString("sourceApp").trim(),
        title = json.optString("title").trim(),
        summary = summary,
        detail = detail,
        postedAt = json.optLong("postedAt"),
      )
    }

    private fun parseIcon(json: JSONObject): Icon? {
      val packageName = json.optString("packageName")
      val image = json.optString("image")
      if (!PACKAGE_NAME.matches(packageName) || image.length !in 16..6_000) return null
      return Icon(packageName, image)
    }

    private fun parseProfile(json: JSONObject): Profile {
      val appsJson = json.optJSONArray("apps") ?: JSONArray()
      val apps = buildList {
        for (index in 0 until minOf(appsJson.length(), MAX_APPS)) {
          val item = appsJson.optJSONObject(index) ?: continue
          val packageName = item.optString("packageName")
          val name = item.optString("name").trim().replace(CONTROL_CHARS, "").take(MAX_NAME)
          if (PACKAGE_NAME.matches(packageName) && name.isNotEmpty()) add(RemoteApp(packageName, name))
        }
      }
      val pairedAt = json.optLong("pairedAt").takeIf { json.has("pairedAt") && !json.isNull("pairedAt") && it > 0 }
      return Profile(
        brand = json.optString("brand").trim().replace(CONTROL_CHARS, "").take(MAX_LABEL),
        model = json.optString("model").trim().replace(CONTROL_CHARS, "").take(MAX_LABEL),
        pairedAt = pairedAt,
        apps = apps,
      )
    }

    private val PACKAGE_NAME = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$")
    private val CONTROL_CHARS = Regex("[\\u0000-\\u001F\\u007F]")
    private const val MAX_APPS = 40
    private const val MAX_NAME = 100
    private const val MAX_LABEL = 40
  }
}
