package vn.tubeppro.crmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lưu danh sách tin nhắn gần đây cho mỗi conversation (per bubble key) để
 * khi user tap bong bóng có thể hiển thị ngay nội dung — không cần fetch
 * API hoặc render React.
 *
 * Format JSON tối ưu (key 1-2 ký tự):
 *  id, s=sender, sid=senderId, t=text, a=avatar, ts=createdAt,
 *  mt=messageType, au=attachmentUrl, am=attachmentMime,
 *  rx=[{e=emoji, u=userId}], mine=bool
 */
object ConversationCache {
  data class Reaction(val emoji: String, val userId: String)

  data class Msg(
    val id: String,
    val sender: String,
    val senderId: String,
    val text: String,
    val avatar: String?,
    val ts: Long,
    val messageType: String,
    val attachmentUrl: String?,
    val attachmentMime: String?,
    val reactions: List<Reaction>,
    val mine: Boolean,
  )

  private const val PREFS = "crm_floating_bubble_prefs"
  private const val KEY_PREFIX = "conv_msgs_"
  private const val MAX = 60

  fun append(ctx: Context, key: String, msg: Msg) {
    val cur = list(ctx, key).toMutableList()
    // Dedupe theo id (nếu có)
    if (msg.id.isNotBlank()) {
      val idx = cur.indexOfFirst { it.id == msg.id }
      if (idx >= 0) {
        cur[idx] = msg
      } else {
        cur.add(msg)
      }
    } else {
      cur.add(msg)
    }
    while (cur.size > MAX) cur.removeAt(0)
    persist(ctx, key, cur)
  }

  fun replaceAll(ctx: Context, key: String, msgs: List<Msg>) {
    val trimmed = if (msgs.size > MAX) msgs.takeLast(MAX) else msgs
    persist(ctx, key, trimmed)
  }

  fun updateReactions(ctx: Context, key: String, messageId: String, reactions: List<Reaction>) {
    if (messageId.isBlank()) return
    val cur = list(ctx, key).toMutableList()
    val idx = cur.indexOfFirst { it.id == messageId }
    if (idx < 0) return
    cur[idx] = cur[idx].copy(reactions = reactions)
    persist(ctx, key, cur)
  }

  fun list(ctx: Context, key: String): List<Msg> {
    val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_PREFIX + key, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      List(arr.length()) { i -> fromJson(arr.getJSONObject(i)) }
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

  private fun persist(ctx: Context, key: String, msgs: List<Msg>) {
    val arr = JSONArray()
    for (m in msgs) arr.put(toJson(m))
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PREFIX + key, arr.toString())
      .apply()
  }

  private fun toJson(m: Msg): JSONObject {
    val o = JSONObject()
      .put("id", m.id)
      .put("s", m.sender)
      .put("sid", m.senderId)
      .put("t", m.text)
      .put("a", m.avatar ?: "")
      .put("ts", m.ts)
      .put("mt", m.messageType)
      .put("au", m.attachmentUrl ?: "")
      .put("am", m.attachmentMime ?: "")
      .put("mine", m.mine)
    if (m.reactions.isNotEmpty()) {
      val rxArr = JSONArray()
      for (r in m.reactions) {
        rxArr.put(JSONObject().put("e", r.emoji).put("u", r.userId))
      }
      o.put("rx", rxArr)
    }
    return o
  }

  private fun fromJson(o: JSONObject): Msg {
    val rxArr = o.optJSONArray("rx")
    val rx = if (rxArr != null) {
      List(rxArr.length()) { i ->
        val r = rxArr.getJSONObject(i)
        Reaction(r.optString("e", ""), r.optString("u", ""))
      }
    } else emptyList()
    return Msg(
      id = o.optString("id", ""),
      sender = o.optString("s", ""),
      senderId = o.optString("sid", ""),
      text = o.optString("t", ""),
      avatar = o.optString("a", "").takeIf { it.isNotBlank() },
      ts = o.optLong("ts", 0L),
      messageType = o.optString("mt", "text").ifBlank { "text" },
      attachmentUrl = o.optString("au", "").takeIf { it.isNotBlank() },
      attachmentMime = o.optString("am", "").takeIf { it.isNotBlank() },
      reactions = rx,
      mine = o.optBoolean("mine", false),
    )
  }
}
