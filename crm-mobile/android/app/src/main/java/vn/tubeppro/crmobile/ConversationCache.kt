package vn.tubeppro.crmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lưu danh sách tin nhắn gần đây cho mỗi conversation (per bubble key) để
 * khi user tap bong bóng có thể hiển thị ngay nội dung — không cần fetch
 * API hoặc render React.
 */
object ConversationCache {
  data class Msg(
    val sender: String,
    val text: String,
    val avatar: String?,
    val ts: Long,
  )

  private const val PREFS = "crm_floating_bubble_prefs"
  private const val KEY_PREFIX = "conv_msgs_"
  private const val MAX = 30

  fun append(ctx: Context, key: String, msg: Msg) {
    val cur = list(ctx, key).toMutableList()
    cur.add(msg)
    while (cur.size > MAX) cur.removeAt(0)
    val arr = JSONArray()
    for (m in cur) {
      arr.put(
        JSONObject()
          .put("s", m.sender)
          .put("t", m.text)
          .put("a", m.avatar ?: "")
          .put("ts", m.ts),
      )
    }
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PREFIX + key, arr.toString())
      .apply()
  }

  fun list(ctx: Context, key: String): List<Msg> {
    val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_PREFIX + key, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      List(arr.length()) { i ->
        val o = arr.getJSONObject(i)
        Msg(
          sender = o.optString("s", ""),
          text = o.optString("t", ""),
          avatar = o.optString("a", "").takeIf { it.isNotBlank() },
          ts = o.optLong("ts", 0L),
        )
      }
    } catch (_: Throwable) {
      emptyList()
    }
  }

  fun clear(ctx: Context, key: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_PREFIX + key)
      .apply()
  }
}
