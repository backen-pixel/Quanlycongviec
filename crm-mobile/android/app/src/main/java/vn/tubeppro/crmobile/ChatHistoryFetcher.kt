package vn.tubeppro.crmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Fetch lịch sử chat trực tiếp từ backend mà KHÔNG cần React JS chạy.
 * Dùng SharedPreferences (set bởi FloatingBubbleModule):
 *  - KEY_AUTH_TOKEN: Bearer token
 *  - KEY_API_ORIGIN: API gốc (vd https://tubep-backend.onrender.com)
 *  - KEY_CURRENT_USER_ID: để biết tin nào là "mine"
 */
object ChatHistoryFetcher {
  private const val PREFS = "crm_floating_bubble_prefs"
  private val executor = Executors.newSingleThreadExecutor()

  /**
   * Fetch và merge messages từ server vào cache.
   * `onDone(count)`:
   *  - count > 0 nếu cache có thay đổi (UI cần re-render)
   *  - count = 0 nếu không có gì khác → UI có thể bỏ qua, tránh flicker khi polling
   *  - count = -1 nếu fetch fail (giữ nguyên cache)
   */
  fun seedAsync(
    ctx: Context,
    bubbleKey: String,
    onDone: (count: Int) -> Unit,
  ) {
    executor.execute {
      val msgs = fetchMessages(ctx, bubbleKey)
      val notify: Int = when {
        msgs == null -> -1
        msgs.isEmpty() -> 0
        else -> {
          val merged = mergeWithOptimistic(ctx, bubbleKey, msgs)
          if (didChange(ctx, bubbleKey, merged)) {
            ConversationCache.replaceAll(ctx, bubbleKey, merged)
            merged.size
          } else 0
        }
      }
      android.os.Handler(android.os.Looper.getMainLooper()).post { onDone(notify) }
    }
  }

  /**
   * Giữ lại các tin "optimistic" của user (id bắt đầu bằng "local-") chưa thấy trong
   * danh sách server → tránh "biến mất" khi polling. Nếu server đã ack (cùng nội dung +
   * trong vòng 5s) thì bỏ optimistic.
   */
  private fun mergeWithOptimistic(
    ctx: Context,
    bubbleKey: String,
    fromServer: List<ConversationCache.Msg>,
  ): List<ConversationCache.Msg> {
    val current = ConversationCache.list(ctx, bubbleKey)
    val optimistic = current.filter { it.id.startsWith("local-") }
    if (optimistic.isEmpty()) return fromServer
    val serverTexts = fromServer.map { it.text to (it.ts / 5000) }.toSet()
    val keep = optimistic.filter { (it.text to (it.ts / 5000)) !in serverTexts }
    return fromServer + keep
  }

  private fun didChange(
    ctx: Context,
    bubbleKey: String,
    next: List<ConversationCache.Msg>,
  ): Boolean {
    val cur = ConversationCache.list(ctx, bubbleKey)
    if (cur.size != next.size) return true
    for (i in cur.indices) {
      val a = cur[i]; val b = next[i]
      if (a.id != b.id || a.text != b.text) return true
      if (a.reactions.size != b.reactions.size) return true
      // Reactions có thể đổi nội dung mà giữ nguyên count → so kỹ
      for (j in a.reactions.indices) {
        val ra = a.reactions[j]; val rb = b.reactions[j]
        if (ra.emoji != rb.emoji || ra.userId != rb.userId) return true
      }
    }
    return false
  }

  /** Trả null nếu fetch fail; emptyList nếu server không có tin. */
  private fun fetchMessages(ctx: Context, bubbleKey: String): List<ConversationCache.Msg>? {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null) ?: return null
    val origin = prefs.getString(FloatingBubbleModule.KEY_API_ORIGIN, null)?.trimEnd('/')
      ?: return null
    val currentUserId = prefs.getString(FloatingBubbleModule.KEY_CURRENT_USER_ID, null) ?: ""

    val path = if (bubbleKey.startsWith("lead:")) {
      "/api/crm/leads/${bubbleKey.removePrefix("lead:")}/chat"
    } else {
      "/api/messenger/groups/$bubbleKey/chat"
    }
    return try {
      val conn = URL("$origin$path").openConnection() as HttpURLConnection
      conn.connectTimeout = 8000
      conn.readTimeout = 10000
      conn.setRequestProperty("Authorization", "Bearer $token")
      conn.setRequestProperty("Accept", "application/json")
      conn.instanceFollowRedirects = true
      val code = conn.responseCode
      if (code !in 200..299) return null
      val body = conn.inputStream.bufferedReader().use { it.readText() }
      parseChatRows(body, origin, currentUserId)
    } catch (_: Throwable) {
      null
    }
  }

  private fun parseChatRows(
    body: String,
    origin: String,
    currentUserId: String,
  ): List<ConversationCache.Msg> {
    val arr = try { JSONArray(body) } catch (_: Throwable) { return emptyList() }
    val start = maxOf(0, arr.length() - 60)
    val out = ArrayList<ConversationCache.Msg>(arr.length() - start)
    for (i in start until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val user = o.optJSONObject("user")
      val isSystem = o.optBoolean("is_system", false)
      val senderId = when {
        user != null -> user.optString("id", "")
        else -> o.optString("user_id", "")
      }
      val senderName = when {
        isSystem -> "Hệ thống"
        user != null -> user.optString("full_name", "").ifBlank { "Người dùng" }
        else -> "Người dùng"
      }
      val avatarRel = user?.optString("avatar", "")?.takeIf { it.isNotBlank() }
      val avatar = avatarRel?.let { resolveUrl(origin, it) }

      val content = o.optString("content", "")
      val mt = o.optString("message_type", "").lowercase().ifBlank {
        guessMessageType(o)
      }
      val attachmentRel = o.optString("attachment_url", "").takeIf { it.isNotBlank() }
      val attachmentUrl = attachmentRel?.let { resolveUrl(origin, it) }
      val attachmentMime = o.optString("attachment_mime", "").takeIf { it.isNotBlank() }

      val msgId = o.optString("id", "")
      val createdAt = o.optString("created_at", "")
      val ts = parseIso(createdAt)
      val mine = currentUserId.isNotBlank() && senderId == currentUserId

      val rxJson = o.optJSONArray("reactions")
      val reactions = if (rxJson != null) {
        List(rxJson.length()) { idx ->
          val r = rxJson.getJSONObject(idx)
          ConversationCache.Reaction(
            emoji = r.optString("emoji", ""),
            userId = r.optString("user_id", ""),
          )
        }.filter { it.emoji.isNotBlank() }
      } else emptyList()

      out.add(
        ConversationCache.Msg(
          id = msgId,
          sender = senderName,
          senderId = senderId,
          text = content.ifBlank { fallbackText(o) },
          avatar = avatar,
          ts = ts,
          messageType = mt,
          attachmentUrl = attachmentUrl,
          attachmentMime = attachmentMime,
          reactions = reactions,
          mine = mine,
        ),
      )
    }
    return out
  }

  private fun resolveUrl(origin: String, raw: String): String {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
    return origin + if (raw.startsWith("/")) raw else "/$raw"
  }

  private fun guessMessageType(o: JSONObject): String {
    val mime = o.optString("attachment_mime", "").lowercase()
    return when {
      mime.startsWith("image/") -> "image"
      mime.startsWith("video/") -> "video"
      mime.startsWith("audio/") -> "audio"
      o.optString("attachment_url", "").isNotBlank() -> "file"
      else -> "text"
    }
  }

  private fun fallbackText(o: JSONObject): String {
    val mt = o.optString("message_type", "").lowercase()
    return when {
      mt == "image" -> "🖼️ Hình ảnh"
      mt == "video" -> "🎬 Video"
      mt == "audio" || mt == "voice" -> "🎙️ Ghi âm"
      o.optJSONArray("attachments") != null -> "📎 Tệp đính kèm"
      o.optString("attachment_url", "").isNotBlank() -> "📎 Tệp đính kèm"
      else -> ""
    }
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
