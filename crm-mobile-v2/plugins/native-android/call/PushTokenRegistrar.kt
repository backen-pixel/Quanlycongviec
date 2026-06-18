package vn.tubeppro.crmobilev2.call

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Đăng ký FCM token lên server (POST /api/push/device-token) từ native. */
object PushTokenRegistrar {
  fun registerAsync(context: Context, fcmToken: String) {
    val token = fcmToken.trim()
    if (token.isBlank()) return
    thread(name = "crm-push-token-reg") {
      registerSync(context, token)
    }
  }

  fun registerSync(context: Context, fcmToken: String): Boolean {
    val token = fcmToken.trim()
    if (token.isBlank()) return false
    val prefs = context.getSharedPreferences("sx_bubble_prefs", Context.MODE_PRIVATE)
    val auth = prefs.getString("auth_token", null)?.trim().orEmpty()
    val origin = prefs.getString("api_origin", null)?.trim().orEmpty().trimEnd('/')
    if (auth.isBlank() || origin.isBlank()) return false
    if (prefs.getString("fcm_token_sent", null) == token) return true

    var conn: HttpURLConnection? = null
    return try {
      conn = (URL("$origin/api/push/device-token").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 10_000
        readTimeout = 10_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Authorization", "Bearer $auth")
      }
      val body = """{"token":"${escapeJson(token)}","platform":"fcm"}"""
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val ok = conn.responseCode in 200..299
      if (ok) prefs.edit().putString("fcm_token_sent", token).apply()
      ok
    } catch (_: Exception) {
      false
    } finally {
      conn?.disconnect()
    }
  }

  private fun escapeJson(s: String): String =
    s.replace("\\", "\\\\").replace("\"", "\\\"")
}
