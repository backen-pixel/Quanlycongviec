package vn.tubeppro.crmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lưu danh sách tin nhắn gần đây cho mỗi conversation (per bubble key) để
 * khi user tap bong bóng có thể hiển thị ngay nội dung — không cần fetch
 * API hoặc render React.
 *
 * Schema mở rộng (Phase 4):
 *  - id          : message id (server) — null nếu native peek append local
 *  - userId      : sender user id — null cho system message
 *  - replyToText : nội dung tin reply (đã rút gọn) — null nếu không reply
 *  - attachmentUrl : URL ảnh/file/audio (absolute) — null nếu text-only
 *  - messageType : "text"|"image"|"video"|"audio"|"file"|null
 *  - reactions   : list [(emoji, userId, userName)]
 *
 * JSON keys ngắn để tiết kiệm SharedPreferences:
 *   id, uid, s (sender name), t (text), a (avatar), ts,
 *   rt (replyToText), au (attachmentUrl), mt (messageType), rx (reactions)
 */
object ConversationCache {
  data class Reaction(
    val emoji: String,
    val userId: String,
    val userName: String,
  )

  data class Msg(
    val id: String? = null,
    val userId: String? = null,
    val sender: String,
    val text: String,
    val avatar: String?,
    val ts: Long,
    val replyToText: String? = null,
    val attachmentUrl: String? = null,
    val messageType: String? = null,
    val reactions: List<Reaction> = emptyList(),
  )

  private const val PREFS = "crm_floating_bubble_prefs"
  private const val KEY_PREFIX = "conv_msgs_"
  private const val MAX = 60

  fun append(ctx: Context, key: String, msg: Msg) {
    val cur = list(ctx, key).toMutableList()
    // Nếu id trùng (duplicate từ realtime + history) → overwrite chứ không append
    val existingIdx = if (msg.id != null) cur.indexOfFirst { it.id == msg.id } else -1
    if (existingIdx >= 0) cur[existingIdx] = msg
    else cur.add(msg)
    while (cur.size > MAX) cur.removeAt(0)
    persist(ctx, key, cur)
  }

  fun replaceAll(ctx: Context, key: String, msgs: List<Msg>) {
    val limited = if (msgs.size > MAX) msgs.subList(msgs.size - MAX, msgs.size) else msgs
    persist(ctx, key, limited)
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

  fun updateReactions(
    ctx: Context,
    key: String,
    messageId: String,
    reactions: List<Reaction>,
  ) {
    val cur = list(ctx, key).toMutableList()
    val idx = cur.indexOfFirst { it.id == messageId }
    if (idx < 0) return
    cur[idx] = cur[idx].copy(reactions = reactions)
    persist(ctx, key, cur)
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
      .put("s", m.sender)
      .put("t", m.text)
      .put("a", m.avatar ?: "")
      .put("ts", m.ts)
    if (m.id != null) o.put("id", m.id)
    if (m.userId != null) o.put("uid", m.userId)
    if (m.replyToText != null) o.put("rt", m.replyToText)
    if (m.attachmentUrl != null) o.put("au", m.attachmentUrl)
    if (m.messageType != null) o.put("mt", m.messageType)
    if (m.reactions.isNotEmpty()) {
      val rx = JSONArray()
      for (r in m.reactions) {
        rx.put(
          JSONObject()
            .put("e", r.emoji)
            .put("u", r.userId)
            .put("n", r.userName),
        )
      }
      o.put("rx", rx)
    }
    return o
  }

  private fun fromJson(o: JSONObject): Msg {
    val rxArr = o.optJSONArray("rx")
    val reactions = if (rxArr == null) emptyList<Reaction>() else List(rxArr.length()) { i ->
      val r = rxArr.optJSONObject(i) ?: JSONObject()
      Reaction(
        emoji = r.optString("e", ""),
        userId = r.optString("u", ""),
        userName = r.optString("n", ""),
      )
    }
    return Msg(
      id = o.optString("id", "").takeIf { it.isNotBlank() },
      userId = o.optString("uid", "").takeIf { it.isNotBlank() },
      sender = o.optString("s", ""),
      text = o.optString("t", ""),
      avatar = o.optString("a", "").takeIf { it.isNotBlank() },
      ts = o.optLong("ts", 0L),
      replyToText = o.optString("rt", "").takeIf { it.isNotBlank() },
      attachmentUrl = o.optString("au", "").takeIf { it.isNotBlank() },
      messageType = o.optString("mt", "").takeIf { it.isNotBlank() },
      reactions = reactions,
    )
  }
}
