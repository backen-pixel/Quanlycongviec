package vn.tubeppro.sxmobile.overlay

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
    /** Ảnh đại diện của người gửi (đường dẫn tương đối hoặc URL đầy đủ). */
    val avatarUrl: String? = null,
    /** created_at nguyên văn từ máy chủ — dùng làm mốc `before` khi tải tin cũ hơn (không làm tròn mili giây). */
    val createdAtRaw: String = "",
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
    val avatarUrl: String? = null,
    /** Chat 1-1: mã người kia (để hỏi trạng thái hoạt động). */
    val peerId: String? = null,
  )

  /** Trạng thái hoạt động của một người (POST /users/presence — cùng nguồn với app). */
  data class Presence(val online: Boolean, val lastPingMs: Long)

  fun fetchPresence(ctx: Context, userId: String): Presence? {
    if (userId.isBlank()) return null
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return null
    return try {
      val conn = openJson("$base/users/presence", auth, "POST")
      conn.doOutput = true
      conn.outputStream.use {
        it.write(JSONObject().put("user_ids", JSONArray().put(userId)).toString().toByteArray(Charsets.UTF_8))
      }
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return null
      val p = JSONObject(body).optJSONObject("presence")?.optJSONObject(userId) ?: return Presence(false, 0L)
      Presence(p.optBoolean("online", false), parseIsoTime(p.optString("last_ping_at", "")))
    } catch (e: Exception) {
      android.util.Log.e("SxPanel", "POST /users/presence lỗi: ${e.javaClass.simpleName}")
      null
    }
  }

  /** Một dòng trong trang «Đoạn chat». */
  data class GroupRow(
    val id: String,
    val name: String,
    val preview: String,
    val lastAtMs: Long,
    val unread: Int,
    val isDirect: Boolean,
    val avatarUrl: String? = null,
    /** Chat 1-1: mã người kia (để hỏi trạng thái hoạt động). */
    val peerId: String? = null,
  )

  /** Nhiều người một lần (POST /users/presence). Trả về map mã người → trạng thái; lỗi → map rỗng. */
  fun fetchPresences(ctx: Context, userIds: List<String>): Map<String, Presence> {
    val ids = userIds.filter { it.isNotBlank() }.distinct().take(100)
    if (ids.isEmpty()) return emptyMap()
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return emptyMap()
    return try {
      val conn = openJson("$base/users/presence", auth, "POST")
      conn.doOutput = true
      conn.outputStream.use {
        it.write(JSONObject().put("user_ids", JSONArray(ids)).toString().toByteArray(Charsets.UTF_8))
      }
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return emptyMap()
      val pres = JSONObject(body).optJSONObject("presence") ?: return emptyMap()
      val out = HashMap<String, Presence>()
      for (id in ids) {
        val p = pres.optJSONObject(id)
        out[id] = if (p == null) Presence(false, 0L) else Presence(p.optBoolean("online", false), parseIsoTime(p.optString("last_ping_at", "")))
      }
      out
    } catch (e: Exception) {
      android.util.Log.e("SxPanel", "POST /users/presence (nhiều) lỗi: ${e.javaClass.simpleName}")
      emptyMap()
    }
  }

  /** GET /messenger/groups — danh sách đoạn chat của tôi, mới nhất lên đầu. */
  fun fetchGroups(ctx: Context): List<GroupRow> {
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return emptyList()
    return try {
      val conn = openJson("$base/messenger/groups?_ts=${System.currentTimeMillis()}", auth, "GET")
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return emptyList()
      val arr = JSONArray(body)
      val out = ArrayList<GroupRow>(arr.length())
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val id = o.optString("id", "")
        if (id.isBlank()) continue
        val name = listOf("display_name", "name", "raw_name")
          .map { cleanApiString(o.optString(it, "")).orEmpty() }
          .firstOrNull { it.isNotBlank() } ?: "Chat"
        out.add(
          GroupRow(
            id = id,
            name = name,
            preview = cleanDisplayText(o.optString("last_message", "")),
            lastAtMs = parseIsoTime(o.optString("last_message_at", "")),
            unread = o.optInt("unread_count", 0),
            isDirect = o.optBoolean("is_direct", false),
            avatarUrl = listOf("peer_avatar", "avatar")
              .map { cleanApiString(o.optString(it, "")).orEmpty() }
              .firstOrNull { it.isNotBlank() },
            peerId = if (o.optBoolean("is_direct", false)) cleanApiString(o.optString("peer_id", "")) else null,
          ),
        )
      }
      out.sortedByDescending { it.lastAtMs }
    } catch (_: Exception) {
      emptyList()
    }
  }

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
      val isDirect = o.optBoolean("is_direct", false)
      // Chat 1-1: `name` là «Trò chuyện: A — B»; tên người kia (đã tính biệt danh) nằm ở `display_name`.
      val name = (if (isDirect) cleanApiString(o.optString("display_name", "")).orEmpty() else "")
        .ifBlank { o.optString("name", "").trim() }
        .ifBlank { "Chat" }
      val avatar = listOf("peer_avatar", "avatar", "group_avatar")
        .map { cleanApiString(o.optString(it, "")).orEmpty() }
        .firstOrNull { it.isNotBlank() }
      val peerId = if (isDirect) cleanApiString(o.optString("peer_id", "")) else null
      GroupMeta(name, isDirect, if (isDirect) "Trực tiếp" else "Nhóm chat · realtime", avatar, peerId)
    } catch (e: Exception) {
      android.util.Log.e("SxPanel", "GET /groups/<id> lỗi: ${e.javaClass.simpleName} ${e.message}")
      null
    }
  }

  /** Một thành viên trong trang «Tùy chọn». */
  data class MemberRow(val id: String, val name: String, val avatarUrl: String?, val role: String?)

  /** Chi tiết đoạn chat cho trang «Tùy chọn»: tên, ảnh, loại, danh sách thành viên. */
  data class GroupDetail(
    val name: String,
    val isDirect: Boolean,
    val avatarUrl: String?,
    val members: List<MemberRow>,
  )

  /** GET /messenger/groups/:id — cùng nguồn với app (ChatDetailInfoScreen → fetchMessengerGroupDetail). */
  fun fetchGroupDetail(ctx: Context, groupId: String): GroupDetail? {
    if (groupId.isBlank()) return null
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return null
    return try {
      val conn = openJson("$base/messenger/groups/$groupId?_ts=${System.currentTimeMillis()}", auth, "GET")
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return null
      val o = JSONObject(body)
      val isDirect = o.optBoolean("is_direct", false)
      val avatar = listOf("peer_avatar", "avatar", "group_avatar")
        .map { cleanApiString(o.optString(it, "")).orEmpty() }
        .firstOrNull { it.isNotBlank() }
      val arr = o.optJSONArray("members") ?: JSONArray()
      val members = ArrayList<MemberRow>(arr.length())
      for (i in 0 until arr.length()) {
        val m = arr.optJSONObject(i) ?: continue
        val u = m.optJSONObject("user") ?: JSONObject()
        val id = m.optString("user_id", "").ifBlank { u.optString("id", "") }
        if (id.isBlank()) continue
        val name = listOf("display_name", "group_nickname", "nickname", "full_name", "email")
          .map { cleanApiString(u.optString(it, "")).orEmpty() }
          .firstOrNull { it.isNotBlank() } ?: "Thành viên"
        members.add(
          MemberRow(
            id = id,
            name = name,
            avatarUrl = cleanApiString(u.optString("avatar", "")),
            role = cleanApiString(m.optString("role", "")),
          ),
        )
      }
      GroupDetail(
        name = (if (isDirect) cleanApiString(o.optString("display_name", "")).orEmpty() else "")
          .ifBlank { o.optString("name", "").trim() }
          .ifBlank { "Chat" },
        isDirect = isDirect,
        avatarUrl = avatar,
        members = members,
      )
    } catch (e: Exception) {
      android.util.Log.e("SxPanel", "GET /groups/<id> (tùy chọn) lỗi: ${e.javaClass.simpleName}")
      null
    }
  }

  /** Người dùng có thể thêm vào nhóm (GET /users/activity — cùng nguồn với app). */
  data class UserRow(val id: String, val name: String, val avatarUrl: String?, val online: Boolean = false)

  /** POST /messenger/direct {peer_user_id} — tạo (hoặc lấy) chat 1-1 với một người, như app khi chạm người đang online. onDone(mã đoạn chat hoặc null). */
  fun createDirectChat(ctx: Context, peerUserId: String, onDone: (String?) -> Unit) {
    if (peerUserId.isBlank()) {
      onDone(null)
      return
    }
    val appCtx = ctx.applicationContext
    Thread {
      var id: String? = null
      try {
        val auth = authHeader(appCtx)
        if (auth != null) {
          val conn = openJson("${apiBase(appCtx)}/messenger/direct", auth, "POST")
          conn.doOutput = true
          conn.outputStream.use {
            it.write(JSONObject().put("peer_user_id", peerUserId).toString().toByteArray(Charsets.UTF_8))
          }
          val code = conn.responseCode
          val body = readBody(conn, code in 200..299)
          conn.disconnect()
          if (code in 200..299 && body.isNotBlank()) id = cleanApiString(JSONObject(body).optString("id", ""))
          else android.util.Log.e("SxPanel", "POST /messenger/direct lỗi HTTP $code")
        }
      } catch (e: Exception) {
        android.util.Log.e("SxPanel", "POST /messenger/direct lỗi: ${e.javaClass.simpleName}")
      }
      onDone(id)
    }.start()
  }

  fun fetchUsers(ctx: Context): List<UserRow> {
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return emptyList()
    return try {
      val conn = openJson("$base/users/activity", auth, "GET")
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return emptyList()
      val arr = JSONObject(body).optJSONArray("users") ?: return emptyList()
      val out = ArrayList<UserRow>(arr.length())
      for (i in 0 until arr.length()) {
        val u = arr.optJSONObject(i) ?: continue
        val id = u.optString("id", "")
        if (id.isBlank()) continue
        val name = listOf("full_name", "email")
          .map { cleanApiString(u.optString(it, "")).orEmpty() }
          .firstOrNull { it.isNotBlank() } ?: "Nhân viên"
        out.add(UserRow(id, name, cleanApiString(u.optString("avatar", "")), u.optBoolean("online", false)))
      }
      out
    } catch (e: Exception) {
      android.util.Log.e("SxPanel", "GET /users/activity lỗi: ${e.javaClass.simpleName}")
      emptyList()
    }
  }

  /** Gửi một yêu cầu JSON ở luồng nền; onDone(true) nếu máy chủ trả 2xx. Lỗi chỉ ghi mã HTTP/loại lỗi (không ghi nội dung). */
  private fun sendJsonAsync(ctx: Context, method: String, path: String, json: String, onDone: (Boolean) -> Unit) {
    val appCtx = ctx.applicationContext
    Thread {
      var ok = false
      try {
        val auth = authHeader(appCtx)
        if (auth != null) {
          val conn = openJson("${apiBase(appCtx)}$path", auth, method)
          conn.doOutput = true
          conn.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
          val code = conn.responseCode
          ok = code in 200..299
          readBody(conn, ok)
          conn.disconnect()
          if (!ok) android.util.Log.e("SxPanel", "$method $path lỗi HTTP $code")
        }
      } catch (e: Exception) {
        android.util.Log.e("SxPanel", "$method $path lỗi: ${e.javaClass.simpleName}")
      }
      onDone(ok)
    }.start()
  }

  /** PATCH /messenger/groups/:id {name} — đổi tên nhóm (cùng API với app). */
  fun renameGroup(ctx: Context, groupId: String, name: String, onDone: (Boolean) -> Unit) {
    val trimmed = name.trim()
    if (groupId.isBlank() || trimmed.isEmpty()) {
      onDone(false)
      return
    }
    sendJsonAsync(ctx, "PATCH", "/messenger/groups/$groupId", JSONObject().put("name", trimmed).toString(), onDone)
  }

  /** POST /messenger/groups/:id/members — thêm một thành viên (role member), như app. */
  fun addGroupMember(ctx: Context, groupId: String, userId: String, onDone: (Boolean) -> Unit) {
    if (groupId.isBlank() || userId.isBlank()) {
      onDone(false)
      return
    }
    val body = JSONObject().put(
      "members",
      JSONArray().put(JSONObject().put("user_id", userId).put("role", "member")),
    ).toString()
    sendJsonAsync(ctx, "POST", "/messenger/groups/$groupId/members", body, onDone)
  }

  /** POST /messenger/groups/:id/leave — rời nhóm (chỉ nhóm, không phải chat trực tiếp). Luồng nền; onDone(true) nếu máy chủ trả 2xx. */
  fun leaveGroup(ctx: Context, groupId: String, onDone: (Boolean) -> Unit) {
    if (groupId.isBlank()) {
      onDone(false)
      return
    }
    val appCtx = ctx.applicationContext
    Thread {
      var ok = false
      try {
        val auth = authHeader(appCtx)
        if (auth != null) {
          val conn = openJson("${apiBase(appCtx)}/messenger/groups/$groupId/leave", auth, "POST")
          conn.doOutput = true
          conn.outputStream.use { it.write("{}".toByteArray()) }
          val code = conn.responseCode
          ok = code in 200..299
          readBody(conn, ok)
          conn.disconnect()
          if (!ok) android.util.Log.e("SxPanel", "POST /leave lỗi HTTP $code")
        }
      } catch (e: Exception) {
        android.util.Log.e("SxPanel", "POST /leave lỗi: ${e.javaClass.simpleName}")
      }
      onDone(ok)
    }.start()
  }

  fun fetchMessages(ctx: Context, groupId: String): List<ChatMessage> {
    if (groupId.isBlank()) return emptyList()
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return emptyList()
    val myId = myUserId(ctx)
    return try {
      val conn = openJson("$base/messenger/groups/$groupId/chat?limit=60", auth, "GET")
      val code = conn.responseCode
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299 || body.isBlank()) return emptyList()
      parseMessages(JSONArray(body), myId).takeLast(60)
    } catch (e: Exception) {
      android.util.Log.e("SxPanel", "GET /chat lỗi: ${e.javaClass.simpleName} ${e.message}")
      emptyList()
    }
  }

  /** Một trang tin CŨ HƠN: [rows] tăng dần theo thời gian; [hasMore] = còn tin cũ hơn nữa (header X-Has-More). */
  data class OlderPage(val rows: List<ChatMessage>, val hasMore: Boolean)

  /**
   * GET /messenger/groups/:id/chat?limit=40&before=<created_at của tin cũ nhất đang có>. Trả null khi lỗi (để thử lại sau),
   * khác với trang rỗng (hết tin).
   */
  fun fetchOlderMessages(ctx: Context, groupId: String, beforeRaw: String): OlderPage? {
    if (groupId.isBlank() || beforeRaw.isBlank()) return null
    val base = apiBase(ctx)
    val auth = authHeader(ctx) ?: return null
    val myId = myUserId(ctx)
    return try {
      val before = java.net.URLEncoder.encode(beforeRaw, "UTF-8")
      val conn = openJson("$base/messenger/groups/$groupId/chat?limit=40&before=$before", auth, "GET")
      val code = conn.responseCode
      val hasMoreHeader = conn.getHeaderField("X-Has-More")
      val body = readBody(conn, code in 200..299)
      conn.disconnect()
      if (code !in 200..299) {
        android.util.Log.e("SxPanel", "GET /chat (tin cũ) lỗi HTTP $code")
        return null
      }
      val rows = if (body.isBlank()) emptyList() else parseMessages(JSONArray(body), myId)
      OlderPage(rows, hasMoreHeader == "1" || (hasMoreHeader == null && rows.size >= 40))
    } catch (e: Exception) {
      android.util.Log.e("SxPanel", "GET /chat (tin cũ) lỗi: ${e.javaClass.simpleName}")
      null
    }
  }

  /** Avatar tương đối («/uploads/…») → URL đầy đủ theo máy chủ API; rỗng nếu không có. */
  fun resolveAvatarUrl(ctx: Context, raw: String?): String {
    val s = cleanApiString(raw) ?: return ""
    if (s.startsWith("http://", ignoreCase = true) || s.startsWith("https://", ignoreCase = true)) return s
    val origin = prefs(ctx).getString("api_origin", null)?.trim()?.trimEnd('/').orEmpty()
    if (origin.isBlank()) return ""
    return origin + (if (s.startsWith("/")) s else "/$s")
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

  /**
   * PATCH /messenger/groups/:id/read — luôn chạy ở luồng nền (gọi mạng trên luồng chính bị Android chặn bằng
   * NetworkOnMainThreadException; trước đây lỗi đó bị nuốt nên máy chủ không bao giờ ghi nhận «đã đọc»).
   * [onDone] được gọi ở luồng nền với kết quả thật (true = máy chủ trả 2xx).
   */
  fun markRead(ctx: Context, groupId: String, onDone: ((Boolean) -> Unit)? = null) {
    if (groupId.isBlank()) {
      onDone?.invoke(false)
      return
    }
    val appCtx = ctx.applicationContext
    Thread {
      var ok = false
      try {
        val base = apiBase(appCtx)
        val auth = authHeader(appCtx)
        if (auth != null) {
          val conn = openJson("$base/messenger/groups/$groupId/read", auth, "PATCH")
          val code = conn.responseCode
          ok = code in 200..299
          readBody(conn, ok)
          conn.disconnect()
          if (!ok) android.util.Log.e("SxPanel", "PATCH /read lỗi HTTP $code")
        }
      } catch (e: Exception) {
        android.util.Log.e("SxPanel", "PATCH /read lỗi: ${e.javaClass.simpleName}")
      }
      try { onDone?.invoke(ok) } catch (_: Exception) { }
    }.start()
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
      avatarUrl = cleanApiString(o.optJSONObject("user")?.optString("avatar", ""))
        ?: cleanApiString(o.optString("sender_avatar", "")),
      createdAtRaw = o.optString("created_at", ""),
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
