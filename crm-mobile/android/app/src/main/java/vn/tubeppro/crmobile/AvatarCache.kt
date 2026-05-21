package vn.tubeppro.crmobile

import android.graphics.Bitmap

/**
 * LRU cache cho avatar bitmaps (overlay + panel). Giới hạn 20 entry để tránh
 * RAM phình ra khi user có nhiều conversation.
 */
object AvatarCache {
  private const val MAX = 20
  private val map = object : LinkedHashMap<String, Bitmap>(16, 0.75f, true) {
    override fun removeEldestEntry(eldest: Map.Entry<String, Bitmap>?): Boolean = size > MAX
  }

  @Synchronized
  fun get(url: String): Bitmap? = map[url]

  @Synchronized
  fun put(url: String, bmp: Bitmap) {
    map[url] = bmp
  }

  @Synchronized
  fun clear() {
    map.clear()
  }
}
