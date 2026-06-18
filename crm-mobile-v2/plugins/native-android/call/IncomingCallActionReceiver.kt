package vn.tubeppro.crmobilev2.call

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
        // Nếu RN còn sống → emit socket call:reject (nhanh, đáng tin cậy). Kèm fromUserId để
        // RN gửi được call:reject dù chưa có state cuộc gọi (vd cuộc gọi tới qua FCM lúc socket
        // offline) — tránh tình trạng chỉ tắt phía mobile còn web vẫn đổ chuông.
        if (LockScreenCallModule.hasLiveReactInstance()) {
          LockScreenCallModule.emitRejectCall(data.callId, data.fromUserId)
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
