package vn.tubeppro.vcmobile.call

import android.content.Context
import android.content.Intent

/** Đồng bộ trạng thái cuộc gọi JS ↔ IncomingCallActivity trên màn khóa. */
object LockScreenCallBridge {
  const val ACTION_STATE = "vn.tubeppro.vcmobile.LOCK_SCREEN_CALL_STATE"
  const val ACTION_END_FROM_UI = "vn.tubeppro.vcmobile.LOCK_SCREEN_CALL_END_UI"

  @Volatile
  private var uiActive: Boolean = false

  @Volatile
  var activeCallData: IncomingCallHelper.CallData? = null
    private set

  fun isUiActive(): Boolean = uiActive

  fun setUiActive(active: Boolean, data: IncomingCallHelper.CallData? = null) {
    uiActive = active
    if (data != null) activeCallData = data
    if (!active) activeCallData = null
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
    if (uiActive && (status == "connecting" || status == "incall" || status == "active" || status == "incoming" || status == "outgoing")) {
      IncomingCallActivity.presentState(context, callId, status, durationMs, isMuted)
    }
    if (status == "idle" || status == "ended") {
      dismissUi(context, force = true)
    }
  }

  fun dismissUi(context: Context, force: Boolean = false) {
    if (uiActive && !force) return
    uiActive = false
    activeCallData = null
    InCallForegroundService.stop(context)
    context.sendBroadcast(
      Intent(ACTION_STATE).setPackage(context.packageName).apply {
        putExtra("status", "idle")
      },
    )
  }

  fun notifyEndFromNativeUi(context: Context, callId: String) {
    LockScreenCallModule.emitEndCall(callId)
    dismissUi(context, force = true)
  }

  fun notifyToggleMuteFromNativeUi(context: Context, callId: String) {
    LockScreenCallModule.emitToggleMute(callId)
  }
}
