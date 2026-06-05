package vn.tubeppro.crmobile.call

import android.app.Service
import android.content.Intent
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Giữ chuông reo trong foreground khi có cuộc gọi đến (app kill). */
class IncomingCallRingService : Service() {
  private var player: MediaPlayer? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val callId = intent?.getStringExtra("call_id") ?: "call"
    IncomingCallHelper.ensureCallChannel(this)
    val notification = android.app.Notification.Builder(this, IncomingCallHelper.CALL_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setContentTitle("Cuộc gọi đến")
      .setContentText("Đang reo…")
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        callId.hashCode(),
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      )
    } else {
      @Suppress("DEPRECATION")
      startForeground(callId.hashCode(), notification)
    }

    try {
      player?.release()
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      player = MediaPlayer.create(this, uri)?.apply {
        isLooping = true
        start()
      }
    } catch (_: Exception) { }

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    try {
      player?.stop()
      player?.release()
    } catch (_: Exception) { }
    player = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
