package vn.tubeppro.vcmobile.install

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ApkInstallModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ApkInstall"

  @ReactMethod
  fun canRequestPackageInstalls(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(true)
        return
      }
      val ok = reactContext.packageManager.canRequestPackageInstalls()
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.reject("ERR", e.message)
    }
  }

  @ReactMethod
  fun openUnknownAppSourcesSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      try {
        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${reactContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(fallback)
        promise.resolve(true)
      } catch (e2: Exception) {
        promise.reject("ERR", e2.message)
      }
    }
  }

  @ReactMethod
  fun installApk(contentUri: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        if (!reactContext.packageManager.canRequestPackageInstalls()) {
          promise.reject(
            "NO_INSTALL_PERMISSION",
            "Cần bật quyền cài đặt ứng dụng không rõ nguồn cho app này.",
          )
          return
        }
      }

      val uri = Uri.parse(contentUri.trim())
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      val activity = reactContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        reactContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("INSTALL_FAILED", e.message ?: "Không mở được màn hình cài đặt")
    }
  }
}
