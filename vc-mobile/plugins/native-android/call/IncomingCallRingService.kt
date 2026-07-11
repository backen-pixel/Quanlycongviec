package vn.tubeppro.vcmobile.call

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder

/** Foreground: chuông reo + notification full-screen khi app kill. */
class IncomingCallRingService : Service() {
  private var player: MediaPlayer? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val data = callDataFromIntent(intent) ?: return START_NOT_STICKY
    IncomingCallHelper.ensureCallChannel(this)
    val notification = IncomingCallHelper.buildIncomingCallNotification(this, data)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        data.callId.hashCode(),
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      )
    } else {
      @Suppress("DEPRECATION")
      startForeground(data.callId.hashCode(), notification)
    }
    try {
      player?.release()
      player = MediaPlayer.create(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))?.apply {
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

  private fun callDataFromIntent(intent: Intent?): IncomingCallHelper.CallData? {
    if (intent == null) return null
    val callId = intent.getStringExtra("call_id")?.trim().orEmpty()
    val fromUserId = intent.getStringExtra("from_user_id")?.trim().orEmpty()
    if (callId.isBlank() || fromUserId.isBlank()) return null
    val isGroup = intent.getBooleanExtra("is_group", false)
    val fromName = intent.getStringExtra("from_name")?.trim().orEmpty().ifBlank { "Người gọi" }
    val groupName = intent.getStringExtra("group_name")?.trim().orEmpty()
    val title = intent.getStringExtra("title")?.trim().orEmpty().ifBlank {
      if (isGroup) "Cuộc gọi nhóm" else "Cuộc gọi đến"
    }
    val body = intent.getStringExtra("body")?.trim().orEmpty().ifBlank {
      if (isGroup) "$fromName mời bạn tham gia «${groupName.ifBlank { "Nhóm" }}»"
      else "$fromName đang gọi bạn"
    }
    return IncomingCallHelper.CallData(
      callId = callId,
      fromUserId = fromUserId,
      fromName = fromName,
      isGroup = isGroup,
      groupId = intent.getStringExtra("group_id")?.trim().orEmpty(),
      groupName = groupName,
      title = title,
      body = body,
    )
  }
}
