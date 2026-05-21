package vn.tubeppro.crmobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Nhận FCM data-only message từ backend (xem sendFcmDataOnly trong pushSender.js)
 * — chạy được kể cả khi app đã bị tắt hoàn toàn.
 *
 * Hai việc chính:
 *  1) Tạo bong bóng overlay (nếu user đã cấp SYSTEM_ALERT_WINDOW)
 *     → gọi [OverlayBubbleService.startWithBubble]
 *  2) Hiện thông báo trên thanh tray (channel CHANNEL_CHAT đã có)
 *
 * Backend gửi dạng:
 *  data: { type, entity_id, entity_type, metadata, title, body, channelId }
 */
class CrmFirebaseMessagingService : FirebaseMessagingService() {

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    // Cache token để JS đọc khi mount.
    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PENDING_FCM_TOKEN, token)
      .apply()
  }

  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message)
    val data = message.data
    if (data.isEmpty()) return
    val type = data["type"] ?: ""
    val entityId = data["entity_id"] ?: ""
    if (entityId.isBlank()) return

    val title = data["title"].orEmpty().ifBlank { "TuBep CRM" }
    val body = data["body"].orEmpty()
    val metaJson = data["metadata"]
    val meta = parseMeta(metaJson)
    val senderName = meta.optString("sender_name", "")
      .ifBlank { meta.optString("sender", "") }
      .ifBlank { "Tin nhắn" }
    val senderAvatar = meta.optString("sender_avatar", "").ifBlank { null }
    val groupName = meta.optString("group_name", "").ifBlank { title }

    val bubbleKey = if (type == "lead_chat") "lead:$entityId" else entityId
    val letter = (groupName.trim().firstOrNull()?.uppercase()) ?: "?"

    // 1) Hiện bong bóng overlay (nếu được phép) + push tin vào cache panel
    val canDrawOverlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      android.provider.Settings.canDrawOverlays(this) else true
    if (canDrawOverlay) {
      OverlayBubbleService.startWithBubble(
        this,
        key = bubbleKey,
        title = groupName,
        letter = letter,
        avatarUrl = senderAvatar,
        sender = senderName,
        message = body,
      )
    }

    // 2) Tray notification (luôn — để user thấy ngay cả khi không có overlay perm)
    postTrayNotification(bubbleKey, title, body, senderName)
  }

  private fun postTrayNotification(bubbleKey: String, title: String, body: String, sender: String) {
    ensureChannel()
    val openIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      action = Intent.ACTION_VIEW
      data = android.net.Uri.parse("crmobile://bubble/$bubbleKey")
      putExtra(BubbleNotifBuilder.EXTRA_BUBBLE_KEY, bubbleKey)
    }
    val pi = PendingIntent.getActivity(
      this,
      bubbleKey.hashCode(),
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val bodyText = if (sender.isNotBlank() && !body.startsWith("$sender:")) "$sender: $body" else body
    val n = NotificationCompat.Builder(this, CHANNEL_CHAT_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(bodyText)
      .setStyle(NotificationCompat.BigTextStyle().bigText(bodyText))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .build()
    try {
      NotificationManagerCompat.from(this).notify(bubbleKey.hashCode(), n)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS chưa cấp → bỏ qua, bubble overlay vẫn còn (nếu có perm)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_CHAT_ID) != null) return
    val ch = NotificationChannel(
      CHANNEL_CHAT_ID,
      "Tin nhắn",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Thông báo tin nhắn Messenger / Lead chat"
      enableLights(true)
      enableVibration(true)
      setShowBadge(true)
    }
    nm.createNotificationChannel(ch)
  }

  private fun parseMeta(raw: String?): org.json.JSONObject {
    if (raw.isNullOrBlank()) return org.json.JSONObject()
    return try {
      org.json.JSONObject(raw)
    } catch (_: Throwable) {
      org.json.JSONObject()
    }
  }

  companion object {
    private const val PREFS = "crm_floating_bubble_prefs"
    internal const val KEY_PENDING_FCM_TOKEN = "pending_fcm_token"
    // Phải khớp channelId backend gửi (pushSender.js → CHANNEL_CHAT)
    private const val CHANNEL_CHAT_ID = "crm_chat"
  }
}
