package vn.tubeppro.sxmobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.res.Configuration
import android.os.Build

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import vn.tubeppro.sxmobile.call.IncomingCallHelper
import vn.tubeppro.sxmobile.call.LockScreenCallPackage
import vn.tubeppro.sxmobile.install.ApkInstallPackage
import vn.tubeppro.sxmobile.overlay.BubbleFcmWake
import vn.tubeppro.sxmobile.overlay.FloatingBubbleOverlayPackage

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(FloatingBubbleOverlayPackage())
              add(LockScreenCallPackage())
              add(ApkInstallPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    createNotificationChannels()
    IncomingCallHelper.ensureCallChannel(this)
    BubbleFcmWake.saveApiOrigin(this, "https://tubep-backend.onrender.com")
    prefetchFcmToken()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  private fun prefetchFcmToken() {
    try {
      com.google.firebase.messaging.FirebaseMessaging.getInstance().token
        .addOnCompleteListener { task ->
          if (!task.isSuccessful) return@addOnCompleteListener
          val token = task.result?.trim().orEmpty()
          if (token.isBlank()) return@addOnCompleteListener
          getSharedPreferences("sx_bubble_prefs", MODE_PRIVATE)
            .edit()
            .putString(IncomingCallHelper.FCM_TOKEN_KEY, token)
            .apply()
        }
    } catch (_: Exception) { }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    mgr.createNotificationChannel(
      NotificationChannel(
        "crm_chat",
        "Tin nhắn Messenger",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Thông báo khi có tin nhắn mới trong nhóm chat"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 200, 120, 200)
      },
    )
    mgr.createNotificationChannel(
      NotificationChannel(
        "crm_call",
        "Cuộc gọi đến",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Thông báo khi có cuộc gọi Messenger"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 600, 200, 600)
        setBypassDnd(true)
      },
    )
    mgr.createNotificationChannel(
      NotificationChannel(
        "sx_comments",
        "Bình luận xưởng SX",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Thông báo khi có bình luận mới trên dự án sản xuất"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 250, 250, 250)
      },
    )
  }
}
