package vn.tubeppro.crmobilev2.overlay

import android.content.Context
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale

/** Gọi REST messenger từ overlay (không cần mở React Native). */
object BubbleChatApi {
  data class ReactionGroup(val emoji: String, val count: Int, val mine: Boolean)

  data class MediaAttachment(
    val url: String,
    val mime: String? = null,
    val name: String? = null,
  )

  data class ChatMessage(
    val id: String,
    val userId: String,
    val sender: String,
    val text: String,
    val isMine: Boolean,
    val createdAtMs: Long = 0L,
    val messageType: String = "text",
    val attachmentUrl: String? = null,
    val attachmentMime: String? = null,
    val attachmentName: String? = null,
    val attachments: List<MediaAttachment> = emptyList(),
    val replyToId: String? = null,
    val replySender: String? = null,
    val replyPreview: String? = null,
    val reactions: List<ReactionGroup> = emptyList(),
  ) {
    fun allAttachments(): List<MediaAttachment> {
      if (attachments.isNotEmpty()) return attachments
      val url = attachmentUrl?.trim().orEmpty()
      if (url.isBlank()) return emptyList()
      return listOf(MediaAttachment(url, attachmentMime, attachmentName))
    }
  }

  data class PendingFile(
    val cachePath: String,
    val name: String,
    val mime: String,
  ) {
    fun readBytes(): ByteArray? {
      val file = File(cachePath)
      if (!file.exists() || file.length() <= 0L) return null
      return try {
        file.readBytes()
      } catch (_: Exception) {
        null
      }
    }

    fun normalizedMime(): String = normalizeMime(mime, name)

    fun isImage(): Boolean = normalizedMime().startsWith("image/")

    fun isVideo(): Boolean = normalizedMime().startsWith("video/")
  }

  fun normalizeMime(mime: String, name: String): String {
    val m = mime.trim().lowercase()
    if (m.startsWith("image/") || m.startsWith("video/") || m.startsWith("audio/")) return m
    val ext = name.substringAfterLast('.', "").lowercase()
    val fromExt = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
    if (!fromExt.isNullOrBlank()) return fromExt
    return when (ext) {
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "gif" -> "image/gif"
      "webp" -> "image/webp"
      "heic", "heif" -> "image/heic"
      "mp4" -> "video/mp4"
      "mov" -> "video/quicktime"
      "webm" -> "video/webm"
      else -> if (m.isBlank()) "application/octet-stream" else m
    }
  }

  fun pendingFileFromCache(file: File, name: String, mime: String): PendingFile {
    return PendingFile(file.absolutePath, name, normalizeMime(mime, name))
  }

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

  private fun cleanApiString(raw: String?): String? {
    val t = raw?.trim().orEmpty()
    if (t.isBlank() || t.equals("null", ignoreCase = true) || t.equals("undefined", ignoreCase = true)) {
      return null
    }
    return t
  }

  fun cleanDisplayText(raw: String?): String {
    return cleanApiString(raw) ?: ""
  }

