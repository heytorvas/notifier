package expo.modules.notifiernative.notifications

import org.json.JSONArray

internal data class MirrorCandidate(
  val key: String,
  val packageName: String,
  val postTime: Long,
  val title: String,
  val text: String,
  val ongoing: Boolean,
  val groupSummary: Boolean,
  val appName: String = "",
  val summary: String = "",
)

internal object MirrorPolicy {
  const val LIMIT = 300

  fun identity(candidate: MirrorCandidate): String {
    val content = "${candidate.title}\u0000${candidate.text}".hashCode().toUInt().toString(16)
    return "${candidate.postTime}:$content:${candidate.key}"
  }

  fun contentKey(candidate: MirrorCandidate): String =
    contentKey(candidate.packageName, candidate.postTime, candidate.title, candidate.text)

  fun contentKey(packageName: String, postTime: Long, title: String, text: String): String =
    listOf(packageName, postTime.toString(), title, text).joinToString("\u0001")

  fun pending(
    candidates: List<MirrorCandidate>,
    ownPackage: String,
    selectedPackages: Set<String>,
    delivered: List<String>,
    journaled: Set<String>,
  ): List<MirrorCandidate> {
    val seen = delivered.toMutableSet()
    return candidates.mapNotNull { candidate ->
      if (!eligible(candidate, ownPackage, selectedPackages)) return@mapNotNull null
      val id = identity(candidate)
      if (id in seen || contentKey(candidate) in journaled) return@mapNotNull null
      seen += id
      candidate
    }
  }

  fun remember(known: List<String>, identities: List<String>): List<String> {
    if (identities.isEmpty()) return known
    val accepted = identities.toSet()
    return (identities.asReversed() + known.filterNot { it in accepted }).distinct().take(LIMIT)
  }

  fun encode(identities: List<String>): String {
    val array = JSONArray()
    identities.forEach(array::put)
    return array.toString()
  }

  fun decode(encoded: String?): List<String> {
    if (encoded.isNullOrBlank()) return emptyList()
    return runCatching {
      val array = JSONArray(encoded)
      buildList {
        for (index in 0 until array.length()) {
          val value = array.optString(index).trim()
          if (value.isNotEmpty()) add(value)
        }
      }
    }.getOrDefault(emptyList()).distinct().take(LIMIT)
  }

  private fun eligible(
    candidate: MirrorCandidate,
    ownPackage: String,
    selectedPackages: Set<String>,
  ): Boolean {
    val readable = candidate.title.isNotBlank() || candidate.text.isNotBlank()
    return candidate.key.isNotBlank() &&
      readable &&
      candidate.packageName != ownPackage &&
      candidate.packageName in selectedPackages &&
      !candidate.ongoing &&
      !candidate.groupSummary
  }
}
