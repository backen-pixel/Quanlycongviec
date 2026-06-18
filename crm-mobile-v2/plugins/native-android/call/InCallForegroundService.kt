package vn.tubeppro.crmobilev2.call

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** Giữ process + micro khi cuộc gọi trên màn khóa (MainActivity ở background). */
class InCallForegroundService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val callId = intent?.getStringExtra("call_id")?.trim().orEmpty()
    val title = intent?.getStringExtra("title")?.trim().orEmpty().ifBlank { "Cuộc gọi đang diễn ra" }
    val body = intent?.getStringExtra("body")?.trim().orEmpty().ifBlank { "TuBep CRM" }
    IncomingCallHelper.ensureCallChannel(this)
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val reopenIntent = if (callId.isNotBlank()) {
      IncomingCallActivity.createIntent(this, IncomingCallHelper.CallData(
        callId = callId,
        fromUserId = "0",
        fromName = title,
        isGroup = false,
        groupId = "",
        groupName = "",
      )).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra("call_state", "incall")
        putExtra("duration_ms", 0L)
      }
    } else {
      packageManager.getLaunchIntentForPackage(packageName)
    }
    val contentPending = reopenIntent?.let {
      PendingIntent.getActivity(this, LOCK_SCREEN_CALL_NOTIF_ID, it, pendingFlags)
    }
    val notification: Notification = NotificationCompat.Builder(this, IncomingCallHelper.CALL_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setContentTitle(title)
      .setContentText(body)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .apply {
        if (contentPending != null) {
          setContentIntent(contentPending)
        }
      }
      .build()
    val id = LOCK_SCREEN_CALL_NOTIF_ID
    // PHẢI khớp foregroundServiceType khai báo trong manifest (microphone). Trước đây nhánh
    // API 29..33 dùng PHONE_CALL (0x04) trong khi manifest là microphone (0x80) → ném
    // IllegalArgumentException làm CRASH app ngay khi bấm nghe (kẹt "đang kết nối", reo lại).
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        @Suppress("DEPRECATION")
        startForeground(id, notification)
      }
    } catch (e: Exception) {
      // Không để FGS làm sập app — nếu OS từ chối (vd start từ background bị hạn chế mic),
      // vẫn giữ tiến trình sống nhờ START_STICKY thay vì crash.
      try {
        @Suppress("DEPRECATION")
        startForeground(id, notification)
      } catch (_: Exception) { }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val LOCK_SCREEN_CALL_NOTIF_ID = 910_001

    fun start(context: android.content.Context, callId: String, title: String, body: String) {
      val intent = Intent(context, InCallForegroundService::class.java).apply {
        putExtra("call_id", callId)
        putExtra("title", title)
        putExtra("body", body)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: android.content.Context) {
      try {
        context.stopService(Intent(context, InCallForegroundService::class.java))
      } catch (_: Exception) { }
    }
  }
}
