package expo.modules.notifiernative.security

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class UrlBase64Test {
  @Test
  fun matchesTheUnpaddedUrlEncodingAlreadyStoredOnDevices() {
    assertEquals("A".repeat(43), UrlBase64.encode(ByteArray(32)))
    assertEquals("AAECAwQFBgcICQoL", UrlBase64.encode(ByteArray(12) { it.toByte() }))
    assertEquals("--__AA", UrlBase64.encode(byteArrayOf(0xfb.toByte(), 0xef.toByte(), 0xff.toByte(), 0)))
    assertEquals(
      byteArrayOf(0xfb.toByte(), 0xef.toByte(), 0xff.toByte(), 0).toList(),
      UrlBase64.decode("++//AA==").toList(),
    )
  }

  @Test
  fun acceptsThePaddedPairingKeyUsedByTheParser() {
    val key = UrlBase64.decode("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    assertEquals(32, key.size)
    assertArrayEquals(ByteArray(32), key)
    assertArrayEquals(key, UrlBase64.decode("A".repeat(43)))
  }

  @Test
  fun rejectsCharactersAndPaddingThatAreNotBase64() {
    assertThrows(IllegalArgumentException::class.java) { UrlBase64.decode("@@@") }
    assertThrows(IllegalArgumentException::class.java) { UrlBase64.decode("A=AA") }
    assertThrows(IllegalArgumentException::class.java) { UrlBase64.decode("AA===") }
  }

  @Test
  fun roundTripsEveryLengthThatTheRelayAccepts() {
    for (size in 0..48) {
      val bytes = ByteArray(size) { (it * 17 + 3).toByte() }
      assertArrayEquals(bytes, UrlBase64.decode(UrlBase64.encode(bytes)))
    }
  }
}
