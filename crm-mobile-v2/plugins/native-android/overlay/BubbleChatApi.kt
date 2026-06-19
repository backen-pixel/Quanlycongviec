package vn.tubeppro.crmobilev2.overlay

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale

/** Gọi REST messenger từ overlay (không cần mở React Native). */
object BubbleChatApi {
  data class ReactionGroup(val emoji: String, val count: Int, val mine: Boolean)

  data class ChatMessage(
    val id: String,
    val userId: String,
    val sender: String,
    val text: String,
    val isMine: Boolean,
    val createdAtMs: Long = 0L,
    val messageType: String = "text",
    val attachmentUrl: String? = null,
    val replyToId: String? = null,
    val replySender: String? = null,
    val replyPreview: String? = null,
    val reactions: List<ReactionGroup> = emptyList(),
  )

  data class PendingFile(val uri: Uri, val name: String, val mime: String)

  data class GroupMeta(
    val name: String,
    val isDirect: Boolean,
    val statusLabel: String,
  )

  fun fetchGroupMeta(ctx: Context, groupId: String): GroupMeta? {
    if (groupId.isBlank()) return null
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return null
    return try {
      val conn = openJson("$base/messenger/groups/$groupId", auth, "GET")
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return null
      val o = JSONObject(body)
      val name = o.optString("name", "").trim().ifBlank { "Chat" }
      val isDirect = o.optBoolean("is_direct", false)
      GroupMeta(name, isDirect, if (isDirect) "Trực tiếp" else "Nhóm chat · realtime")
    } catch (_: Exception) {
      null
    }
  }

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

