package expo.modules.notifiernative.notifications

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File

internal class IconStore(context: Context) {
  private val directory = File(context.filesDir, DIRECTORY).apply { mkdirs() }

  fun write(packageName: String, jpeg: ByteArray) {
    if (!PACKAGE_NAME.matches(packageName) || !jpeg.isJpeg()) return
    File(directory, packageName).writeBytes(jpeg)
  }

  fun read(packageName: String): Bitmap? {
    val bytes = readBytes(packageName) ?: return null
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
  }

  fun readBytes(packageName: String): ByteArray? {
    if (!PACKAGE_NAME.matches(packageName)) return null
    val file = File(directory, packageName)
    if (!file.isFile || file.length() !in 1..MAX_BYTES) return null
    val bytes = file.readBytes()
    return bytes.takeIf { it.isJpeg() }
  }

  fun retain(packageNames: Set<String>) {
    directory.listFiles()?.forEach { file ->
      if (file.name !in packageNames) file.delete()
    }
  }

  fun clear() {
    directory.deleteRecursively()
  }

  companion object {
    private const val DIRECTORY = "source-icons"
    private const val MAX_BYTES = 8_192L
    private val PACKAGE_NAME = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$")

  }
}

private fun ByteArray.isJpeg(): Boolean =
  size > 3 && this[0] == 0xFF.toByte() && this[1] == 0xD8.toByte()
