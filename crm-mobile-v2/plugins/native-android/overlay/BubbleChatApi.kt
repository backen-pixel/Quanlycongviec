package vn.tubeppro.crmobilev2.overlay

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/** Gọi REST messenger từ overlay (không cần mở React Native). */
object BubbleChatApi {
  data class ChatMessage(
    val id: String,
    val userId: String,
    val sender: String,
    val text: String,
    val isMine: Boolean,
  )

  private fun prefs(ctx: Context) =
    ctx.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)

  private fun apiBase(ctx: Context): String {
    val origin = prefs(ctx).getString("api_origin", null)?.trim()?.trimEnd('/') ?: return ""
    return if (origin.isBlank()) "" else "$origin/api"
  }

  private fun authHeader(ctx: Context): String? {
    val token = prefs(ctx).getString("auth_token", null)?.trim().orEmpty()
    return if (token.isBlank()) null else "Bearer $token"
  }

  private fun myUserId(ctx: Context): String =
    prefs(ctx).getString("user_id", null)?.trim().orEmpty()

  fun fetchMessages(ctx: Context, groupId: String): List<ChatMessage> {
    if (groupId.isBlank()) return emptyList()
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return emptyList()
    val myId = myUserId(ctx)
    return try {
      val conn = openJson("$base/messenger/groups/$groupId/chat", auth, "GET")
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return emptyList()
      parseMessages(JSONArray(body), myId).takeLast(60)
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun sendMessage(ctx: Context, groupId: String, content: String): Boolean {
    if (groupId.isBlank() || content.isBlank()) return false
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return false
    return try {
      val payload = JSONObject().put("content", content).toString()
      val conn = openJson("$base/messenger/groups/$groupId/chat", auth, "POST")
      conn.doOutput = true
      OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(payload) }
      val ok = conn.responseCode in 200..299
      readBody(conn, ok)
      conn.disconnect()
      ok
    } catch (_: Exception) {
      false
    }
  }

  fun markRead(ctx: Context, groupId: String) {
    if (groupId.isBlank()) return
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return
    try {
      val conn = openJson("$base/messenger/groups/$groupId/read", auth, "PATCH")
      readBody(conn, conn.responseCode in 200..299)
      conn.disconnect()
    } catch (_: Exception) { }
  }

  fun parseMessagesFromSeed(json: String, myUserId: String): List<ChatMessage> {
    if (json.isBlank()) return emptyList()
    return try {
      parseMessages(JSONArray(json), myUserId)
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun parseMessages(arr: JSONArray, myUserId: String): List<ChatMessage> {
    val out = ArrayList<ChatMessage>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val id = o.optString("id", "")
      val userId = when {
        o.has("user_id") -> o.optString("user_id", "")
        else -> o.optJSONObject("user")?.optString("id", "") ?: ""
      }
      val sender = when {
        o.optBoolean("is_system", false) -> "Hệ thống"
        o.has("sender") -> o.optString("sender", "Người dùng")
        else -> o.optJSONObject("user")?.optString("full_name", "Người dùng") ?: "Người dùng"
      }
      val text = previewText(o)
      if (text.isBlank() && id.isBlank()) continue
      out.add(
        ChatMessage(
          id = id,
          userId = userId,
          sender = sender,
          text = text.ifBlank { "…" },
          isMine = myUserId.isNotBlank() && userId == myUserId,
        ),
      )
    }
    return out
  }

  private fun previewText(o: JSONObject): String {
    val type = o.optString("message_type", o.optString("messageType", ""))
    val content = o.optString("content", o.optString("text", "")).trim()
    return when {
      content.isNotBlank() -> content
      type.contains("image", true) -> "📷 Hình ảnh"
      type.contains("file", true) || type.contains("document", true) -> "📎 Tệp đính kèm"
      type.contains("sticker", true) -> "Sticker"
      o.optString("attachment_url", "").isNotBlank() -> "📎 Đính kèm"
      else -> ""
    }
  }

  private fun openJson(url: String, auth: String, method: String): HttpURLConnection {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = 12000
      readTimeout = 12000
      setRequestProperty("Accept", "application/json")
      setRequestProperty("Content-Type", "application/json; charset=utf-8")
      setRequestProperty("Authorization", auth)
    }
    return conn
  }

  private fun readBody(conn: HttpURLConnection, success: Boolean): String {
    val stream = if (success) conn.inputStream else conn.errorStream
    if (stream == null) return ""
    return BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
  }
}
