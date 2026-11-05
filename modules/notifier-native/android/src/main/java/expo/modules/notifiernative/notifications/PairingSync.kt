package expo.modules.notifiernative.notifications

import android.content.Context
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.data.PendingCleanup
import expo.modules.notifiernative.data.PairingState
import expo.modules.notifiernative.network.RelayClient

internal object PairingSync {
  @Volatile
  private var lastFailureStatus: Int? = null

  fun refresh(context: Context): Boolean {
    val store = NotifierStore(context)
    val pairing = store.pairingState ?: return false
    val relayUrl = store.relayUrl ?: return true
    val token = capability(pairing) ?: return true
    return try {
      RelayClient(relayUrl).pairingStatus(pairing.inboxId, token)
      lastFailureStatus = null
      true
    } catch (error: RelayClient.RelayException) {
      if (DeliveryPolicy.isInboxMissing(error.statusCode, error.message)) {
        clearLocal(context, store)
        false
      } else {
        reportFailure(context, error.statusCode)
        true
      }
    } catch (_: Exception) {
      reportFailure(context, DeliveryPolicy.NETWORK_FAILURE)
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
      val removed = runCatching { RelayClient(relayUrl).unpair(pairing.inboxId, token) }
      val error = removed.exceptionOrNull()
      val alreadyGone = error is RelayClient.RelayException &&
        DeliveryPolicy.isInboxMissing(error.statusCode, error.message)
      if (removed.isFailure && !alreadyGone) {
        store.savePendingCleanup(PendingCleanup(relayUrl, pairing.inboxId, token))
      }
    }
    clearLocal(context, store)
  }

  private fun reportFailure(context: Context, status: Int) {
    val message = DeliveryPolicy.pairingFailureMessage(lastFailureStatus, status) ?: return
    lastFailureStatus = status
    DeviceJournal(context).quietly { addDiagnostic(message) }
  }

  private fun capability(pairing: PairingState): String? = when (pairing.role) {
    DeviceRole.RECEIVER -> pairing.ownerToken
    DeviceRole.TRANSMITTER -> pairing.senderToken
  }

  private fun clearLocal(context: Context, store: NotifierStore) {
    lastFailureStatus = null
    store.clearPairing()
    IconStore(context).clear()
    DeviceJournal(context).clear()
  }
}
