package expo.modules.notifiernative.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalRecordsTest {
  private val older = alert(id = "a", at = 10, status = "delivered")
  private val newer = alert(id = "b", at = 20, status = "failed", title = "Declined")

  @Test
  fun alertUpsertKeepsOneRowPerIdAndOrdersNewestFirst() {
    val updated = AlertJournal.upsert(
      AlertJournal.upsert(listOf(older), newer),
      older.copy(status = "failed", detail = "Expired before delivery"),
    )

    assertEquals(listOf("b", "a"), updated.map(AlertRecord::id))
    assertEquals("failed", updated.first { it.id == "a" }.status)
    assertEquals(updated, AlertJournal.decode(AlertJournal.encode(updated)))
  }

  @Test
  fun alertDecodeDropsMalformedRows() {
    val decoded = AlertJournal.decode("""[{"id":"ok","at":1,"direction":"out","status":"pending"},{"id":"","status":"nope"}]""")
    assertEquals(listOf("ok"), decoded.map(AlertRecord::id))
    assertEquals(emptyList<AlertRecord>(), AlertJournal.decode("not-json"))
  }

  @Test
  fun alertsKeepTheNewestFourHundred() {
    val records = (1..AlertJournal.LIMIT + 10).map { alert(id = it.toString(), at = it.toLong(), status = "delivered") }
    val kept = records.fold(emptyList<AlertRecord>(), AlertJournal::upsert)
    assertEquals(AlertJournal.LIMIT, kept.size)
    assertEquals((AlertJournal.LIMIT + 10).toString(), kept.first().id)
    assertFalse(kept.any { it.id == "1" })
  }

  @Test
  fun diagnosticsKeepOneCopyOfTheNewestMessage() {
    val failure = DiagnosticRecord(id = "1", at = 10, message = "Pairing check failed")
    val repeated = DiagnosticJournal.append(
      listOf(failure),
      DiagnosticRecord(id = "2", at = 20, message = "Pairing check failed"),
    )
    assertEquals(listOf("1"), repeated.map(DiagnosticRecord::id))

    val restored = DiagnosticJournal.append(
      repeated,
      DiagnosticRecord(id = "3", at = 30, message = "Pairing check restored"),
    )
    assertEquals(listOf("3", "1"), restored.map(DiagnosticRecord::id))
  }

  @Test
  fun diagnosticsKeepTheNewestEighty() {
    val records = (1..90).map { DiagnosticRecord(id = it.toString(), at = it.toLong(), message = "Event $it") }
    val kept = records.fold(emptyList<DiagnosticRecord>(), DiagnosticJournal::append)
    assertEquals(DiagnosticJournal.LIMIT, kept.size)
    assertEquals("90", kept.first().id)
    assertFalse(kept.any { it.id == "1" })
    assertEquals(kept, DiagnosticJournal.decode(DiagnosticJournal.encode(kept)))
  }

  @Test
  fun rebindIsAnnouncedOnceUntilTheListenerConnects() {
    val announcement = ListenerBinding.REBIND_ANNOUNCEMENT
    assertTrue(ListenerBinding.shouldAnnounceRebind(emptyList()))
    assertFalse(ListenerBinding.shouldAnnounceRebind(listOf("Queued 2 alerts still on screen", announcement)))
    assertTrue(ListenerBinding.shouldAnnounceRebind(listOf("Listener connected", announcement)))
    assertTrue(ListenerBinding.shouldAnnounceRebind(listOf("Listener disconnected", announcement)))
  }

  @Test
  fun listenerHealthIsNotReportedDownDuringTheStartupGrace() {
    assertFalse(ListenerBinding.shouldReportListener(false, downForMs = 0, lastReported = null, millisSinceReport = 0))
    assertTrue(
      ListenerBinding.shouldReportListener(
        connected = false,
        downForMs = ListenerBinding.DOWN_REPORT_GRACE_MS,
        lastReported = null,
        millisSinceReport = 0,
      ),
    )
    assertTrue(ListenerBinding.shouldReportListener(true, downForMs = 0, lastReported = null, millisSinceReport = 0))
    assertFalse(
      ListenerBinding.shouldReportListener(
        connected = true,
        downForMs = 0,
        lastReported = true,
        millisSinceReport = 1_000,
      ),
    )
  }

  @Test
  fun rebindRunsOnlyWhilePermissionIsOnAndTheListenerIsDown() {
    assertTrue(ListenerBinding.shouldRebind(true, false, nowMs = 30_000, lastAttemptMs = 0))
    assertFalse(ListenerBinding.shouldRebind(true, true, nowMs = 30_000, lastAttemptMs = 0))
    assertFalse(ListenerBinding.shouldRebind(false, false, nowMs = 30_000, lastAttemptMs = 0))
    assertFalse(ListenerBinding.shouldRebind(true, false, nowMs = 30_000, lastAttemptMs = 1))
  }

  @Test
  fun grantedPermissionStaysGrantedWhenTheTransmitterListenerIsDown() {
    assertFalse(
      ListenerBinding.listenerConnected(
        isTransmitter = true,
        permissionGranted = true,
        serviceConnected = false,
      ),
    )
    assertTrue(
      ListenerBinding.listenerConnected(
        isTransmitter = false,
        permissionGranted = true,
        serviceConnected = false,
      ),
    )
    assertFalse(
      ListenerBinding.listenerConnected(
        isTransmitter = true,
        permissionGranted = false,
        serviceConnected = true,
      ),
    )
  }

  private fun alert(
    id: String,
    at: Long,
    status: String,
    title: String = "Payment",
  ) = AlertRecord(
    id = id,
    at = at,
    direction = "out",
    appName = "Bank",
    packageName = "com.bank",
    title = title,
    text = "A transfer was posted.",
    status = status,
    detail = "",
  )
}
