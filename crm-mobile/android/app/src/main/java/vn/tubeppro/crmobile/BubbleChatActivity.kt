package vn.tubeppro.crmobile

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

/**
 * Activity riêng dùng làm target của Android Bubbles (Notification.BubbleMetadata).
 *
 * Render component JS "BubbleChatApp" (đăng ký trong index.ts), tách biệt với MainActivity
 * để khi user mở bubble không phá UI app chính. Phải khai báo trong AndroidManifest với
 * allowEmbedded="true" + documentLaunchMode="always" + resizeableActivity="true" để
 * hệ thống có thể nhúng vào bubble window.
 */
class BubbleChatActivity : ReactActivity() {

  override fun getMainComponentName(): String = "BubbleChatApp"

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.BubbleChatTheme)
    super.onCreate(null)
    setFinishOnTouchOutside(true)
    window.setBackgroundDrawableResource(android.R.color.transparent)
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.TRANSPARENT
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    val key = resolveBubbleKey(intent)
    if (key != null) {
      getSharedPreferences(OverlayBubbleService.PREFS, MODE_PRIVATE)
        .edit()
        .putString(OverlayBubbleService.KEY_PENDING_GROUP, key)
        .putString(OverlayBubbleService.KEY_LAST_BUBBLE_KEY, key)
        .apply()
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val key = resolveBubbleKey(intent)
    if (key != null) {
      getSharedPreferences(OverlayBubbleService.PREFS, MODE_PRIVATE)
        .edit()
        .putString(OverlayBubbleService.KEY_PENDING_GROUP, key)
        .putString(OverlayBubbleService.KEY_LAST_BUBBLE_KEY, key)
        .apply()
      // Phát event để JS đang chạy biết switch sang conversation mới
      val rim = reactInstanceManager
      val ctx = rim?.currentReactContext
      ctx?.getJSModule(
        com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java,
      )?.emit("BubbleChatSwitchGroup", key)
    }
  }

  private fun resolveBubbleKey(intent: Intent?): String? {
    intent?.getStringExtra(BubbleNotifBuilder.EXTRA_BUBBLE_KEY)?.let { return it }
    val data = intent?.data ?: return null
    if (data.scheme == "crmobile" && data.host == "bubble") {
      val seg = data.lastPathSegment
      if (!seg.isNullOrBlank()) return seg
      val path = data.path?.trim('/') ?: return null
      if (path.isNotBlank()) return path
    }
    return null
  }

  override fun onResume() {
    super.onResume()
    expandedKey = intent?.getStringExtra(BubbleNotifBuilder.EXTRA_BUBBLE_KEY)
  }

  override fun onPause() {
    super.onPause()
    expandedKey = null
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(
        this,
        mainComponentName,
        fabricEnabled,
      ) {},
    )
  }

  companion object {
    /**
     * Bubble key đang được mở rộng (BubbleChatActivity ở trạng thái resumed).
     * Khi != null, [BubbleNotifBuilder.post] cho cùng key sẽ bị bỏ qua để
     * tránh tray + rung trùng — đối ứng "Notification dropped (Bubble currently expanded)"
     * của Messenger.
     */
    @Volatile
    var expandedKey: String? = null
  }
}
