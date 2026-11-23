package expo.modules.notifiernative.notifications

import android.content.Context
import expo.modules.notifiernative.security.CryptoStore
import java.io.File
import java.util.UUID

internal class DeviceJournal(context: Context) {
  private val crypto = CryptoStore(context.applicationContext)
  private val directory = context.applicationContext.noBackupFilesDir
  private val alertsFile = File(directory, "notifier-alerts.bin")
  private val diagnosticsFile = File(directory, "notifier-diagnostics.bin")
  private val ledgerFile = File(directory, "notifier-mirror-ledger.bin")
  private val cardLedgerFile = File(directory, "notifier-card-ledger.bin")

  fun alerts(): List<AlertRecord> = synchronized(lock) { AlertJournal.decode(read(alertsFile)) }

  fun diagnostics(): List<DiagnosticRecord> = synchronized(lock) {
    DiagnosticJournal.decode(read(diagnosticsFile))
  }

  fun upsertAlert(record: AlertRecord) = synchronized(lock) {
    write(alertsFile, AlertJournal.encode(AlertJournal.upsert(alertsUnlocked(), record)))
  }

  fun markAlert(id: String, status: String, detail: String) = synchronized(lock) {
    val records = alertsUnlocked()
    val existing = records.find { it.id == id } ?: return
    write(
      alertsFile,
      AlertJournal.encode(AlertJournal.upsert(records, existing.copy(status = status, detail = detail))),
    )
  }

  fun addDiagnostic(message: String, at: Long = System.currentTimeMillis()) = synchronized(lock) {
    val current = diagnosticsUnlocked()
    val updated = DiagnosticJournal.append(
      current,
      DiagnosticRecord(id = UUID.randomUUID().toString(), at = at, message = message.take(180)),
    )
    if (updated === current) return@synchronized
    write(diagnosticsFile, DiagnosticJournal.encode(updated))
  }

  fun deliveredIdentities(): List<String> = synchronized(lock) {
    MirrorPolicy.decode(read(ledgerFile))
  }

  fun rememberDelivered(identities: List<String>) = synchronized(lock) {
    if (identities.isEmpty()) return
    val updated = MirrorPolicy.remember(MirrorPolicy.decode(read(ledgerFile)), identities)
    write(ledgerFile, MirrorPolicy.encode(updated))
  }

  fun cardSentIdentities(): List<String> = synchronized(lock) {
    MirrorPolicy.decode(read(cardLedgerFile))
  }

  fun rememberCardSent(identities: List<String>) = synchronized(lock) {
    if (identities.isEmpty()) return
    val updated = MirrorPolicy.remember(MirrorPolicy.decode(read(cardLedgerFile)), identities)
    write(cardLedgerFile, MirrorPolicy.encode(updated))
  }

  fun clear() = synchronized(lock) {
    alertsFile.delete()
    diagnosticsFile.delete()
    ledgerFile.delete()
    cardLedgerFile.delete()
  }

  fun quietly(block: DeviceJournal.() -> Unit) {
    runCatching { this.block() }
  }

  private fun alertsUnlocked(): List<AlertRecord> = AlertJournal.decode(read(alertsFile))

  private fun diagnosticsUnlocked(): List<DiagnosticRecord> = DiagnosticJournal.decode(read(diagnosticsFile))

  private fun read(file: File): String? {
    if (!file.exists()) return null
    return crypto.open(file.readText())
  }

  private fun write(file: File, value: String) {
    directory.mkdirs()
    val sealed = crypto.seal(value)
    val temporary = File(directory, "${file.name}.tmp")
    temporary.writeText(sealed)
    if (!temporary.renameTo(file)) {
      file.writeText(sealed)
      temporary.delete()
    }
  }

  private companion object {
    private val lock = Any()
  }
}
