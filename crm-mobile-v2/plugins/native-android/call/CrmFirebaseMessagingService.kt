package vn.tubeppro.crmobilev2.call

import android.content.Context
import android.content.Intent
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * FCM: cuộc gọi đến (incoming_call) khi app tắt / nền + chuyển tiếp cho expo-notifications.
 */
class CrmFirebaseMessagingService : ExpoFirebaseMessagingService() {

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (handleCallDismiss(data)) return
    if (handleIncomingCall(data)) return
    super.onMessageReceived(remoteMessage)
  }

  override fun handleIntent(intent: Intent?) {
    if (intent?.extras != null) {
      val data = HashMap<String, String>()
      for (key in intent.extras!!.keySet()) {
        val v = intent.extras!!.get(key)?.toString() ?: continue
        data[key] = v
      }
      if (handleCallDismiss(data)) return
      if (handleIncomingCall(data)) return
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

  private fun handleCallDismiss(data: Map<String, String>): Boolean {
    if (data["type"] != "call_dismiss") return false
    val callId = data["call_id"]?.trim().orEmpty()
    if (callId.isBlank()) return false
    IncomingCallHelper.cancelCallNotification(applicationContext, callId)
    return true
  }
}
