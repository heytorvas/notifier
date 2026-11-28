package expo.modules.notifiernative.notifications

import android.content.Context
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.data.PendingCleanup
import expo.modules.notifiernative.data.PairingState
import expo.modules.notifiernative.network.DeviceNetwork
import expo.modules.notifiernative.network.RelayClient
import java.util.concurrent.Executors

internal object PairingSync {
  private val healthReports = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "notifier-listener-health").apply { isDaemon = true }
  }

  @Volatile
  private var lastFailureMessage: String? = null

  @Volatile
  private var lastReportedListening: Boolean? = null

  @Volatile
  private var lastReportAtMs = 0L

  private val probeGate = Any()

  fun reportCurrentListener(context: Context, listening: Boolean) {
    val appContext = context.applicationContext
    healthReports.execute {
      val store = NotifierStore(appContext)
      val pairing = store.pairingState ?: return@execute
      if (pairing.role != DeviceRole.TRANSMITTER) return@execute
      val token = pairing.senderToken ?: return@execute
      val relayUrl = store.relayUrl ?: return@execute
      val reported = runCatching {
        RelayClient.connected(appContext, relayUrl).reportListener(pairing.inboxId, token, listening)
      }.isSuccess
      if (!reported && lastReportedListening == listening) {
        lastReportedListening = null
        lastReportAtMs = 0L
      }
    }
  }

  fun refresh(context: Context): Boolean = synchronized(probeGate) {
    val store = NotifierStore(context)
    val pairing = store.pairingState ?: return false
    val relayUrl = store.relayUrl ?: return true
    val token = capability(pairing) ?: return true
    if (!DeliveryPolicy.shouldProbePairing(DeviceNetwork.validated(context) != null)) return true
    return try {
      val status = readStatus(context, relayUrl, pairing.inboxId, token)
      val previousListener = store.senderListener
      store.senderListener = status.senderListener
      ConnectionNotice.forSender(
        receiver = pairing.role == DeviceRole.RECEIVER,
        previous = previousListener,
        next = status.senderListener,
      )?.let { ConnectionNotifications.show(context, it) }
      if (
        pairing.role == DeviceRole.TRANSMITTER &&
        ListenerBinding.shouldReportListener(
          connected = ListenerConnectionState.connected,
          downForMs = listenerDownFor(store),
          lastReported = lastReportedListening,
          millisSinceReport = if (lastReportAtMs == 0L) Long.MAX_VALUE else System.currentTimeMillis() - lastReportAtMs,
        )
      ) {
        lastReportedListening = ListenerConnectionState.connected
        lastReportAtMs = System.currentTimeMillis()
        reportCurrentListener(context, ListenerConnectionState.connected)
      }
      noteRestored(context, pairing.role)
      true
    } catch (_: ProbeSkipped) {
      true
    } catch (error: RelayClient.RelayException) {
      if (DeliveryPolicy.isInboxMissing(error.statusCode, error.message)) {
        clearLocal(context, store)
        false
      } else {
        reportFailure(context, pairing.role, error.statusCode, null)
        true
      }
    } catch (error: Exception) {
      reportFailure(context, pairing.role, DeliveryPolicy.NETWORK_FAILURE, error.javaClass.simpleName)
      true
    }
  }

  fun forgetPeer(context: Context) {
    val store = NotifierStore(context)
    if (store.pairingState == null) return
    clearLocal(context, store)
  }

  fun requestUnpair(context: Context) {
    val store = NotifierStore(context)
    val pairing = store.pairingState
    val relayUrl = store.relayUrl
    val token = pairing?.let(::capability)
    if (pairing != null && relayUrl != null && token != null) {
      val removed = runCatching { RelayClient.connected(context, relayUrl).unpair(pairing.inboxId, token) }
      val error = removed.exceptionOrNull()
      val alreadyGone = error is RelayClient.RelayException &&
        DeliveryPolicy.isInboxMissing(error.statusCode, error.message)
      if (removed.isFailure && !alreadyGone) {
        store.savePendingCleanup(PendingCleanup(relayUrl, pairing.inboxId, token))
      }
    }
    clearLocal(context, store)
  }

  private fun readStatus(
    context: Context,
    relayUrl: String,
    inboxId: String,
    token: String,
  ): RelayClient.PairingStatus {
    var attempt = 0
    while (true) {
      val network = DeviceNetwork.validated(context) ?: throw ProbeSkipped()
      try {
        return RelayClient(relayUrl, network).pairingStatus(inboxId, token)
      } catch (error: Exception) {
        if (!ProbeRetries.again(attempt, error)) throw error
        attempt += 1
        try {
          Thread.sleep(ProbeRetries.delayMs(attempt - 1))
        } catch (interrupted: InterruptedException) {
          Thread.currentThread().interrupt()
          throw error
        }
      }
    }
  }

  private fun noteRestored(context: Context, role: DeviceRole) {
    val previous = lastFailureMessage ?: newestPairingMessage(context)
    lastFailureMessage = null
    if (previous?.startsWith(DeliveryPolicy.PAIRING_FAILURE_PREFIX) != true) return
    if (runCatching { DeviceJournal(context).addDiagnostic(DeliveryPolicy.PAIRING_RESTORED) }.isSuccess) {
      lastFailureMessage = DeliveryPolicy.PAIRING_RESTORED
      announce(context, role, previous, DeliveryPolicy.PAIRING_RESTORED)
    }
  }

  private fun reportFailure(context: Context, role: DeviceRole, status: Int, reason: String?) {
    val previous = lastFailureMessage ?: newestPairingMessage(context)
    val message = DeliveryPolicy.nextPairingFailure(previous, status, reason) ?: run {
      lastFailureMessage = previous
      return
    }
    if (runCatching { DeviceJournal(context).addDiagnostic(message) }.isSuccess) {
      lastFailureMessage = message
      announce(context, role, previous, message)
    }
  }

  private fun announce(context: Context, role: DeviceRole, previous: String?, next: String) {
    ConnectionNotice.forPairing(role == DeviceRole.RECEIVER, previous, next)
      ?.let { ConnectionNotifications.show(context, it) }
  }

  private class ProbeSkipped : Exception()

  private fun newestPairingMessage(context: Context): String? =
    DeliveryPolicy.newestPairingMessage(DeviceJournal(context).diagnostics().map(DiagnosticRecord::message))

  private fun listenerDownFor(store: NotifierStore): Long {
    val since = store.listenerDownSince
    if (since <= 0L) return 0L
    return (System.currentTimeMillis() - since).coerceAtLeast(0L)
  }

  private fun capability(pairing: PairingState): String? = when (pairing.role) {
    DeviceRole.RECEIVER -> pairing.ownerToken
    DeviceRole.TRANSMITTER -> pairing.senderToken
  }

  private fun clearLocal(context: Context, store: NotifierStore) {
    lastFailureMessage = null
    store.clearPairing()
    IconStore(context).clear()
    DeviceJournal(context).clear()
  }
}
