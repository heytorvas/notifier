package expo.modules.notifiernative.notifications

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import java.io.ByteArrayOutputStream

internal object RelayIconEncoder {
  private const val MAX_BYTES = 1_400

  fun jpeg(drawable: Drawable): ByteArray? {
    var size = 72
    while (size >= 24) {
      val bitmap = render(drawable, size)
      try {
        var quality = 60
        while (quality >= 35) {
          val bytes = ByteArrayOutputStream().use { output ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)
            output.toByteArray()
          }
          if (bytes.size <= MAX_BYTES) return bytes
          quality -= 10
        }
      } finally {
        bitmap.recycle()
      }
      size = (size * 0.75f).toInt()
    }
    return null
  }

  private fun render(drawable: Drawable, size: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, size, size)
    drawable.draw(canvas)
    return bitmap
  }
}