  fun sendMessage(ctx: Context, groupId: String, content: String, replyTo: String? = null): Boolean {
    if (groupId.isBlank() || content.isBlank()) return false
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return false
    return try {
      val payload = JSONObject().put("content", content)
      if (!replyTo.isNullOrBlank()) payload.put("reply_to", replyTo)
      val conn = openJson("$base/messenger/groups/$groupId/chat", auth, "POST")
      conn.doOutput = true
      OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(payload.toString()) }
      val ok = conn.responseCode in 200..299
      readBody(conn, ok)
      conn.disconnect()
      ok
    } catch (_: Exception) {
      false
    }
  }

  fun toggleReaction(ctx: Context, groupId: String, messageId: String, emoji: String): List<ReactionGroup>? {
    if (groupId.isBlank() || messageId.isBlank() || emoji.isBlank()) return null
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return null
    val myId = myUserId(ctx)
    return try {
      val payload = JSONObject().put("emoji", emoji).toString()
      val conn = openJson("$base/messenger/groups/$groupId/chat/$messageId/reaction", auth, "POST")
      conn.doOutput = true
      OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(payload) }
      val ok = conn.responseCode in 200..299
      val body = readBody(conn, ok)
      conn.disconnect()
      if (!ok || body.isBlank()) return null
      val o = JSONObject(body)
      parseReactions(o.optJSONArray("reactions"), myId)
    } catch (_: Exception) {
      null
    }
  }

  fun uploadWithFiles(
    ctx: Context,
    groupId: String,
    files: List<PendingFile>,
    content: String?,
    replyTo: String?,
  ): Boolean {
    if (groupId.isBlank() || files.isEmpty()) return false
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return false
    val boundary = "----Bubble${System.currentTimeMillis()}"
    return try {
      val conn = (URL("$base/messenger/groups/$groupId/chat").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 120000
        readTimeout = 120000
        doOutput = true
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Authorization", auth)
        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      }
      conn.outputStream.use { out ->
        fun field(name: String, value: String) {
          out.write("--$boundary\r\n".toByteArray())
          out.write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n".toByteArray())
          out.write(value.toByteArray())
          out.write("\r\n".toByteArray())
        }
        field("content", content?.trim().orEmpty())
        if (!replyTo.isNullOrBlank()) field("reply_to", replyTo)
        val cr = ctx.contentResolver
        for ((idx, f) in files.withIndex()) {
          val bytes = cr.openInputStream(f.uri)?.use { it.readBytes() } ?: continue
          val safeName = f.name.ifBlank { "file_$idx" }
          val mime = f.mime.ifBlank { "application/octet-stream" }
          out.write("--$boundary\r\n".toByteArray())
          out.write(
            "Content-Disposition: form-data; name=\"files\"; filename=\"$safeName\"\r\n".toByteArray(),
          )
          out.write("Content-Type: $mime\r\n\r\n".toByteArray())
          out.write(bytes)
          out.write("\r\n".toByteArray())
        }
        out.write("--$boundary--\r\n".toByteArray())
      }
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
      out.add(parseMessageRow(o, myUserId))
    }
    return out
  }

  private fun parseMessageRow(o: JSONObject, myUserId: String): ChatMessage {
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
    val msgType = o.optString("message_type", o.optString("messageType", "text"))
    val attachmentUrl = resolveAttachmentUrl(o)
    val replyParent = o.optJSONObject("reply_to_message")
    val replyToId = o.optString("reply_to", "").trim().ifBlank { null }
    val replySender = replyParent?.let { senderName(it) }
    val replyPreview = replyParent?.let { previewText(it) }
    val text = previewText(o)
    return ChatMessage(
      id = id,
      userId = userId,
      sender = sender,
      text = text.ifBlank { "…" },
      isMine = myUserId.isNotBlank() && userId == myUserId,
      createdAtMs = o.optLong("ts", 0L).takeIf { it > 0 }
        ?: parseIsoTime(o.optString("created_at", "")),
      messageType = msgType,
      attachmentUrl = attachmentUrl,
      replyToId = replyToId,
      replySender = replySender,
      replyPreview = replyPreview,
      reactions = parseReactions(o.optJSONArray("reactions"), myUserId),
    )
  }

  private fun parseReactions(arr: JSONArray?, myUserId: String): List<ReactionGroup> {
    if (arr == null || arr.length() == 0) return emptyList()
    val map = LinkedHashMap<String, Pair<Int, Boolean>>()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val emoji = o.optString("emoji", o.optString("reaction", "")).trim()
      if (emoji.isBlank()) continue
      val uid = o.optString("user_id", "")
      val prev = map[emoji] ?: (0 to false)
      map[emoji] = (prev.first + 1) to (prev.second || (myUserId.isNotBlank() && uid == myUserId))
    }
    return map.map { ReactionGroup(it.key, it.value.first, it.value.second) }
  }

  private fun resolveAttachmentUrl(o: JSONObject): String? {
    val direct = o.optString("attachment_url", "").trim()
    if (direct.isNotBlank()) return direct
    val att = o.optJSONArray("attachments")
    if (att != null && att.length() > 0) {
      val u = att.optJSONObject(0)?.optString("url", "")?.trim()
      if (!u.isNullOrBlank()) return u
    }
    return null
  }

  private fun senderName(o: JSONObject): String {
    return when {
      o.has("sender") -> o.optString("sender", "Người dùng")
      else -> o.optJSONObject("user")?.optString("full_name", "Người dùng") ?: "Người dùng"
    }
  }

  private fun previewText(o: JSONObject): String {
    val type = o.optString("message_type", o.optString("messageType", ""))
    val content = o.optString("content", o.optString("text", "")).trim()
    return when {
      content.isNotBlank() -> content
      type.contains("image", true) -> "📷 Hình ảnh"
      type.contains("video", true) -> "🎬 Video"
      type.contains("file", true) || type.contains("document", true) -> "📎 Tệp đính kèm"
      type.contains("sticker", true) -> "Sticker"
      o.optString("attachment_url", "").isNotBlank() -> "📎 Đính kèm"
      else -> ""
    }
  }

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

  private fun parseIsoTime(raw: String): Long {
    if (raw.isBlank()) return 0L
    val patterns = arrayOf(
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
      "yyyy-MM-dd'T'HH:mm:ss'Z'",
      "yyyy-MM-dd'T'HH:mm:ss",
    )
    for (p in patterns) {
      try {
        val sdf = SimpleDateFormat(p, Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return sdf.parse(raw)?.time ?: continue
      } catch (_: Exception) { }
    }
    return 0L
  }

  private fun openJson(url: String, auth: String, method: String): HttpURLConnection {
    return (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = 12000
      readTimeout = 12000
      setRequestProperty("Accept", "application/json")
      setRequestProperty("Content-Type", "application/json; charset=utf-8")
      setRequestProperty("Authorization", auth)
    }
  }

  private fun readBody(conn: HttpURLConnection, success: Boolean): String {
    val stream = if (success) conn.inputStream else conn.errorStream
    if (stream == null) return ""
    return BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
  }
}
