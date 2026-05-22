package vn.tubeppro.crmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Fetch lịch sử chat trực tiếp từ backend mà KHÔNG cần React JS chạy.
 *
 * Dùng SharedPreferences (đã set bởi JS thông qua FloatingBubbleModule):
 *  - KEY_AUTH_TOKEN: Bearer token
 *  - KEY_API_ORIGIN: API gốc, vd https://tubep-backend.onrender.com (không có /api)
 *  - KEY_USER_ID:    user id hiện tại — dùng để xác định `mine`
 *
 * Endpoint:
 *  - Messenger group: GET /api/messenger/groups/:id/chat
 *  - Lead chat:       GET /api/crm/leads/:id/chat
 */
object ChatHistoryFetcher {
  private const val PREFS = "crm_floating_bubble_prefs"
  private val executor = Executors.newSingleThreadExecutor()
  private const val LIMIT = 50

  fun seedAsync(
    ctx: Context,
    bubbleKey: String,
    onDone: (count: Int) -> Unit,
  ) {
    executor.execute {
      val msgs = fetchMessages(ctx, bubbleKey)
      if (msgs.isNotEmpty()) {
        ConversationCache.replaceAll(ctx, bubbleKey, msgs)
      }
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        onDone(msgs.size)
      }
    }
  }

  private fun fetchMessages(ctx: Context, bubbleKey: String): List<ConversationCache.Msg> {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null) ?: return emptyList()
    val origin = prefs.getString(FloatingBubbleModule.KEY_API_ORIGIN, null)
      ?.trimEnd('/') ?: return emptyList()

    val path = if (bubbleKey.startsWith("lead:")) {
      "/api/crm/leads/${bubbleKey.removePrefix("lead:")}/chat"
    } else {
      "/api/messenger/groups/$bubbleKey/chat"
    }
    val url = "$origin$path"

    return try {
      val conn = URL(url).openConnection() as HttpURLConnection
      conn.connectTimeout = 10000
      conn.readTimeout = 12000
      conn.setRequestProperty("Authorization", "Bearer $token")
      conn.setRequestProperty("Accept", "application/json")
      conn.instanceFollowRedirects = true
      val code = conn.responseCode
      if (code !in 200..299) return emptyList()
      val body = conn.inputStream.bufferedReader().use { it.readText() }
      parseChatRows(body, origin)
    } catch (_: Throwable) {
      emptyList()
    }
  }

  private fun parseChatRows(body: String, origin: String): List<ConversationCache.Msg> {
    val arr = try { JSONArray(body) } catch (_: Throwable) { return emptyList() }
    val start = maxOf(0, arr.length() - LIMIT)
    val out = ArrayList<ConversationCache.Msg>(arr.length() - start)
    for (i in start until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      out.add(parseRow(o, origin))
    }
    return out
  }

  internal fun parseRow(o: JSONObject, origin: String): ConversationCache.Msg {
    val user = o.optJSONObject("user")
    val isSystem = o.optBoolean("is_system", false)
    val senderName = when {
      isSystem -> "Hệ thống"
      user != null -> safeStr(user, "full_name").ifBlank { "Người dùng" }
      else -> "Người dùng"
    }
    val userId = user?.let { safeStr(it, "id").ifBlank { null } }
      ?: safeStr(o, "user_id").ifBlank { null }
    val avatarRel = user?.let { safeStr(it, "avatar").ifBlank { null } }
    val avatar = avatarRel?.let { absolutize(it, origin) }
    val content = safeStr(o, "content")
    val messageType = safeStr(o, "message_type").lowercase().ifBlank { null }
    val attachmentUrl = resolveAttachmentUrl(o, origin)
    val text = if (content.isBlank()) fallbackText(messageType, attachmentUrl) else content
    val createdAt = safeStr(o, "created_at")
    val ts = parseIso(createdAt)
    val id = safeStr(o, "id").ifBlank { null }
    val replyTo = o.optJSONObject("reply")?.let { safeStr(it, "content").ifBlank { null } }
      ?: o.optJSONObject("reply_to")?.let { safeStr(it, "content").ifBlank { null } }

    val reactions = parseReactions(o.optJSONArray("reactions"))

    return ConversationCache.Msg(
      id = id,
      userId = userId,
      sender = senderName,
      text = text,
      avatar = avatar,
      ts = ts,
      replyToText = replyTo,
      attachmentUrl = attachmentUrl,
      messageType = messageType,
      reactions = reactions,
    )
  }

  private fun resolveAttachmentUrl(o: JSONObject, origin: String): String? {
    val direct = safeStr(o, "attachment_url")
    if (direct.isNotBlank()) return absolutize(direct, origin)
    val arr = o.optJSONArray("attachments") ?: return null
    val first = arr.optJSONObject(0) ?: return null
    val url = safeStr(first, "url")
    return if (url.isBlank()) null else absolutize(url, origin)
  }

  private fun parseReactions(arr: JSONArray?): List<ConversationCache.Reaction> {
    if (arr == null) return emptyList()
    val out = ArrayList<ConversationCache.Reaction>(arr.length())
    for (i in 0 until arr.length()) {
      val r = arr.optJSONObject(i) ?: continue
      val u = r.optJSONObject("user")
      val emoji = safeStr(r, "emoji")
      if (emoji.isBlank()) continue
      out.add(
        ConversationCache.Reaction(
          emoji = emoji,
          userId = safeStr(r, "user_id").ifBlank { u?.let { safeStr(it, "id") } ?: "" },
          userName = u?.let { safeStr(it, "full_name") } ?: "",
        ),
      )
    }
    return out
  }

  /**
   * `JSONObject.optString` trên Android trả về chuỗi **"null"** khi value là JSON null
   * (mặc dù mặc định nói khác). Wrapper này khử cả "null" / "undefined".
   */
  internal fun safeStr(o: JSONObject, key: String): String {
    if (o.isNull(key)) return ""
    val v = o.optString(key, "")
    if (v == "null" || v == "undefined") return ""
    return v.trim()
  }

  private fun absolutize(rel: String, origin: String): String {
    if (rel.startsWith("http://") || rel.startsWith("https://")) return rel
    return origin + if (rel.startsWith("/")) rel else "/$rel"
  }

  private fun fallbackText(mt: String?, attachmentUrl: String?): String = when {
    mt == "image" -> "🖼️ Hình ảnh"
    mt == "video" -> "🎬 Video"
    mt == "audio" -> "🎙️ Ghi âm"
    mt == "file" -> "📎 Tệp đính kèm"
    attachmentUrl != null -> "📎 Tệp đính kèm"
    else -> "[Tin nhắn]"
  }

  private fun parseIso(s: String): Long {
    if (s.isBlank()) return System.currentTimeMillis()
    return try {
      val fmt = java.text.SimpleDateFormat(
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        java.util.Locale.US,
      )
      fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
      fmt.parse(s)?.time ?: System.currentTimeMillis()
    } catch (_: Throwable) {
      try {
        val fmt2 = java.text.SimpleDateFormat(
          "yyyy-MM-dd'T'HH:mm:ssXXX",
          java.util.Locale.US,
        )
        fmt2.parse(s)?.time ?: System.currentTimeMillis()
      } catch (_: Throwable) {
        System.currentTimeMillis()
      }
    }
  }
}
