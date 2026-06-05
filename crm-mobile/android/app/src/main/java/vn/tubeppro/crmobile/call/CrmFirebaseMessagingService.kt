package vn.tubeppro.crmobile.call

import android.content.Context
import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
/**
 * Nhận FCM data-only khi app kill.
 * Yêu cầu `google-services.json` trong android/app/ và FCM token đăng ký platform `fcm`.
 */
class CrmFirebaseMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    if (data.isEmpty()) return

    val call = IncomingCallHelper.fromFcmData(data)
    if (call != null) {
      // Data-only (app kill) hoặc foreground — hiện full-screen + notification
      IncomingCallHelper.showIncomingCall(applicationContext, call)
    }
  }

  /** Khi app kill + FCM có notification payload, hệ thống hiện tray; tap mở app qua MainActivity. */
  override fun handleIntent(intent: Intent?) {
    if (intent != null) {
      val extras = intent.extras
      if (extras != null && extras.getString("type") == "incoming_call") {
        val data = HashMap<String, String>()
        for (key in extras.keySet()) {
          val v = extras.get(key)?.toString() ?: continue
          data[key] = v
        }
        val call = IncomingCallHelper.fromFcmData(data)
        if (call != null) {
          IncomingCallHelper.showIncomingCall(applicationContext, call)
        }
      }
    }
    super.handleIntent(intent)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    applicationContext.getSharedPreferences("crm_bubble_prefs", Context.MODE_PRIVATE)
      .edit()
      .putString(IncomingCallHelper.FCM_TOKEN_KEY, token)
      .apply()
  }
}
