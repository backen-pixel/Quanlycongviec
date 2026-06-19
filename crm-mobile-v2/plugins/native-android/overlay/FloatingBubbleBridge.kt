package vn.tubeppro.crmobilev2.overlay

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Phát sự kiện sang JS khi panel overlay mở (seed tin nhắn nếu app đang chạy). */
object FloatingBubbleBridge {
  @Volatile
  private var reactContext: ReactApplicationContext? = null

  fun attach(ctx: ReactApplicationContext) {
    reactContext = ctx
  }

  fun detach() {
    reactContext = null
  }

  fun emitPanelOpened(key: String, title: String = "", fullApp: Boolean = false) {
    if (key.isBlank()) return
    try {
      val ctx = reactContext ?: return
      if (!ctx.hasActiveReactInstance()) return
      val map = Arguments.createMap()
      map.putString("key", key)
      if (title.isNotBlank()) map.putString("title", title)
      map.putBoolean("fullApp", fullApp)
      ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("BubblePanelOpened", map)
    } catch (_: Exception) { }
  }
}
