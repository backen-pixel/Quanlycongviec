package vn.tubeppro.crmobile.battery

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CrmBatteryOptimizationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CrmBatteryOptimization"

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }
      val pm = reactContext.getSystemService(PowerManager::class.java)
      promise.resolve(pm?.isIgnoringBatteryOptimizations(reactContext.packageName) == true)
    } catch (e: Exception) {
      promise.reject("battery", e.message, e)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
    } catch (_: Exception) {
      openAppNotificationSettings()
    }
  }

  @ReactMethod
  fun openAppNotificationSettings() {
    try {
      val intent = Intent().apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
          putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
        } else {
          action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
          data = Uri.parse("package:${reactContext.packageName}")
        }
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
    } catch (_: Exception) { }
  }

  /** Android 14+ — quyền hiện cuộc gọi toàn màn hình khi app tắt. */
  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        promise.resolve(true)
        return
      }
      val nm = reactContext.getSystemService(NotificationManager::class.java)
      promise.resolve(nm?.canUseFullScreenIntent() == true)
    } catch (e: Exception) {
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun openFullScreenIntentSettings() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.parse("package:${reactContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
        return
      }
      openAppNotificationSettings()
    } catch (_: Exception) {
      openAppNotificationSettings()
    }
  }

  @ReactMethod
  fun getOemAutoStartInfo(promise: Promise) {
    val manufacturer = Build.MANUFACTURER ?: ""
    val brand = Build.BRAND ?: ""
    val model = Build.MODEL ?: ""
    val oemKey = manufacturer.lowercase()
    val map = com.facebook.react.bridge.Arguments.createMap()
    map.putString("manufacturer", manufacturer)
    map.putString("brand", brand)
    map.putString("model", model)
    map.putString("oemKey", oemKey)
    map.putBoolean(
      "hasAutoStartSettings",
      oemKey.contains("xiaomi") || oemKey.contains("oppo") || oemKey.contains("vivo") ||
        oemKey.contains("huawei") || oemKey.contains("honor") || oemKey.contains("realme"),
    )
    promise.resolve(map)
  }

  @ReactMethod
  fun openOemAutoStartSettings(promise: Promise) {
    val pkg = reactContext.packageName
    val intents = listOf(
      Intent().setComponent(
        android.content.ComponentName(
          "com.miui.securitycenter",
          "com.miui.permcenter.autostart.AutoStartManagementActivity",
        ),
      ),
      Intent().setComponent(
        android.content.ComponentName(
          "com.coloros.safecenter",
          "com.coloros.safecenter.permission.startup.StartupAppListActivity",
        ),
      ),
      Intent().setComponent(
        android.content.ComponentName(
          "com.vivo.permissionmanager",
          "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
        ),
      ),
    )
    for (intent in intents) {
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
        promise.resolve(true)
        return
      } catch (_: Exception) { }
    }
    try {
      val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:$pkg")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(fallback)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }
}
