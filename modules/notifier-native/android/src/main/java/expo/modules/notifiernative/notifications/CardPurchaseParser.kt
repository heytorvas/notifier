package expo.modules.notifiernative.notifications

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

internal data class CardPurchase(
  val card: String,
  val last4: String,
  val date: String,
  val merchant: String,
  val amountCents: Int,
)

internal object CardPurchaseParser {
  private val apps = mapOf(
    "c6 bank" to "C6",
    "btg banking" to "BTG",
    "nomad" to "NOMAD",
    "nu" to "NU",
  )
  private val money = Regex("""R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)""")
  private val compraWord = Regex("""(?i)(?<!\p{L})compra(?!\p{L})""")
  private val reversal = Regex("""(?i)estorn|cancelad[oa]|iof de volta""")
  private val reversalBlock = Regex("""(?i)pagamento|fatura|(?<!\p{L})pix(?!\p{L})|d[eé]bito""")
  private val c6Title = Regex("""(?i)compra no cr[eé]dito aprovada""")
  private val notApproved = Regex("""(?i)n[aã]o foi aprovada""")
  private val c6Body = Regex(
    """cart[aã]o final (\d{4}) no valor de R\$\s*""" +
      """(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+), dia """ +
      """(\d{2}/\d{2}/\d{4}).*? em (.+?), foi aprovada""",
    setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
  )
  private val btgTitle = Regex("""(?i)compra autorizada""")
  private val btgBody = Regex(
    """sua compra de R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+) em (.+?) foi autorizada""",
    setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
  )
  private val nomadCredit = Regex("""(?i)no cr[eé]dito""")
  private val nomadOk = Regex("""(?i)realizada com sucesso""")
  private val last4 = Regex("""(?i)cart[aã]o final (\d{4})""")
  private val excludedPurchase = Regex("""(?i)(?<!\p{L})pix(?!\p{L})|d[eé]bito""")
  private val zone = TimeZone.getTimeZone("America/Sao_Paulo")

  fun parse(appName: String, title: String, text: String, postedAtMillis: Long): CardPurchase? {
    val card = apps[appName.trim().lowercase()] ?: return null
    val postedOn = formatDate(postedAtMillis)
    if (reversal.containsMatchIn(text) || reversal.containsMatchIn(title)) {
      if (reversalBlock.containsMatchIn(text) || reversalBlock.containsMatchIn(title)) return null
      val amount = firstAmount(text) ?: firstAmount(title) ?: return null
      val digits = if (card == "C6") last4.find(text)?.groupValues?.get(1).orEmpty() else ""
      return CardPurchase(
        card = card,
        last4 = digits,
        date = postedOn,
        merchant = title.trim().ifBlank { "Estorno" },
        amountCents = -amount,
      )
    }
    return purchase(card, title, text, postedOn)
  }

  private fun purchase(card: String, title: String, text: String, postedOn: String): CardPurchase? {
    if (card == "C6") {
      if (!c6Title.containsMatchIn(title) || notApproved.containsMatchIn(text)) return null
      val found = c6Body.find(text) ?: return null
      val day = found.groupValues[3]
      if (!isDate(day)) return null
      val amount = cents(found.groupValues[2]) ?: return null
      return CardPurchase(card, found.groupValues[1], day, found.groupValues[4].trim(), amount)
    }
    if (card == "BTG") {
      if (!btgTitle.containsMatchIn(title)) return null
      val found = btgBody.find(text) ?: return null
      val amount = cents(found.groupValues[1]) ?: return null
      return CardPurchase(card, "", postedOn, found.groupValues[2].trim(), amount)
    }
    if (card == "NOMAD") {
      if (!nomadCredit.containsMatchIn(text) || !nomadOk.containsMatchIn(text)) return null
      val amount = firstAmount(text) ?: return null
      val merchant = title.trim()
      if (merchant.isEmpty()) return null
      return CardPurchase(card, "", postedOn, merchant, amount)
    }
    if (!compraWord.containsMatchIn(title) && !compraWord.containsMatchIn(text)) return null
    if (excludedPurchase.containsMatchIn(title) || excludedPurchase.containsMatchIn(text)) return null
    val amount = firstAmount(text) ?: firstAmount(title) ?: return null
    val merchant = title.trim()
    if (merchant.isEmpty()) return null
    return CardPurchase(card, "", postedOn, merchant, amount)
  }

  private fun firstAmount(value: String): Int? {
    val found = money.find(value) ?: return null
    return cents(found.groupValues[1])
  }

  private fun cents(raw: String): Int? {
    val parsed = runCatching { brlToCents(raw) }.getOrNull() ?: return null
    if (parsed <= 0) return null
    return parsed
  }

  private fun formatDate(epochMillis: Long): String {
    val calendar = Calendar.getInstance(zone)
    calendar.timeInMillis = epochMillis
    return String.format(
      Locale.US,
      "%02d/%02d/%04d",
      calendar.get(Calendar.DAY_OF_MONTH),
      calendar.get(Calendar.MONTH) + 1,
      calendar.get(Calendar.YEAR),
    )
  }

  private fun isDate(value: String): Boolean {
    val format = SimpleDateFormat("dd/MM/yyyy", Locale.US)
    format.isLenient = false
    return try {
      format.parse(value)
      true
    } catch (_: ParseException) {
      false
    }
  }
}

internal fun brlToCents(raw: String): Int {
  var clean = raw.trim().replace("R$", "").replace(" ", "")
  val lastComma = clean.lastIndexOf(',')
  val lastDot = clean.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    clean = if (lastComma > lastDot) {
      clean.replace(".", "").replace(',', '.')
    } else {
      clean.replace(",", "")
    }
  } else if (lastComma >= 0) {
    clean = clean.replace(',', '.')
  } else if (lastDot >= 0 && clean.substring(lastDot + 1).length == 3) {
    clean = clean.replace(".", "")
  }
  return BigDecimal(clean).multiply(BigDecimal(100)).setScale(0, RoundingMode.HALF_UP).intValueExact()
}
