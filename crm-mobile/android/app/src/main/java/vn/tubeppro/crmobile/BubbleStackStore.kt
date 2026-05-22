package vn.tubeppro.crmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lưu danh sách conversation đang có bong bóng overlay (tối đa [MAX_BUBBLES]).
 * Thứ tự trong list: cũ → mới; bubble mới nhất nằm cuối (trên cùng stack).
 */
object BubbleStackStore {
  const val MAX_BUBBLES = 6
  private const val PREFS = OverlayBubbleService.PREFS
  private const val KEY_STACK = "bubble_stack_json"

  data class Entry(
    val key: String,
    val title: String,
    val letter: String,
    val avatarUrl: String?,
    /** Số tin chưa đọc của RIÊNG conversation này (badge per-bubble). */
    val unreadCount: Int = 0,
  )

  fun load(ctx: Context): MutableList<Entry> {
    val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_STACK, null)
      ?: return mutableListOf()
    return try {
      val arr = JSONArray(raw)
      val out = mutableListOf<Entry>()
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        out.add(
          Entry(
            key = o.getString("key"),
            title = o.optString("title", ""),
            letter = o.optString("letter", "?"),
            avatarUrl = o.optString("avatar_url", "").takeIf { it.isNotBlank() },
            unreadCount = o.optInt("unread", 0),
          ),
        )
      }
      out
    } catch (_: Throwable) {
      mutableListOf()
    }
  }

  fun save(ctx: Context, list: List<Entry>) {
    val arr = JSONArray()
    for (e in list.takeLast(MAX_BUBBLES)) {
      arr.put(
        JSONObject()
          .put("key", e.key)
          .put("title", e.title)
          .put("letter", e.letter)
          .put("avatar_url", e.avatarUrl ?: "")
          .put("unread", e.unreadCount),
      )
    }
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_STACK, arr.toString())
      .apply()
  }

  /**
   * Thêm hoặc đưa conversation lên đầu stack (cuối list).
   *
   * - Nếu entry đã tồn tại: giữ `unreadCount` cũ, update title/letter/avatar mới.
   * - Nếu entry mới: dùng `unreadCount` từ tham số (mặc định 0).
   */
  fun upsert(ctx: Context, entry: Entry): List<Entry> {
    val list = load(ctx)
    val existing = list.find { it.key == entry.key }
    list.removeAll { it.key == entry.key }
    val merged = if (existing != null) entry.copy(unreadCount = existing.unreadCount) else entry
    list.add(merged)
    while (list.size > MAX_BUBBLES) list.removeAt(0)
    save(ctx, list)
    return list
  }

  /** +1 unread cho 1 conv, trả về giá trị mới (0 nếu không tìm thấy). */
  fun incrementUnread(ctx: Context, key: String): Int {
    val list = load(ctx)
    val idx = list.indexOfFirst { it.key == key }
    if (idx < 0) return 0
    val newCount = list[idx].unreadCount + 1
    list[idx] = list[idx].copy(unreadCount = newCount)
    save(ctx, list)
    return newCount
  }

  /** Reset unread count về 0 cho 1 conv (gọi khi user mở panel xem). */
  fun clearUnread(ctx: Context, key: String) {
    val list = load(ctx)
    val idx = list.indexOfFirst { it.key == key }
    if (idx < 0) return
    if (list[idx].unreadCount == 0) return
    list[idx] = list[idx].copy(unreadCount = 0)
    save(ctx, list)
  }

  fun remove(ctx: Context, key: String): List<Entry> {
    val list = load(ctx)
    list.removeAll { it.key == key }
    save(ctx, list)
    return list
  }

  fun clear(ctx: Context) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_STACK).apply()
  }
}
