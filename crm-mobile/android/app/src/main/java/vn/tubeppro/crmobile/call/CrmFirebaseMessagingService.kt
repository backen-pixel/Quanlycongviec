package vn.tubeppro.crmobile.call

import android.content.Context
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
      IncomingCallHelper.showIncomingCall(applicationContext, call)
    }
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    applicationContext.getSharedPreferences("crm_bubble_prefs", Context.MODE_PRIVATE)
      .edit()
      .putString(IncomingCallHelper.FCM_TOKEN_KEY, token)
      .apply()
  }
}
