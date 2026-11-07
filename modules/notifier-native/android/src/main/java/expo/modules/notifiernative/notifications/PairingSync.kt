package expo.modules.notifiernative.notifications

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.data.PendingCleanup
import expo.modules.notifiernative.data.PairingState
import expo.modules.notifiernative.network.RelayClient

internal object PairingSync {
  @Volatile
  private var lastFailureMessage: String? = null

  fun refresh(context: Context): Boolean {
    val store = NotifierStore(context)
    val pairing = store.pairingState ?: return false
    val relayUrl = store.relayUrl ?: return true
    val token = capability(pairing) ?: return true
    if (!DeliveryPolicy.shouldProbePairing(hasValidatedNetwork(context))) return true
    return try {
      RelayClient(relayUrl).pairingStatus(pairing.inboxId, token)
      noteRestored(context)
      true
    } catch (error: RelayClient.RelayException) {
      if (DeliveryPolicy.isInboxMissing(error.statusCode, error.message)) {
        clearLocal(context, store)
        false
      } else {
        reportFailure(context, error.statusCode, null)
        true
      }
    } catch (error: Exception) {
      reportFailure(context, DeliveryPolicy.NETWORK_FAILURE, error.javaClass.simpleName)
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

  private fun noteRestored(context: Context) {
    val previous = lastFailureMessage ?: newestPairingMessage(context)
    lastFailureMessage = null
    if (previous?.startsWith(DeliveryPolicy.PAIRING_FAILURE_PREFIX) != true) return
    if (runCatching { DeviceJournal(context).addDiagnostic(DeliveryPolicy.PAIRING_RESTORED) }.isSuccess) {
      lastFailureMessage = DeliveryPolicy.PAIRING_RESTORED
    }
  }

  private fun reportFailure(context: Context, status: Int, reason: String?) {
    val previous = lastFailureMessage ?: newestPairingMessage(context)
    val message = DeliveryPolicy.nextPairingFailure(previous, status, reason) ?: run {
      lastFailureMessage = previous
      return
    }
    if (runCatching { DeviceJournal(context).addDiagnostic(message) }.isSuccess) {
      lastFailureMessage = message
    }
  }

  private fun newestPairingMessage(context: Context): String? =
    DeliveryPolicy.newestPairingMessage(DeviceJournal(context).diagnostics().map(DiagnosticRecord::message))

  private fun hasValidatedNetwork(context: Context): Boolean {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
    val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
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
