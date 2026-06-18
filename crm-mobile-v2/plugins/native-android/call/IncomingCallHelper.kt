package vn.tubeppro.crmobilev2.call

import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import vn.tubeppro.crmobilev2.MainActivity

/** Hiển thị cuộc gọi đến khi app tắt / màn hình khóa (FCM + local notification). */
object IncomingCallHelper {
  const val CALL_CHANNEL = "crm_call"
  const val PREFS = "sx_call_intent"
  const val PENDING_JSON = "pending_call_json"
  const val FCM_TOKEN_KEY = "fcm_token"

  private const val DISMISSED_PREFIX = "dismissed_call_"
  private const val DISMISSED_TTL_MS = 120_000L
  private const val JS_CLAIM_KEY = "js_incoming_call_id"

  @Volatile
  private var activeRingingCallId: String? = null

  const val ACTION_ACCEPT = "vn.tubeppro.crmobilev2.ACTION_ACCEPT_CALL"
  const val ACTION_REJECT = "vn.tubeppro.crmobilev2.ACTION_REJECT_CALL"

  data class CallData(
    val callId: String,
    val fromUserId: String,
    val fromName: String,
    val isGroup: Boolean,
    val groupId: String,
    val groupName: String,
    val kind: String = "audio",
    val title: String = "",
    val body: String = "",
  )

  fun fromFcmData(data: Map<String, String>): CallData? {
    if (data["type"] != "incoming_call") return null
    val callId = data["call_id"]?.trim().orEmpty()
    val fromUserId = data["from_user_id"]?.trim().orEmpty()
    if (callId.isBlank() || fromUserId.isBlank()) return null
    val isGroup = data["is_group"] == "true"
    val fromName = data["from_name"]?.trim().orEmpty().ifBlank { "Người gọi" }
    val groupName = data["group_name"]?.trim().orEmpty()
    val title = data["title"]?.trim().orEmpty().ifBlank {
      if (isGroup) "Cuộc gọi nhóm" else "Cuộc gọi đến"
    }
    val body = data["body"]?.trim().orEmpty().ifBlank {
      if (isGroup) "$fromName mời bạn tham gia «${groupName.ifBlank { "Nhóm" }}»"
      else "$fromName đang gọi bạn"
    }
    return CallData(
      callId = callId,
      fromUserId = fromUserId,
      fromName = fromName,
      isGroup = isGroup,
      groupId = data["group_id"]?.trim().orEmpty(),
      groupName = groupName,
      kind = data["kind"]?.trim().orEmpty().ifBlank { "audio" },
      title = title,
      body = body,
    )
  }

  fun showIncomingCall(context: Context, data: CallData) {
    val callId = data.callId.trim()
    if (callId.isBlank()) return
    if (IncomingCallActivity.currentCallId == callId && LockScreenCallBridge.isUiActive()) return
    if (wasRecentlyDismissed(context, callId)) return
    if (activeRingingCallId == callId) return
    activeRingingCallId = callId
    LockScreenCallBridge.setUiActive(true, data)
    wakeScreen(context)
    ensureCallChannel(context)
    startRingServiceWithCall(context, data)
    tryLaunchFullScreenActivity(context, data)
  }

  /**
   * Sau khi user bấm Trả lời trên màn native:
   * 1) Lưu pending intent (accept)
   * 2) Dừng chuông
   * 3) Luôn boot MainActivity nền để RN consume intent và xử lý signaling/WebRTC
   */
  fun completeNativeAccept(context: Context, data: CallData) {
    stashPendingCall(context, data, "accept")
    markCallAnswered(context, data.callId)
    LockScreenCallBridge.setUiActive(true, data)
    launchMainForCallBackground(context, data, "accept")
  }