  fun sendMessage(ctx: Context, groupId: String, content: String, replyTo: String? = null): Boolean {
    if (groupId.isBlank()) return false
    val body = cleanApiString(content) ?: return false
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return false
    return try {
      val payload = JSONObject().put("content", body)
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
        cleanApiString(content)?.let { field("content", it) }
        cleanApiString(replyTo)?.let { field("reply_to", it) }
        var uploadedCount = 0
        for ((idx, f) in files.withIndex()) {
          val bytes = f.readBytes() ?: continue
          if (bytes.isEmpty()) continue
          uploadedCount++
          val safeName = f.name.ifBlank { "file_$idx" }
          val mime = f.normalizedMime()
          out.write("--$boundary\r\n".toByteArray())
          out.write(
            "Content-Disposition: form-data; name=\"files\"; filename=\"$safeName\"\r\n".toByteArray(),
          )
          out.write("Content-Type: $mime\r\n\r\n".toByteArray())
          out.write(bytes)
          out.write("\r\n".toByteArray())
        }
        if (uploadedCount == 0) return false
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
    val msgTypeRaw = o.optString("message_type", o.optString("messageType", "text"))
    val attachments = resolveAttachments(o)
    val primary = attachments.firstOrNull()
    val attachmentUrl = primary?.url
    val attachmentMime = primary?.mime
    val attachmentName = primary?.name
    val msgType = inferMessageType(msgTypeRaw, attachmentMime, attachmentUrl, attachmentName, attachments)
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
      attachmentMime = attachmentMime,
      attachmentName = attachmentName,
      attachments = attachments,
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

  private fun resolveAttachments(o: JSONObject): List<MediaAttachment> {
    val out = ArrayList<MediaAttachment>()
    val att = o.optJSONArray("attachments")
    if (att != null && att.length() > 0) {
      for (i in 0 until att.length()) {
        val item = att.optJSONObject(i) ?: continue
        val url = cleanApiString(item.optString("url", "")) ?: continue
        out.add(
          MediaAttachment(
            url,
            cleanApiString(item.optString("type", item.optString("mime", ""))),
            cleanApiString(item.optString("name", "")),
          ),
        )
      }
      if (out.isNotEmpty()) return out
    }
    val directUrl = cleanApiString(o.optString("attachment_url", ""))
    if (directUrl != null) {
      out.add(
        MediaAttachment(
          directUrl,
          cleanApiString(o.optString("attachment_mime", "")),
          cleanApiString(o.optString("attachment_name", "")),
        ),
      )
    }
    return out
  }

  private fun inferMessageType(
    raw: String,
    mime: String?,
    url: String?,
    name: String?,
    attachments: List<MediaAttachment> = emptyList(),
  ): String {
    if (raw.isNotBlank() && !raw.equals("text", ignoreCase = true)) return raw
    if (attachments.size > 1) {
      val types = attachments.map { inferSingleAttachmentType(it.mime, it.url, it.name) }
      if (types.all { it == "image" }) return "image"
      if (types.all { it == "video" }) return "video"
      return types.firstOrNull { it != "text" } ?: "file"
    }
    return inferSingleAttachmentType(mime, url, name).let { t ->
      if (t != "text") t else raw.ifBlank { "text" }
    }
  }

  private fun inferSingleAttachmentType(mime: String?, url: String?, name: String?): String {
    val m = mime?.lowercase().orEmpty()
    val n = name?.lowercase().orEmpty()
    val u = url?.lowercase().orEmpty()
    return when {
      m.startsWith("image/") || IMAGE_EXT.matches(u) || IMAGE_EXT.matches(n) -> "image"
      m.startsWith("video/") || VIDEO_EXT.matches(u) || VIDEO_EXT.matches(n) -> "video"
      m.startsWith("audio/") -> "audio"
      !u.isBlank() -> "file"
      else -> "text"
    }
  }

  private val IMAGE_EXT = Regex("\\.(jpe?g|png|gif|webp|bmp|heic|avif)(\\?|$)", RegexOption.IGNORE_CASE)
  private val VIDEO_EXT = Regex("\\.(mp4|mov|webm|mkv|avi)(\\?|$)", RegexOption.IGNORE_CASE)

  /** @deprecated dùng resolveAttachments */
  private fun resolveAttachmentUrl(o: JSONObject): String? = resolveAttachments(o).firstOrNull()?.url

  private fun senderName(o: JSONObject): String {
    return when {
      o.has("sender") -> o.optString("sender", "Người dùng")
      else -> o.optJSONObject("user")?.optString("full_name", "Người dùng") ?: "Người dùng"
    }
  }

  private fun previewText(o: JSONObject): String {
    val type = o.optString("message_type", o.optString("messageType", ""))
    val content = cleanApiString(o.optString("content", o.optString("text", ""))) ?: ""
    return when {
      content.isNotBlank() -> content
      type.contains("image", true) -> "📷 Hình ảnh"
      type.contains("video", true) -> "🎬 Video"
      type.contains("file", true) || type.contains("document", true) -> "📎 Tệp đính kèm"
      type.contains("sticker", true) -> "Sticker"
      cleanApiString(o.optString("attachment_url", "")) != null -> "📎 Tệp đính kèm"
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
