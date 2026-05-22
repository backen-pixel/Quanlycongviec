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
 * Endpoint:
 *  - POST /api/crm/leads/:id/chat              { content, reply_to? }
 *  - POST /api/messenger/groups/:id/chat       { content, reply_to? }
 *  - POST /api/crm/leads/:id/chat/:msgId/react { emoji } → trả { reactions: [...] }
 */
object MessageSender {
  private val executor = Executors.newSingleThreadExecutor()
  private const val PREFS = "crm_floating_bubble_prefs"

  fun sendText(
    ctx: Context,
    bubbleKey: String,
    content: String,
    replyToId: String? = null,
    onDone: (ok: Boolean) -> Unit,
  ) {
    if (content.isBlank()) {
      onDone(false); return
    }
    executor.execute {
      val ok = doSend(ctx, bubbleKey, content, replyToId)
      android.os.Handler(android.os.Looper.getMainLooper()).post { onDone(ok) }
    }
  }

  fun sendReaction(
    ctx: Context,
    leadId: String,
    msgId: String,
    emoji: String,
    onDone: (reactions: List<ConversationCache.Reaction>?) -> Unit,
  ) {
    executor.execute {
      val res = doReaction(ctx, leadId, msgId, emoji)
      onDone(res)
    }
  }

  private fun doSend(
    ctx: Context,
    bubbleKey: String,
    content: String,
    replyToId: String?,
  ): Boolean {
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
      val body = JSONObject().put("content", content).apply {
        if (!replyToId.isNullOrBlank()) put("reply_to", replyToId)
      }.toString()
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      code in 200..299
    } catch (_: Throwable) {
      false
    }
  }

  private fun doReaction(
    ctx: Context,
    leadId: String,
    msgId: String,
    emoji: String,
  ): List<ConversationCache.Reaction>? {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null) ?: return null
    val origin = prefs.getString(FloatingBubbleModule.KEY_API_ORIGIN, null)?.trimEnd('/')
      ?: return null
    val url = "$origin/api/crm/leads/$leadId/chat/$msgId/react"
    return try {
      val conn = URL(url).openConnection() as HttpURLConnection
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
      parseReactionResponse(resp)
    } catch (_: Throwable) {
      null
    }
  }

  private fun parseReactionResponse(body: String): List<ConversationCache.Reaction> {
    return try {
      val o = JSONObject(body)
      val arr = o.optJSONArray("reactions") ?: JSONArray()
      (0 until arr.length()).mapNotNull { i ->
        val r = arr.optJSONObject(i) ?: return@mapNotNull null
        val u = r.optJSONObject("user")
        val emoji = ChatHistoryFetcher.safeStr(r, "emoji")
        if (emoji.isBlank()) return@mapNotNull null
        ConversationCache.Reaction(
          emoji = emoji,
          userId = ChatHistoryFetcher.safeStr(r, "user_id").ifBlank { u?.let { ChatHistoryFetcher.safeStr(it, "id") } ?: "" },
          userName = u?.let { ChatHistoryFetcher.safeStr(it, "full_name") } ?: "",
        )
      }
    } catch (_: Throwable) {
      emptyList()
    }
  }
}
