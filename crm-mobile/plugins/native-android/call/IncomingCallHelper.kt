package vn.tubeppro.crmobile.call

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
import vn.tubeppro.crmobile.MainActivity

/** Hiển thị cuộc gọi đến khi app tắt / màn hình khóa (FCM + local notification). */
object IncomingCallHelper {
  const val CALL_CHANNEL = "crm_call"
  const val PREFS = "crm_call_intent"
  const val PENDING_JSON = "pending_call_json"
  const val FCM_TOKEN_KEY = "fcm_token"

  const val ACTION_ACCEPT = "vn.tubeppro.crmobile.ACTION_ACCEPT_CALL"
  const val ACTION_REJECT = "vn.tubeppro.crmobile.ACTION_REJECT_CALL"

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
    wakeScreen(context)
    ensureCallChannel(context)
    postCallNotification(context, data)
    try {
      val activityIntent = IncomingCallActivity.createIntent(context, data)
      activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(activityIntent)
    } catch (_: Exception) {
      /* fullScreenIntent trên notification sẽ mở activity */
    }
  }

  fun stashPendingCall(context: Context, data: CallData, callAction: String?) {
    try {
      val obj = toJson(data)
      if (!callAction.isNullOrBlank()) obj.put("callAction", callAction)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(PENDING_JSON, obj.toString())
        .apply()
    } catch (_: Exception) { }
  }

  fun launchMainWithCall(context: Context, data: CallData, callAction: String?) {
    stashPendingCall(context, data, callAction)
    cancelCallNotification(context, data.callId)
    val intent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra("incoming_call", true)
      putExtra("call_id", data.callId)
      putExtra("from_user_id", data.fromUserId)
      putExtra("from_name", data.fromName)
      putExtra("is_group", data.isGroup)
      putExtra("group_id", data.groupId)
      putExtra("group_name", data.groupName)
      putExtra("call_action", callAction ?: "")
    }
    context.startActivity(intent)
  }

  fun cancelCallNotification(context: Context, callId: String) {
    NotificationManagerCompat.from(context).cancel(callId.hashCode())
    try {
      context.stopService(Intent(context, IncomingCallRingService::class.java))
    } catch (_: Exception) { }
  }

  fun postCallNotification(context: Context, data: CallData) {
    ensureCallChannel(context)
    val nm = NotificationManagerCompat.from(context)
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    val fullScreenIntent = IncomingCallActivity.createIntent(context, data).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val fullScreenPending = PendingIntent.getActivity(
      context,
      data.callId.hashCode() + 1,
      fullScreenIntent,
      pendingFlags,
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
      context,
      data.callId.hashCode() + 2,
      acceptIntent,
      pendingFlags,
    )
    val rejectPending = PendingIntent.getBroadcast(
      context,
      data.callId.hashCode() + 3,
      rejectIntent,
      pendingFlags,
    )

    val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    val notification = NotificationCompat.Builder(context, CALL_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setContentTitle(data.title)
      .setContentText(data.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(data.body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(false)
      .setFullScreenIntent(fullScreenPending, true)
      .setContentIntent(fullScreenPending)
      .setVibrate(longArrayOf(0, 600, 200, 600, 200, 600))
      .setSound(ringtone)
      .addAction(android.R.drawable.ic_menu_call, "Trả lời", acceptPending)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Từ chối", rejectPending)
      .build()

    nm.notify(data.callId.hashCode(), notification)

    try {
      val ringService = Intent(context, IncomingCallRingService::class.java).apply {
        putExtra("call_id", data.callId)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(ringService)
      } else {
        context.startService(ringService)
      }
    } catch (_: Exception) { }
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
