package vn.tubeppro.crmobile.call

import android.content.Context
import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Bước 6–7 trong luồng cuộc gọi khi app tắt:
 * FCM data-only → onMessageReceived → hiện màn hình cuộc gọi + chuông.
 */
class CrmFirebaseMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    if (data.isEmpty()) return
    val call = IncomingCallHelper.fromFcmData(data) ?: return
    IncomingCallHelper.showIncomingCall(applicationContext, call)
  }

  override fun handleIntent(intent: Intent?) {
    if (intent?.extras != null) {
      val data = HashMap<String, String>()
      for (key in intent.extras!!.keySet()) {
        val v = intent.extras!!.get(key)?.toString() ?: continue
        data[key] = v
      }
      val call = IncomingCallHelper.fromFcmData(data)
      if (call != null) {
        IncomingCallHelper.showIncomingCall(applicationContext, call)
        return
      }
    }
    super.handleIntent(intent)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    val trimmed = token.trim()
    if (trimmed.isBlank()) return
    applicationContext.getSharedPreferences("crm_bubble_prefs", Context.MODE_PRIVATE)
      .edit()
      .putString(IncomingCallHelper.FCM_TOKEN_KEY, trimmed)
      .apply()
    PushTokenRegistrar.registerAsync(applicationContext, trimmed)
  }
}