  private fun tryLaunchFullScreenActivity(context: Context, data: CallData) {
    try {
      context.startActivity(
        IncomingCallActivity.createIntent(context, data).apply {
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
              or Intent.FLAG_ACTIVITY_SINGLE_TOP
              or Intent.FLAG_ACTIVITY_CLEAR_TOP
              or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS,
          )
        },
      )
    } catch (_: Exception) {
      /* fullScreenIntent trên notification sẽ mở activity */
    }
  }

  private fun startRingServiceWithCall(context: Context, data: CallData) {
    try {
      val svc = Intent(context, IncomingCallRingService::class.java).apply {
        putExtra("call_id", data.callId)
        putExtra("from_user_id", data.fromUserId)
        putExtra("from_name", data.fromName)
        putExtra("is_group", data.isGroup)
        putExtra("group_id", data.groupId)
        putExtra("group_name", data.groupName)
        putExtra("title", data.title)
        putExtra("body", data.body)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(svc)
      } else {
        context.startService(svc)
      }
    } catch (_: Exception) { }
  }

  fun buildIncomingCallNotification(context: Context, data: CallData): android.app.Notification {
    ensureCallChannel(context)
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val fullScreenIntent = IncomingCallActivity.createIntent(context, data).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val fullScreenPending = PendingIntent.getActivity(
      context, data.callId.hashCode() + 1, fullScreenIntent, pendingFlags,
    )
    val acceptIntent = Intent(context, IncomingCallActionReceiver::class.java).apply {
      action = ACTION_ACCEPT
      putExtra("call_id", data.callId)
      putExtra("from_user_id", data.fromUserId)
      putExtra("from_name", data.fromName)
      putExtra("is_group", data.isGroup)
      putExtra("group_id", data.groupId)
      putExtra("group_name", data.groupName)
    }
    val rejectIntent = Intent(context, IncomingCallActionReceiver::class.java).apply {
      action = ACTION_REJECT
      putExtra("call_id", data.callId)
      putExtra("from_user_id", data.fromUserId)
      putExtra("from_name", data.fromName)
      putExtra("is_group", data.isGroup)
      putExtra("group_id", data.groupId)
      putExtra("group_name", data.groupName)
    }
    val acceptPending = PendingIntent.getBroadcast(
      context, data.callId.hashCode() + 2, acceptIntent, pendingFlags,
    )
    val rejectPending = PendingIntent.getBroadcast(
      context, data.callId.hashCode() + 3, rejectIntent, pendingFlags,
    )
    val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    return NotificationCompat.Builder(context, CALL_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setContentTitle(data.title)
      .setContentText(data.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(data.body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setFullScreenIntent(fullScreenPending, true)
      .setContentIntent(fullScreenPending)
      .setVibrate(longArrayOf(0, 600, 200, 600, 200, 600))
      .setSound(ringtone)
      .addAction(android.R.drawable.ic_menu_call, "Trả lời", acceptPending)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Từ chối", rejectPending)
      .build()
  }

  fun stashPendingCall(context: Context, data: CallData, callAction: String?) {
    try {
      val obj = toJson(data)
      obj.put("stashedAt", System.currentTimeMillis())
      if (!callAction.isNullOrBlank()) obj.put("callAction", callAction)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(PENDING_JSON, obj.toString())
        .apply()
    } catch (_: Exception) { }
  }

  fun launchMainForCallBackground(context: Context, data: CallData, callAction: String?) {
    stashPendingCall(context, data, callAction)
    LockScreenCallBridge.setUiActive(true, data)
    val intent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION
      putExtra("incoming_call", true)
      putExtra("lock_screen_call", true)
      putExtra("call_id", data.callId)
      putExtra("from_user_id", data.fromUserId)
      putExtra("from_name", data.fromName)
      putExtra("is_group", data.isGroup)
      putExtra("group_id", data.groupId)
      putExtra("group_name", data.groupName)
      putExtra("call_action", callAction ?: "")
    }
    context.applicationContext.startActivity(intent)
  }

  /** @deprecated dùng launchMainForCallBackground khi trả lời từ màn khóa */
  fun launchMainWithCall(context: Context, data: CallData, callAction: String?) {
    launchMainForCallBackground(context, data, callAction)
  }

  fun markCallAnswered(context: Context, callId: String) {
    if (callId.isBlank()) return
    markCallDismissed(context, callId)
    clearJsIncomingCallClaim(context)
    if (activeRingingCallId == callId) activeRingingCallId = null
    NotificationManagerCompat.from(context).cancel(callId.hashCode())
    try {
      context.stopService(Intent(context, IncomingCallRingService::class.java))
    } catch (_: Exception) { }
  }

  fun setJsIncomingCallClaim(context: Context, callId: String) {
    val id = callId.trim()
    if (id.isBlank()) return
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(JS_CLAIM_KEY, id)
        .apply()
    } catch (_: Exception) { }
  }

  fun clearJsIncomingCallClaim(context: Context) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .remove(JS_CLAIM_KEY)
        .apply()
    } catch (_: Exception) { }
  }

  private fun isJsHandlingCall(context: Context, callId: String): Boolean {
    return try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(JS_CLAIM_KEY, "")
        ?.trim() == callId.trim()
    } catch (_: Exception) {
      false
    }
  }

  fun cancelCallNotification(context: Context, callId: String) {
    markCallAnswered(context, callId)
  }

  private fun markCallDismissed(context: Context, callId: String) {
    if (callId.isBlank()) return
    try {
      // commit() đồng bộ: nếu tiến trình bị force-stop ngay sau khi nhận/từ chối, cờ dismissed
      // vẫn kịp lưu xuống đĩa để FCM redelivery / lần boot sau KHÔNG reo lại cuộc gọi này.
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putLong("$DISMISSED_PREFIX$callId", System.currentTimeMillis())
        .commit()
    } catch (_: Exception) { }
  }

  private fun wasRecentlyDismissed(context: Context, callId: String): Boolean {
    return try {
      val at = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getLong("$DISMISSED_PREFIX$callId", 0L)
      at > 0L && System.currentTimeMillis() - at < DISMISSED_TTL_MS
    } catch (_: Exception) {
      false
    }
  }

  fun postCallNotification(context: Context, data: CallData) {
    NotificationManagerCompat.from(context).notify(
      data.callId.hashCode(),
      buildIncomingCallNotification(context, data),
    )
  }

  fun toJson(data: CallData): JSONObject {
    return JSONObject().apply {
      put("callId", data.callId)
      put("fromUserId", data.fromUserId)
      put("fromName", data.fromName)
      put("isGroup", data.isGroup)
      put("groupId", data.groupId)
      put("groupName", data.groupName)
      put("kind", data.kind)
    }
  }

  fun dataFromIntent(intent: Intent?): CallData? {
    if (intent == null) return null
    val callId = intent.getStringExtra("call_id")?.trim().orEmpty()
    if (callId.isBlank()) return null
    val fromUserId = intent.getStringExtra("from_user_id")?.trim().orEmpty()
    if (fromUserId.isBlank()) return null
    val isGroup = intent.getBooleanExtra("is_group", false)
    val fromName = intent.getStringExtra("from_name")?.trim().orEmpty().ifBlank { "Người gọi" }
    val groupName = intent.getStringExtra("group_name")?.trim().orEmpty()
    return CallData(
      callId = callId,
      fromUserId = fromUserId,
      fromName = fromName,
      isGroup = isGroup,
      groupId = intent.getStringExtra("group_id")?.trim().orEmpty(),
      groupName = groupName,
    )
  }

  private fun wakeScreen(context: Context) {
    try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      @Suppress("DEPRECATION")
      val wl = pm.newWakeLock(
        PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
        "crm:incoming_call",
      )
      wl.acquire(3000)
    } catch (_: Exception) { }

    try {
      val km = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        km.requestDismissKeyguard(
          context as? android.app.Activity ?: return,
          null,
        )
      }
    } catch (_: Exception) { }
  }

  fun ensureCallChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
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
}
