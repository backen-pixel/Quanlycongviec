package vn.tubeppro.crmobile.overlay

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import vn.tubeppro.crmobile.MainActivity

class FloatingBubbleOverlayModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FloatingBubbleOverlay"

  private val prefs by lazy {
    reactContext.getSharedPreferences("crm_bubble_prefs", Context.MODE_PRIVATE)
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    promise.resolve(OverlayBubbleManager.canDraw(reactContext))
  }

  @ReactMethod
  fun openOverlaySettings() {
    OverlayBubbleManager.openOverlaySettings(reactContext)
  }

  @ReactMethod
  fun startOverlay(promise: Promise) {
    promise.resolve(OverlayBubbleManager.canDraw(reactContext))
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    OverlayBubbleManager.stopAll()
    promise.resolve(true)
  }

  @ReactMethod
  fun showConvBubble(groupId: String, title: String, letter: String) {
    OverlayBubbleManager.showBubble(reactContext, groupId, title, letter)
  }

  @ReactMethod
  fun showConvBubbleWithAvatar(groupId: String, title: String, letter: String, avatarUrl: String) {
    OverlayBubbleManager.showBubble(reactContext, groupId, title, letter)
  }

  @ReactMethod
  fun hideConvBubble(groupId: String) {
    OverlayBubbleManager.hideBubble(groupId)
  }

  @ReactMethod
  fun noteConv(groupId: String, title: String, letter: String) {
    /* giữ bubble trong stack — không cần thao tác thêm */
  }

  @ReactMethod
  fun noteConvWithAvatar(groupId: String, title: String, letter: String, avatarUrl: String) {
    /* noop */
  }

  @ReactMethod
  fun pushIncomingMessage(
    bubbleKey: String,
    title: String,
    letter: String,
    avatarUrl: String,
    senderName: String,
    message: String,
  ) {
    OverlayBubbleManager.showBubble(reactContext, bubbleKey, title, letter)
  }

  @ReactMethod
  fun showPeek(sender: String, message: String, bubbleKey: String?) {
    /* peek toast — optional, bỏ qua trên bản gọn */
  }

  @ReactMethod
  fun setBadgeCount(count: Int) {
    prefs.edit().putInt("badge_count", count).apply()
  }

  @ReactMethod
  fun minimizeApp() {
    val activity = reactContext.currentActivity ?: return
    activity.moveTaskToBack(true)
  }

  @ReactMethod
  fun saveAuthToken(token: String) {
    prefs.edit().putString("auth_token", token).apply()
  }

  @ReactMethod
  fun saveApiOrigin(origin: String) {
    prefs.edit().putString("api_origin", origin).apply()
  }

  @ReactMethod
  fun saveWebOrigin(origin: String) {
    prefs.edit().putString("web_origin", origin).apply()
  }

  @ReactMethod
  fun saveUserId(userId: String) {
    prefs.edit().putString("user_id", userId).apply()
  }

  @ReactMethod
  fun saveUserAvatarUrl(url: String) {
    prefs.edit().putString("user_avatar", url).apply()
  }

  @ReactMethod
  fun setPreferBubblesApi(prefer: Boolean) {
    prefs.edit().putBoolean("prefer_bubbles_api", prefer).apply()
  }

  @ReactMethod
  fun consumeOpenMessenger(promise: Promise) {
    promise.resolve(false)
  }

  @ReactMethod
  fun consumePendingGroup(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun consumeFcmToken(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun seedConversationMessages(bubbleKey: String, msgsJson: String) {
    /* noop */
  }

  @ReactMethod
  fun applyReactions(bubbleKey: String, messageId: String, reactionsJson: String) {
    /* noop */
  }

  @ReactMethod
  fun areBubblesSupported(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
  }

  @ReactMethod
  fun postBubbleNotification(
    bubbleKey: String,
    title: String,
    senderName: String,
    message: String,
    avatarLetter: String,
    autoExpand: Boolean,
  ) {
    postChatNotification(bubbleKey, title, senderName, null, message, null, null)
  }

  @ReactMethod
  fun cancelBubbleNotification(bubbleKey: String) {
    cancelChatNotification(bubbleKey)
  }

  @ReactMethod
  fun isBubbleExpanded(bubbleKey: String, promise: Promise) {
    promise.resolve(false)
  }

  @ReactMethod
  fun postChatNotification(
    bubbleKey: String,
    title: String,
    sender: String,
    avatar: String?,
    message: String,
    messageId: String?,
    messageType: String?,
  ) {
    ensureChatChannel()
    val nm = NotificationManagerCompat.from(reactContext)
    val intent = Intent(reactContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("bubble_key", bubbleKey)
    }
    val pending = PendingIntent.getActivity(
      reactContext,
      bubbleKey.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val body = if (sender.isNotBlank()) "$sender: $message" else message
    val notification = NotificationCompat.Builder(reactContext, CHAT_CHANNEL)
      .setSmallIcon(android.R.drawable.sym_action_chat)
      .setContentTitle(title.ifBlank { "Tin nhắn" })
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    nm.notify(bubbleKey.hashCode(), notification)
  }

  @ReactMethod
  fun cancelChatNotification(bubbleKey: String) {
    NotificationManagerCompat.from(reactContext).cancel(bubbleKey.hashCode())
  }

  /** Thông báo cuộc gọi đến — hiện trên màn hình khóa / ngoài app. */
  @ReactMethod
  fun postIncomingCallNotification(
    callId: String,
    title: String,
    body: String,
    fromUserId: String,
    fromName: String,
    isGroup: Boolean,
    groupId: String,
    groupName: String,
  ) {
    ensureCallChannel()
    val nm = NotificationManagerCompat.from(reactContext)
    val intent = Intent(reactContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra("incoming_call", true)
      putExtra("call_id", callId)
      putExtra("from_user_id", fromUserId)
      putExtra("from_name", fromName)
      putExtra("is_group", isGroup)
      putExtra("group_id", groupId)
      putExtra("group_name", groupName)
    }
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val contentPending = PendingIntent.getActivity(reactContext, callId.hashCode(), intent, pendingFlags)
    val fullScreenPending = PendingIntent.getActivity(
      reactContext,
      callId.hashCode() + 1,
      intent,
      pendingFlags,
    )
    val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    val notification = NotificationCompat.Builder(reactContext, CALL_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setContentTitle(title.ifBlank { "Cuộc gọi đến" })
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(false)
      .setContentIntent(contentPending)
      .setFullScreenIntent(fullScreenPending, true)
      .setVibrate(longArrayOf(0, 600, 200, 600, 200, 600))
      .setSound(ringtone)
      .build()
    nm.notify(callId.hashCode(), notification)
  }

  @ReactMethod
  fun cancelIncomingCallNotification(callId: String) {
    NotificationManagerCompat.from(reactContext).cancel(callId.hashCode())
  }

  /** Đọc intent mở app từ thông báo cuộc gọi native. */
  @ReactMethod
  fun consumePendingCallIntent(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences("crm_call_intent", Context.MODE_PRIVATE)
      val json = prefs.getString("pending_call_json", null)
      prefs.edit().remove("pending_call_json").apply()
      promise.resolve(json)
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  private fun ensureChatChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHAT_CHANNEL) != null) return
    val channel = NotificationChannel(
      CHAT_CHANNEL,
      "Tin nhắn",
      NotificationManager.IMPORTANCE_HIGH,
    )
    channel.description = "Thông báo tin nhắn chat CRM"
    nm.createNotificationChannel(channel)
  }

  private fun ensureCallChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CALL_CHANNEL) != null) return
    val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    val channel = NotificationChannel(
      CALL_CHANNEL,
      "Cuộc gọi",
      NotificationManager.IMPORTANCE_HIGH,
    )
    channel.description = "Thông báo cuộc gọi đến từ Messenger CRM"
    channel.enableVibration(true)
    channel.vibrationPattern = longArrayOf(0, 600, 200, 600, 200, 600)
    channel.lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    channel.setSound(
      ringtone,
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build(),
    )
    nm.createNotificationChannel(channel)
  }

  companion object {
    private const val CHAT_CHANNEL = "crm_chat"
    private const val CALL_CHANNEL = "crm_call"
  }
}
