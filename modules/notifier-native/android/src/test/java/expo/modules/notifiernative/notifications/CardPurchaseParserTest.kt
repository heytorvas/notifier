package expo.modules.notifiernative.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class CardPurchaseParserTest {
  private val c6 = "Sua compra no cartão final 0567 no valor de R$ 28,98, " +
    "dia 21/11/2026 às 14:58, em MLP*Aiqfome-CHOCOLATES Paraiso do To BRA, foi aprovada."
  private val quartetto = "Sua compra no cartão final 0123 no valor de R$ 86,88, " +
    "dia 21/11/2026 às 10:12, em QUARTETTO SUPERMERCAD PARAISO DO TO BRA, foi aprovada."

  @Test
  fun c6PurchasesKeepTheBankDateDigitsAndCity() {
    val aiqfome = CardPurchaseParser.parse("C6 Bank", "Compra no crédito aprovada", c6, posted(2026, 11, 23))
    val market = CardPurchaseParser.parse("C6 Bank", "Compra no crédito aprovada", quartetto, posted(2026, 11, 23))

    assertEquals(CardPurchase("C6", "0567", "21/11/2026", "MLP*Aiqfome-CHOCOLATES Paraiso do To BRA", 2898), aiqfome)
    assertEquals(CardPurchase("C6", "0123", "21/11/2026", "QUARTETTO SUPERMERCAD PARAISO DO TO BRA", 8688), market)
  }

  @Test
  fun c6ThousandsAreCentsAndARefusalIsDropped() {
    val body = "Sua compra no cartão final 0123 no valor de R$ 1.234,56, " +
      "dia 04/12/2026 às 09:00, em LOJA, foi aprovada."
    val parsed = CardPurchaseParser.parse("C6 Bank", "Compra no crédito aprovada", body, posted(2026, 11, 23))
    assertEquals(123456, parsed?.amountCents)
    assertEquals("04/12/2026", parsed?.date)
    assertNull(CardPurchaseParser.parse("C6 Bank", "Compra no crédito aprovada", c6.replace("foi aprovada", "não foi aprovada"), posted(2026, 11, 23)))
  }

  @Test
  fun btgAndNomadUseTheSaoPauloDate() {
    val posted = posted(2026, 11, 19, 23)
    val btg = CardPurchaseParser.parse("BTG Banking", "Compra autorizada", "Sua compra de R$ 31,90 em Spotify foi autorizada.", posted)
    val nomad = CardPurchaseParser.parse("Nomad", "Claro flex sao paulo", "Compra de R$ 39,99 no crédito realizada com sucesso.", posted)

    assertEquals(CardPurchase("BTG", "", "19/11/2026", "Spotify", 3190), btg)
    assertEquals(CardPurchase("NOMAD", "", "19/11/2026", "Claro flex sao paulo", 3999), nomad)
  }

  @Test
  fun nuMatchesCompraAndRejectsLookalikes() {
    val purchase = CardPurchaseParser.parse("Nu", "Mercado", "Compra de R$ 10,00 aprovada", posted(2026, 11, 23))
    assertEquals(CardPurchase("NU", "", "23/11/2026", "Mercado", 1000), purchase)
    assertNull(CardPurchaseParser.parse("Nu", "Aplicação em CDB concluída", "CDB NUBANK", posted(2026, 11, 23)))
    assertNull(CardPurchaseParser.parse("Nu", "Débito", "Compra de R$ 10,00 no débito", posted(2026, 11, 23)))
    assertNull(CardPurchaseParser.parse("Nu", "Pix", "Compra via Pix de R$ 10,00", posted(2026, 11, 23)))
    assertNull(CardPurchaseParser.parse("Nu", "Oferta", "Aproveite e comprar com R$ 20", posted(2026, 11, 23)))
  }

  @Test
  fun reversalIsNegativeAndAPaymentReversalIsIgnored() {
    val reversal = CardPurchaseParser.parse("Nu", "Estorno", "Estorno de R$ 10,00", posted(2026, 12, 5))
    assertEquals(-1000, reversal?.amountCents)
    assertEquals("05/12/2026", reversal?.date)
    val c6 = CardPurchaseParser.parse("C6 Bank", "Estorno", "Estorno no cartão final 1495 de R$ 17,98", posted(2026, 12, 5))
    assertEquals("1495", c6?.last4)
    assertEquals(-1798, c6?.amountCents)
    assertNull(CardPurchaseParser.parse("Nu", "Fatura", "Estorno do pagamento da fatura no valor de R$ 500,00", posted(2026, 11, 23)))
    assertNull(CardPurchaseParser.parse("BTG Banking", "Pix recebido", "Você recebeu um Pix de R$ 0,01.", posted(2026, 11, 23)))
    assertNull(CardPurchaseParser.parse("Itaú", "Compra autorizada", "Sua compra de R$ 31,90 em Spotify foi autorizada.", posted(2026, 11, 23)))
  }

  private fun posted(year: Int, month: Int, day: Int, hour: Int = 12): Long {
    val calendar = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
    calendar.set(year, month - 1, day, hour, 0, 0)
    calendar.set(Calendar.MILLISECOND, 0)
    return calendar.timeInMillis
  }
}
