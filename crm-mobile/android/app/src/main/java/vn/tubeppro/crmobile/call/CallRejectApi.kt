package vn.tubeppro.crmobile.call

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Từ chối cuộc gọi qua REST khi app chưa mở (không có socket). */
object CallRejectApi {
  fun rejectAsync(context: Context, callId: String, toUserId: String) {
    thread(name = "crm-call-reject") {
      rejectSync(context, callId, toUserId)
    }
  }

  fun rejectSync(context: Context, callId: String, toUserId: String): Boolean {
    val prefs = context.getSharedPreferences("crm_bubble_prefs", Context.MODE_PRIVATE)
    val token = prefs.getString("auth_token", null)?.trim().orEmpty()
    val origin = prefs.getString("api_origin", null)?.trim().orEmpty().trimEnd('/')
    if (token.isBlank() || origin.isBlank() || callId.isBlank() || toUserId.isBlank()) return false

    var conn: HttpURLConnection? = null
    return try {
      val url = URL("$origin/api/push/call-reject")
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
