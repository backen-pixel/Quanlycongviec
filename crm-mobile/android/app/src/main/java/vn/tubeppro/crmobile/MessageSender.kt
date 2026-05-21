package vn.tubeppro.crmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Gửi tin nhắn / reaction từ overlay native, không cần React.
 *
 * Bubble key:
 *  - lead chat:       "lead:<leadId>"
 *  - messenger group: "<groupId>"
 */
object MessageSender {
  private val executor = Executors.newSingleThreadExecutor()
  private const val PREFS = "crm_floating_bubble_prefs"

  fun sendText(ctx: Context, bubbleKey: String, content: String, onDone: (ok: Boolean) -> Unit) {
    if (content.isBlank()) {
      onDone(false); return
    }
    executor.execute {
      val ok = doSendText(ctx, bubbleKey, content)
      android.os.Handler(android.os.Looper.getMainLooper()).post { onDone(ok) }
    }
  }

  /** Toggle 1 emoji reaction trên message — trả về list reactions mới (hoặc null nếu lỗi). */
  fun react(
    ctx: Context,
    bubbleKey: String,
    messageId: String,
    emoji: String,
    onDone: (reactions: List<ConversationCache.Reaction>?) -> Unit,
  ) {
    if (messageId.isBlank() || emoji.isBlank()) {
      onDone(null); return
    }
    executor.execute {
      val rx = doReact(ctx, bubbleKey, messageId, emoji)
      android.os.Handler(android.os.Looper.getMainLooper()).post { onDone(rx) }
    }
  }

  private fun doSendText(ctx: Context, bubbleKey: String, content: String): Boolean {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null) ?: return false
    val origin = prefs.getString(FloatingBubbleModule.KEY_API_ORIGIN, null)?.trimEnd('/')
      ?: return false

    val path = if (bubbleKey.startsWith("lead:")) {
      "/api/crm/leads/${bubbleKey.removePrefix("lead:")}/chat"
    } else {
      "/api/messenger/groups/$bubbleKey/chat"
    }

    return try {
      val conn = URL("$origin$path").openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.connectTimeout = 10000
      conn.readTimeout = 15000
      conn.doOutput = true
      conn.setRequestProperty("Authorization", "Bearer $token")
      conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      conn.setRequestProperty("Accept", "application/json")
      val body = JSONObject().put("content", content).toString()
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      code in 200..299
    } catch (_: Throwable) {
      false
    }
  }

  private fun doReact(
    ctx: Context,
    bubbleKey: String,
    messageId: String,
    emoji: String,
  ): List<ConversationCache.Reaction>? {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null) ?: return null
    val origin = prefs.getString(FloatingBubbleModule.KEY_API_ORIGIN, null)?.trimEnd('/')
      ?: return null

    val path = if (bubbleKey.startsWith("lead:")) {
      "/api/crm/leads/${bubbleKey.removePrefix("lead:")}/chat/$messageId/react"
    } else {
      "/api/messenger/groups/$bubbleKey/chat/$messageId/react"
    }

    return try {
      val conn = URL("$origin$path").openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.connectTimeout = 10000
      conn.readTimeout = 12000
      conn.doOutput = true
      conn.setRequestProperty("Authorization", "Bearer $token")
      conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      conn.setRequestProperty("Accept", "application/json")
      val body = JSONObject().put("emoji", emoji).toString()
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      if (code !in 200..299) return null
      val resp = conn.inputStream.bufferedReader().use { it.readText() }
      val json = JSONObject(resp)
      val arr = json.optJSONArray("reactions") ?: JSONArray()
      List(arr.length()) { i ->
        val r = arr.getJSONObject(i)
        ConversationCache.Reaction(
          emoji = r.optString("emoji", ""),
          userId = r.optString("user_id", ""),
        )
      }.filter { it.emoji.isNotBlank() }
    } catch (_: Throwable) {
      null
    }
  }
}
