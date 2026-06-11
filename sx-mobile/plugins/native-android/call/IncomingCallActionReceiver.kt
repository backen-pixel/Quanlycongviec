package vn.tubeppro.sxmobile.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlin.concurrent.thread

/** Nút Trả lời / Từ chối trên notification + màn hình cuộc gọi khi app tắt. */
class IncomingCallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null) return
    val data = IncomingCallHelper.dataFromIntent(intent) ?: return

    when (intent.action) {
      IncomingCallHelper.ACTION_ACCEPT -> {
        IncomingCallActivity.launchForAccept(context, data)
      }
      IncomingCallHelper.ACTION_REJECT -> {
        // Dọn UI/chuông ngay để người dùng thấy phản hồi tức thì.
        IncomingCallHelper.cancelCallNotification(context, data.callId)
        // Nếu RN còn sống → emit socket call:reject (nhanh, đáng tin cậy).
        if (LockScreenCallModule.hasLiveReactInstance()) {
          LockScreenCallModule.emitRejectCall(data.callId)
        }
        // REST đồng bộ trong goAsync() — giữ tiến trình sống tới khi HTTP xong,
        // tránh bị hệ thống kill giữa chừng khiến caller không nhận được lệnh từ chối.
        val pending = goAsync()
        val appContext = context.applicationContext
        thread(name = "sx-call-reject") {
          try {
            CallRejectApi.rejectSync(appContext, data.callId, data.fromUserId)
          } catch (_: Exception) {
            /* ignore */
          } finally {
            pending.finish()
          }
        }
      }
    }
  }
}
