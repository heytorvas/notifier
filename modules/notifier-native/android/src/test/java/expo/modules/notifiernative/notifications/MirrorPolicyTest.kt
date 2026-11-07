package expo.modules.notifiernative.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MirrorPolicyTest {
  private val purchase = candidate(key = "c6:1495", title = "Compra no crédito aprovada", text = "R$ 17,98")

  @Test
  fun activeShadeAlertIsMirroredWhenItsAppIsSelected() {
    val pending = MirrorPolicy.pending(
      candidates = listOf(purchase),
      ownPackage = "dev.heytor.notifier",
      selectedPackages = setOf("com.c6bank.app"),
      delivered = emptyList(),
      journaled = emptySet(),
    )

    assertEquals(listOf(purchase), pending)
    assertEquals(
      listOf(purchase),
      MirrorPolicy.pending(
        candidates = listOf(purchase, purchase.copy()),
        ownPackage = "dev.heytor.notifier",
        selectedPackages = setOf("com.c6bank.app"),
        delivered = emptyList(),
        journaled = emptySet(),
      ),
    )
  }

  @Test
  fun anAlertAlreadySentOrRecordedIsNotSentAgain() {
    val remembered = MirrorPolicy.remember(emptyList(), listOf(MirrorPolicy.identity(purchase)))
    assertEquals(
      emptyList<MirrorCandidate>(),
      MirrorPolicy.pending(
        candidates = listOf(purchase),
        ownPackage = "dev.heytor.notifier",
        selectedPackages = setOf("com.c6bank.app"),
        delivered = remembered,
        journaled = emptySet(),
      ),
    )
    assertEquals(
      emptyList<MirrorCandidate>(),
      MirrorPolicy.pending(
        candidates = listOf(purchase),
        ownPackage = "dev.heytor.notifier",
        selectedPackages = setOf("com.c6bank.app"),
        delivered = emptyList(),
        journaled = setOf(MirrorPolicy.contentKey(purchase)),
      ),
    )
  }

  @Test
  fun editedAlertTextIsMirroredAgain() {
    val edited = purchase.copy(text = "R$ 17,98 em SUPER-MERCADO")
    val pending = MirrorPolicy.pending(
      candidates = listOf(edited),
      ownPackage = "dev.heytor.notifier",
      selectedPackages = setOf("com.c6bank.app"),
      delivered = MirrorPolicy.remember(emptyList(), listOf(MirrorPolicy.identity(purchase))),
      journaled = setOf(MirrorPolicy.contentKey(purchase)),
    )

    assertEquals(listOf(edited), pending)
  }

  @Test
  fun filtersOwnPackageUnselectedOngoingSummariesAndBlankText() {
    val pending = MirrorPolicy.pending(
      candidates = listOf(
        purchase.copy(packageName = "dev.heytor.notifier"),
        purchase.copy(key = "other", packageName = "com.other.app"),
        purchase.copy(key = "ongoing", ongoing = true),
        purchase.copy(key = "summary", groupSummary = true),
        purchase.copy(key = "blank", title = " ", text = ""),
        purchase.copy(key = "ready"),
      ),
      ownPackage = "dev.heytor.notifier",
      selectedPackages = setOf("com.c6bank.app"),
      delivered = emptyList(),
      journaled = emptySet(),
    )

    assertEquals(listOf("ready"), pending.map(MirrorCandidate::key))
  }

  @Test
  fun ledgerKeepsTheNewestIdentitiesAndRoundTrips() {
    val identities = (1..MirrorPolicy.LIMIT + 5).map { "id-$it" }
    val kept = MirrorPolicy.remember(emptyList(), identities)
    assertEquals(MirrorPolicy.LIMIT, kept.size)
    assertEquals("id-${identities.size}", kept.first())
    assertTrue(kept.none { it == "id-1" })
    assertEquals(kept, MirrorPolicy.decode(MirrorPolicy.encode(kept)))
    assertEquals(emptyList<String>(), MirrorPolicy.decode("not-json"))
  }

  private fun candidate(key: String, title: String, text: String) = MirrorCandidate(
    key = key,
    packageName = "com.c6bank.app",
    postTime = 1_763_000_000_000,
    title = title,
    text = text,
    ongoing = false,
    groupSummary = false,
  )
}
