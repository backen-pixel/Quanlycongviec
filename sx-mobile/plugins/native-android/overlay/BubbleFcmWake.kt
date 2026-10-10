package vn.tubeppro.sxmobile.overlay

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

/**
 * FCM data-only (bubble_wake) → hiện bong bóng ngay cả khi app chưa mở JS.
 */
object BubbleFcmWake {
  private const val PREF_API_ORIGIN = "api_origin"

  fun saveApiOrigin(ctx: Context, origin: String) {
    if (origin.isBlank()) return
    ctx.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(PREF_API_ORIGIN, origin.trim().trimEnd('/'))
      .apply()
  }

  fun handle(ctx: Context, data: Map<String, String>) {
    if (data["bubble_wake"] != "1") return
    if (data["type"] != "messenger_chat") return
    if (!Settings.canDrawOverlays(ctx)) return

    val groupId = resolveGroupId(data)
    if (groupId.isBlank()) return
    // Một thông báo đẩy có thể bị gọi 2 lần liền nhau (handleIntent rồi onMessageReceived): chỉ xử lý một lần.
    if (alreadyHandled(data, groupId)) return

    val title = data["title"]?.trim().orEmpty().ifBlank { "Tin nhắn" }
    val sender = data["sender_name"]?.trim().orEmpty().ifBlank { title }
    val message = data["message"]?.trim().orEmpty().ifBlank { "Có tin nhắn mới" }
    val avatarRaw = data["sender_avatar"]?.trim().orEmpty()
    val avatarUrl = absolutize(ctx, avatarRaw)
    val letter = sender.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val messageId = data["message_id"]?.trim().orEmpty()

    OverlayBubbleService.start(ctx)
    val show = Intent(ctx, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_SHOW_BUBBLE
      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, groupId)
      putExtra(OverlayBubbleService.EXTRA_TITLE, title)
      putExtra(OverlayBubbleService.EXTRA_LETTER, letter)
      putExtra(OverlayBubbleService.EXTRA_AVATAR_URL, avatarUrl)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(show)
    else ctx.startService(show)

    val peek = Intent(ctx, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_SHOW_PEEK
      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, groupId)
      if (messageId.isNotBlank()) putExtra(OverlayBubbleService.EXTRA_MESSAGE_ID, messageId)
      putExtra(OverlayBubbleService.EXTRA_SENDER, sender)
      putExtra(OverlayBubbleService.EXTRA_MESSAGE, message)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(peek)
    else ctx.startService(peek)
  }

  /** Tin vừa xử lý (khoá → thời điểm). FCM có thể gọi từ nhiều luồng nên đồng bộ hoá. */
  private val recentWakes = LinkedHashMap<String, Long>()

  /** true nếu tin này vừa được xử lý: so theo message_id (nhớ 2 phút); không có mã thì theo nhóm+người gửi+nội dung trong 5 giây. */
  @Synchronized
  private fun alreadyHandled(data: Map<String, String>, groupId: String): Boolean {
    val now = System.currentTimeMillis()
    val it = recentWakes.entries.iterator()
    while (it.hasNext()) if (now - it.next().value > 120_000L) it.remove()
    val id = data["message_id"]?.trim().orEmpty()
    val key = if (id.isNotBlank()) "id:$id" else "t:$groupId|${data["sender_name"].orEmpty()}|${data["message"].orEmpty()}"
    val ttl = if (id.isNotBlank()) 120_000L else 5_000L
    val last = recentWakes[key]
    if (last != null && now - last < ttl) return true
    recentWakes[key] = now
    return false
  }

  private fun resolveGroupId(data: Map<String, String>): String {
    val entityId = data["entity_id"]?.trim().orEmpty()
    if (entityId.isNotBlank()) return entityId
    val bubbleKey = data["bubble_key"]?.trim().orEmpty()
    if (bubbleKey.isBlank()) return ""
    val colon = bubbleKey.indexOf(':')
    return if (colon >= 0 && colon < bubbleKey.length - 1) {
      bubbleKey.substring(colon + 1).trim()
    } else {
      bubbleKey
    }
  }

  private fun absolutize(ctx: Context, raw: String): String {
    if (raw.isBlank()) return ""
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
    val base = ctx.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .getString(PREF_API_ORIGIN, null)
      ?.trim()
      ?.trimEnd('/')
      .orEmpty()
    if (base.isBlank()) return raw
    return "$base/${raw.trimStart('/')}"
  }
}
