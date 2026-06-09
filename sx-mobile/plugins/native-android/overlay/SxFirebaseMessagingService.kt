package vn.tubeppro.sxmobile.overlay

import android.content.Context
import android.content.Intent
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import vn.tubeppro.sxmobile.call.IncomingCallHelper
import vn.tubeppro.sxmobile.call.PushTokenRegistrar

/**
 * FCM: bong bóng chat (bubble_wake) + cuộc gọi đến (incoming_call) khi app tắt.
 */
class SxFirebaseMessagingService : ExpoFirebaseMessagingService() {

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (handleIncomingCall(data)) return
    maybeWakeBubble(data)
    super.onMessageReceived(remoteMessage)
  }

  override fun handleIntent(intent: Intent?) {
    if (intent?.extras != null) {
      val data = HashMap<String, String>()
      for (key in intent.extras!!.keySet()) {
        val v = intent.extras!!.get(key)?.toString() ?: continue
        data[key] = v
      }
      if (handleIncomingCall(data)) return
      maybeWakeBubble(data)
    }
    super.handleIntent(intent)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    val trimmed = token.trim()
    if (trimmed.isBlank()) return
    applicationContext.getSharedPreferences("sx_bubble_prefs", Context.MODE_PRIVATE)
      .edit()
      .putString(IncomingCallHelper.FCM_TOKEN_KEY, trimmed)
      .apply()
    PushTokenRegistrar.registerAsync(applicationContext, trimmed)
  }

  private fun handleIncomingCall(data: Map<String, String>): Boolean {
    val call = IncomingCallHelper.fromFcmData(data) ?: return false
    IncomingCallHelper.showIncomingCall(applicationContext, call)
    return true
  }

  private fun maybeWakeBubble(data: Map<String, String>) {
    if (data.isNotEmpty() && data["bubble_wake"] == "1" && data["type"] == "messenger_chat") {
      BubbleFcmWake.handle(applicationContext, data)
    }
  }
}
