package vn.tubeppro.crmobile.call

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class LockScreenCallModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LockScreenCall"

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
    LockScreenCallBridge.notifyState(
      reactContext.applicationContext,
      callId?.trim().orEmpty(),
      status?.trim().orEmpty(),
      peerName?.trim().orEmpty(),
      durationMs.toLong(),
      isMuted,
    )
  }

  @ReactMethod
  fun dismissLockScreenUi() {
    LockScreenCallBridge.dismissUi(reactContext.applicationContext)
  }

  @ReactMethod
  fun isLockScreenUiActive(promise: com.facebook.react.bridge.Promise) {
    promise.resolve(LockScreenCallBridge.isUiActive())
  }

  companion object {
    private var instance: LockScreenCallModule? = null

    fun attach(module: LockScreenCallModule) {
      instance = module
    }

    fun emitEndCall(callId: String) {
      emitEvent("LockScreenCallEnd", callId)
    }

    fun emitToggleMute(callId: String) {
      emitEvent("LockScreenCallToggleMute", callId)
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
