package expo.modules.notifiernative.security

internal object UrlBase64 {
  private const val ENCODE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  private val DECODE = IntArray(128) { INVALID }.also { table ->
    ENCODE.forEachIndexed { index, symbol -> table[symbol.code] = index }
    table['+'.code] = ENCODE.indexOf('-')
    table['/'.code] = ENCODE.indexOf('_')
  }

  fun encode(bytes: ByteArray): String {
    val output = StringBuilder((bytes.size * 4 + 2) / 3)
    var index = 0
    while (index + 2 < bytes.size) {
      val value = ((bytes[index].toInt() and 0xff) shl 16) or
        ((bytes[index + 1].toInt() and 0xff) shl 8) or
        (bytes[index + 2].toInt() and 0xff)
      writeQuantum(output, value, 4)
      index += 3
    }
    val remaining = bytes.size - index
    if (remaining == 1) {
      writeQuantum(output, (bytes[index].toInt() and 0xff) shl 16, 2)
    } else if (remaining == 2) {
      val value = ((bytes[index].toInt() and 0xff) shl 16) or ((bytes[index + 1].toInt() and 0xff) shl 8)
      writeQuantum(output, value, 3)
    }
    return output.toString()
  }

  fun decode(value: String): ByteArray {
    val trimmed = value.trim()
    require(trimmed.none(Char::isWhitespace)) { "Invalid base64." }
    val padding = trimmed.takeLastWhile { it == '=' }.length
    require(padding <= 2) { "Invalid base64." }
    val body = trimmed.dropLast(padding)
    require(body.none { it == '=' }) { "Invalid base64." }
    if (body.isEmpty()) {
      require(padding == 0) { "Invalid base64." }
      return ByteArray(0)
    }

    val output = ArrayList<Byte>(body.length * 3 / 4)
    var buffer = 0
    var bits = 0
    for (symbol in body) {
      val decoded = DECODE.getOrElse(symbol.code) { INVALID }
      require(decoded >= 0) { "Invalid base64." }
      buffer = (buffer shl 6) or decoded
      bits += 6
      if (bits >= 8) {
        bits -= 8
        output.add(((buffer shr bits) and 0xff).toByte())
        buffer = buffer and ((1 shl bits) - 1)
      }
    }
    require(bits == 0 || buffer == 0) { "Invalid base64." }
    return output.toByteArray()
  }

  private fun writeQuantum(output: StringBuilder, value: Int, characters: Int) {
    output.append(ENCODE[(value ushr 18) and 63])
    output.append(ENCODE[(value ushr 12) and 63])
    if (characters > 2) output.append(ENCODE[(value ushr 6) and 63])
    if (characters > 3) output.append(ENCODE[value and 63])
  }

  private const val INVALID = -1
}
