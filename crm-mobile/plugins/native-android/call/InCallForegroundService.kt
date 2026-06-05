package vn.tubeppro.crmobile.call

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** Giữ process + micro khi cuộc gọi trên màn khóa (MainActivity ở background). */
class InCallForegroundService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra("title")?.trim().orEmpty().ifBlank { "Cuộc gọi đang diễn ra" }
    val body = intent?.getStringExtra("body")?.trim().orEmpty().ifBlank { "TuBep CRM" }
    IncomingCallHelper.ensureCallChannel(this)
    val notification: Notification = NotificationCompat.Builder(this, IncomingCallHelper.CALL_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setContentTitle(title)
      .setContentText(body)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    val id = LOCK_SCREEN_CALL_NOTIF_ID
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
    } else {
      @Suppress("DEPRECATION")
      startForeground(id, notification)
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

    fun start(context: android.content.Context, title: String, body: String) {
      val intent = Intent(context, InCallForegroundService::class.java).apply {
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
