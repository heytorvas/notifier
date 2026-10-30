package expo.modules.notifiernative.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingStateCodecTest {
  @Test
  fun receiverStateRoundTripsAsOneRecord() {
    val state = PairingState(
      role = DeviceRole.RECEIVER,
      inboxId = "inbox",
      ownerToken = "owner",
      pairingToken = "pairing",
      senderToken = null,
      pairingKey = "key",
    )

    assertEquals(state, PairingStateCodec.decode(PairingStateCodec.encode(state)))
    assertTrue(state.isComplete)
  }

  @Test
  fun transmitterDoesNotRequireOwnerCapability() {
    val state = PairingState(
      role = DeviceRole.TRANSMITTER,
      inboxId = "inbox",
      ownerToken = null,
      pairingToken = null,
      senderToken = "sender",
      pairingKey = "key",
    )

    assertTrue(state.isComplete)
  }

  @Test
  fun claimedReceiverNoLongerRequiresReusablePairingToken() {
    val state = PairingState(
      role = DeviceRole.RECEIVER,
      inboxId = "inbox",
      ownerToken = "owner",
      pairingToken = null,
      senderToken = null,
      pairingKey = "key",
      receiverClaimed = true,
    )

    assertTrue(state.isComplete)
    assertEquals(state, PairingStateCodec.decode(PairingStateCodec.encode(state)))
  }

  @Test
  fun incompleteOrMalformedStateIsRejected() {
    assertFalse(
      PairingState(
        role = DeviceRole.RECEIVER,
        inboxId = "inbox",
        ownerToken = null,
        pairingToken = "pairing",
        senderToken = null,
        pairingKey = "key",
      ).isComplete,
    )
    assertNull(PairingStateCodec.decode("""{"role":"unknown"}"""))
    assertNull(PairingStateCodec.decode("not-json"))
  }

  @Test
  fun cleanupCapabilityRoundTripsIndependentlyFromPairing() {
    val cleanup = PendingCleanup(
      relayUrl = "https://relay.example",
      inboxId = "inbox",
      ownerToken = "owner",
    )

    assertEquals(cleanup, PendingCleanupCodec.decode(PendingCleanupCodec.encode(cleanup)))
    assertNull(PendingCleanupCodec.decode("""{"inboxId":""}"""))
  }
}
