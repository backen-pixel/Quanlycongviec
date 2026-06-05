package vn.tubeppro.crmobile.call

import android.content.Context
import android.content.Intent

/** Đồng bộ trạng thái cuộc gọi JS ↔ IncomingCallActivity trên màn khóa. */
object LockScreenCallBridge {
  const val ACTION_STATE = "vn.tubeppro.crmobile.LOCK_SCREEN_CALL_STATE"
  const val ACTION_END_FROM_UI = "vn.tubeppro.crmobile.LOCK_SCREEN_CALL_END_UI"

  @Volatile
  private var uiActive: Boolean = false

  fun isUiActive(): Boolean = uiActive

  fun setUiActive(active: Boolean) {
    uiActive = active
  }

  fun notifyState(
    context: Context,
    callId: String,
    status: String,
    peerName: String,
    durationMs: Long,
    isMuted: Boolean,
  ) {
    if (callId.isBlank()) return
    context.sendBroadcast(
      Intent(ACTION_STATE).setPackage(context.packageName).apply {
        putExtra("call_id", callId)
        putExtra("status", status)
        putExtra("peer_name", peerName)
        putExtra("duration_ms", durationMs)
        putExtra("is_muted", isMuted)
      },
    )
    if (status == "idle" || status == "ended") {
      dismissUi(context)
    }
  }

  fun dismissUi(context: Context) {
    uiActive = false
    InCallForegroundService.stop(context)
    context.sendBroadcast(
      Intent(ACTION_STATE).setPackage(context.packageName).apply {
        putExtra("status", "idle")
      },
    )
  }

  fun notifyEndFromNativeUi(context: Context, callId: String) {
    LockScreenCallModule.emitEndCall(callId)
    dismissUi(context)
  }

  fun notifyToggleMuteFromNativeUi(context: Context, callId: String) {
    LockScreenCallModule.emitToggleMute(callId)
  }
}
