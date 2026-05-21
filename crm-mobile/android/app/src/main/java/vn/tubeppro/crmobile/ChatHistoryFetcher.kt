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
 *
 * Endpoint:
 *  - Messenger group: GET /api/messenger/groups/:id/chat
 *  - Lead chat:       GET /api/crm/leads/:id/chat
 */
object ChatHistoryFetcher {
  private const val PREFS = "crm_floating_bubble_prefs"
  private val executor = Executors.newSingleThreadExecutor()

  fun seedAsync(
    ctx: Context,
    bubbleKey: String,
    onDone: (count: Int) -> Unit,
  ) {
    executor.execute {
      val msgs = fetchMessages(ctx, bubbleKey)
      if (msgs.isNotEmpty()) {
        ConversationCache.clear(ctx, bubbleKey)
        for (m in msgs) ConversationCache.append(ctx, bubbleKey, m)
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
    // Backend trả mảng cũ → mới; ta cắt 30 phần cuối
    val start = maxOf(0, arr.length() - 30)
    val out = ArrayList<ConversationCache.Msg>(arr.length() - start)
    for (i in start until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val user = o.optJSONObject("user")
      val isSystem = o.optBoolean("is_system", false)
      val senderName = when {
        isSystem -> "Hệ thống"
        user != null -> user.optString("full_name", "").ifBlank { "Người dùng" }
        else -> "Người dùng"
      }
      val avatarRel = user?.optString("avatar", "")?.takeIf { it.isNotBlank() }
      val avatar = avatarRel?.let {
        if (it.startsWith("http://") || it.startsWith("https://")) it
        else origin + if (it.startsWith("/")) it else "/$it"
      }
      val content = o.optString("content", "")
      val text = if (content.isBlank()) fallbackText(o) else content
      val createdAt = o.optString("created_at", "")
      val ts = parseIso(createdAt)
      out.add(
        ConversationCache.Msg(
          sender = senderName,
          text = text,
          avatar = avatar,
          ts = ts,
        ),
      )
    }
    return out
  }

  private fun fallbackText(o: JSONObject): String {
    val mt = o.optString("message_type", "").lowercase()
    return when {
      mt == "image" -> "🖼️ Hình ảnh"
      mt == "video" -> "🎬 Video"
      mt == "audio" -> "🎙️ Ghi âm"
      o.optJSONArray("attachments") != null -> "📎 Tệp đính kèm"
      o.optString("attachment_url", "").isNotBlank() -> "📎 Tệp đính kèm"
      else -> "[Tin nhắn]"
    }
  }

  private fun parseIso(s: String): Long {
    if (s.isBlank()) return System.currentTimeMillis()
    return try {
      // Backend dùng ISO8601, vd "2024-05-21T08:00:00.000Z"
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
