package vn.tubeppro.vcmobile.call

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Báo server "đã nhận cuộc gọi" qua REST ngay khi bấm nghe — set answeredAt phía server để
 * syncPendingIncomingCalls KHÔNG reo lại dù tiến trình app bị kill/khởi động lại.
 */
object CallAcceptApi {
  fun acceptAsync(context: Context, callId: String, toUserId: String) {
    thread(name = "crm-call-accept") {
      acceptSync(context, callId, toUserId)
    }
  }

  fun acceptSync(context: Context, callId: String, toUserId: String): Boolean {
    val prefs = context.getSharedPreferences("sx_bubble_prefs", Context.MODE_PRIVATE)
    val token = prefs.getString("auth_token", null)?.trim().orEmpty()
    val origin = prefs.getString("api_origin", null)?.trim().orEmpty().trimEnd('/')
    if (token.isBlank() || origin.isBlank() || callId.isBlank() || toUserId.isBlank()) return false

    var conn: HttpURLConnection? = null
    return try {
      val url = URL("$origin/api/push/call-accept")
      conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 8000
        readTimeout = 8000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Authorization", "Bearer $token")
      }
      val body = """{"callId":"${escapeJson(callId)}","toUserId":"${escapeJson(toUserId)}"}"""
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      conn.responseCode in 200..299
    } catch (_: Exception) {
      false
    } finally {
      conn?.disconnect()
    }
  }

  private fun escapeJson(s: String): String =
    s.replace("\\", "\\\\").replace("\"", "\\\"")
}
