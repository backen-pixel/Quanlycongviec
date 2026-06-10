package vn.tubeppro.sxmobile.call

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
        IncomingCallActivity.launchForAccept(context, data)
      }
      IncomingCallHelper.ACTION_REJECT -> {
        // Báo RN (socket) nếu còn sống + REST fallback kép để caller luôn nhận tín hiệu.
        if (LockScreenCallModule.hasLiveReactInstance()) {
          LockScreenCallModule.emitRejectCall(data.callId)
        }
        CallRejectApi.rejectAsync(context, data.callId, data.fromUserId)
        IncomingCallHelper.cancelCallNotification(context, data.callId)
      }
    }
  }
}
