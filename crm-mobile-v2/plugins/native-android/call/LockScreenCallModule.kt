package vn.tubeppro.crmobilev2.call

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class LockScreenCallModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LockScreenCall"

  init {
    attach(this)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter on Android
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter on Android
  }

  @ReactMethod
  fun updateCallState(callId: String?, status: String?, peerName: String?, durationMs: Double, isMuted: Boolean) {
    val id = callId?.trim().orEmpty()
    val st = status?.trim().orEmpty()
    if (id.isNotBlank() && st.isNotBlank() && st != "idle" && st != "ended") {
      LockScreenCallBridge.setUiActive(true)
    }
    LockScreenCallBridge.notifyState(
      reactContext.applicationContext,
      id,
      st,
      peerName?.trim().orEmpty(),
      durationMs.toLong(),
      isMuted,
    )
  }

  @ReactMethod
  fun dismissLockScreenUi() {
    LockScreenCallBridge.dismissUi(reactContext.applicationContext, force = true)
  }

  @ReactMethod
  fun isLockScreenUiActive(promise: com.facebook.react.bridge.Promise) {
    promise.resolve(LockScreenCallBridge.isUiActive())
  }

  @ReactMethod
  fun postIncomingCallNotification(
    callId: String?,
    title: String?,
    body: String?,
    fromUserId: String?,
    fromName: String?,
    isGroup: Boolean,
    groupId: String?,
    groupName: String?,
  ) {
    val id = callId?.trim().orEmpty()
    if (id.isBlank()) return
    val data = IncomingCallHelper.CallData(
      callId = id,
      fromUserId = fromUserId?.trim().orEmpty().ifBlank { "0" },
      fromName = fromName?.trim().orEmpty().ifBlank { "Người gọi" },
      isGroup = isGroup,
      groupId = groupId?.trim().orEmpty(),
      groupName = groupName?.trim().orEmpty(),
      title = title?.trim().orEmpty(),
      body = body?.trim().orEmpty(),
    )
    IncomingCallHelper.showIncomingCall(reactContext.applicationContext, data)
  }

  @ReactMethod
  fun cancelIncomingCallNotification(callId: String?) {
    val id = callId?.trim().orEmpty()
    if (id.isBlank()) return
    IncomingCallHelper.cancelCallNotification(reactContext.applicationContext, id)
  }

  @ReactMethod
  fun markIncomingCallAnswered(callId: String?) {
    val id = callId?.trim().orEmpty()
    if (id.isBlank()) return
    IncomingCallHelper.markCallAnswered(reactContext.applicationContext, id)
  }

  @ReactMethod
  fun setIncomingCallClaim(callId: String?) {
    val id = callId?.trim().orEmpty()
    if (id.isBlank()) return
    IncomingCallHelper.setJsIncomingCallClaim(reactContext.applicationContext, id)
  }

  @ReactMethod
  fun clearIncomingCallClaim(callId: String?) {
    IncomingCallHelper.clearJsIncomingCallClaim(reactContext.applicationContext)
  }

  @ReactMethod
  fun consumePendingCallIntent(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(IncomingCallHelper.PREFS, Context.MODE_PRIVATE)
      val json = prefs.getString(IncomingCallHelper.PENDING_JSON, null)
      if (json.isNullOrBlank()) {
        promise.resolve(null)
        return
      }
      prefs.edit().remove(IncomingCallHelper.PENDING_JSON).apply()
      promise.resolve(json)
    } catch (e: Exception) {
      promise.reject("consume_pending_call", e.message, e)
    }
  }

  @ReactMethod
  fun showOutgoingCall(
    callId: String?,
    peerName: String?,
    fromUserId: String?,
    isGroup: Boolean,
    groupName: String?,
  ) {
    val id = callId?.trim().orEmpty()
    if (id.isBlank()) return
    val name = peerName?.trim().orEmpty().ifBlank { "Người gọi" }
    val data = IncomingCallHelper.CallData(
      callId = id,
      fromUserId = fromUserId?.trim().orEmpty().ifBlank { "0" },
      fromName = name,
      isGroup = isGroup,
      groupId = "",
      groupName = groupName?.trim().orEmpty(),
    )
    LockScreenCallBridge.setUiActive(true, data)
    IncomingCallActivity.launchOutgoing(reactContext.applicationContext, data)
  }

  companion object {
    @Volatile
    private var instance: LockScreenCallModule? = null

    fun attach(module: LockScreenCallModule) {
      instance = module
    }

    fun emitEndCall(callId: String) {
      emitEvent("LockScreenCallEnd", callId)
    }

    fun emitRejectCall(callId: String, fromUserId: String = "") {
      val ctx = instance?.reactContext ?: return
      if (!ctx.hasActiveReactInstance()) return
      val map = Arguments.createMap()
      map.putString("callId", callId)
      map.putString("fromUserId", fromUserId)
      ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("LockScreenCallReject", map)
    }

    fun emitAcceptCall(callId: String) {
      emitEvent("LockScreenCallAccept", callId)
    }

    fun emitToggleMute(callId: String) {
      emitEvent("LockScreenCallToggleMute", callId)
    }

    /** True nếu RN còn sống để xử lý reject qua socket (foreground). */
    fun hasLiveReactInstance(): Boolean {
      val ctx = instance?.reactContext ?: return false
      return ctx.hasActiveReactInstance()
    }

    private fun emitEvent(event: String, callId: String) {
      val ctx = instance?.reactContext ?: return
      if (!ctx.hasActiveReactInstance()) return
      val map = Arguments.createMap()
      map.putString("callId", callId)
      ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, map)
    }
  }
}
