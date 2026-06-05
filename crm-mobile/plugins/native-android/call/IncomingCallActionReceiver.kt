package vn.tubeppro.crmobile.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Nút Trả lời / Từ chối trên notification khi app tắt. */
class IncomingCallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null) return
    val data = IncomingCallHelper.dataFromIntent(intent) ?: return

    when (intent.action) {
      IncomingCallHelper.ACTION_ACCEPT -> {
        IncomingCallHelper.launchMainWithCall(context, data, "accept")
      }
      IncomingCallHelper.ACTION_REJECT -> {
        CallRejectApi.rejectAsync(context, data.callId, data.fromUserId)
        IncomingCallHelper.cancelCallNotification(context, data.callId)
      }
    }
  }
}
