package vn.tubeppro.crmobilev2

import android.os.Build
import android.os.Bundle
import android.view.WindowManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper
import vn.tubeppro.crmobilev2.call.IncomingCallActivity

class MainActivity : ReactActivity() {
  private var lockScreenCallBoot = false
  private var lockScreenCallBootHandled = false

  override fun onCreate(savedInstanceState: Bundle?) {
    lockScreenCallBoot = isLockScreenCallBootIntent(intent)
    if (lockScreenCallBoot) {
      setTheme(R.style.Theme_MainCallBoot)
    } else {
      setTheme(R.style.AppTheme)
    }
    super.onCreate(null)
    stashIncomingCallIntent(intent)
    if (lockScreenCallBoot) {
      scheduleLockScreenCallBootUi()
    }
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val lockBoot = isLockScreenCallBootIntent(intent)
    if (lockBoot) {
      lockScreenCallBoot = true
      lockScreenCallBootHandled = false
    }
    stashIncomingCallIntent(intent)
    if (lockBoot) {
      scheduleLockScreenCallBootUi()
    }
  }

  override fun onResume() {
    super.onResume()
    if (lockScreenCallBoot && !lockScreenCallBootHandled) {
      scheduleLockScreenCallBootUi()
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (lockScreenCallBoot && !lockScreenCallBootHandled && hasFocus) {
      scheduleLockScreenCallBootUi()
    }
  }

  private fun scheduleLockScreenCallBootUi() {
    if (lockScreenCallBootHandled) return
    lockScreenCallBootHandled = true
    hideForBackgroundCallBoot()
    bringCallUiToFront()
    window.decorView.postDelayed({ moveTaskToBack(true) }, 250L)
    window.decorView.postDelayed({ bringCallUiToFront() }, 450L)
    window.decorView.postDelayed({ bringCallUiToFront() }, 900L)
    clearLockScreenBootIntentExtras()
    lockScreenCallBoot = false
  }

  private fun clearLockScreenBootIntentExtras() {
    intent?.removeExtra("lock_screen_call")
    intent?.removeExtra("call_action")
    intent?.removeExtra("incoming_call")
  }

  private fun hideForBackgroundCallBoot() {
    window.addFlags(
      WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
    )
    window.decorView.alpha = 0f
  }

  private fun bringCallUiToFront() {
    val callId = intent?.getStringExtra("call_id")?.trim().orEmpty()
    if (callId.isBlank()) return
    IncomingCallActivity.presentState(this, callId, "connecting", 0L, false)
  }

  private fun isLockScreenCallBootIntent(intent: android.content.Intent?): Boolean {
    if (intent == null) return false
    return intent.getBooleanExtra("lock_screen_call", false)
      && intent.getStringExtra("call_action")?.trim() == "accept"
  }

  private fun stashIncomingCallIntent(intent: android.content.Intent?) {
    if (intent == null) return

    var callId = intent.getStringExtra("call_id")
    var fromUserId = intent.getStringExtra("from_user_id")
    var fromName = intent.getStringExtra("from_name") ?: ""
    var isGroup = intent.getBooleanExtra("is_group", false)
    var groupId = intent.getStringExtra("group_id") ?: ""
    var groupName = intent.getStringExtra("group_name") ?: ""
    var callAction = intent.getStringExtra("call_action")?.trim().orEmpty()
    lockScreenCallBoot = isLockScreenCallBootIntent(intent)

    if (callId.isNullOrBlank() && intent.getStringExtra("type") == "incoming_call") {
      callId = intent.getStringExtra("call_id")
      fromUserId = intent.getStringExtra("from_user_id")
      fromName = intent.getStringExtra("from_name") ?: fromName
      isGroup = intent.getStringExtra("is_group") == "true"
      groupId = intent.getStringExtra("group_id") ?: groupId
      groupName = intent.getStringExtra("group_name") ?: groupName
    }

    if (intent.getBooleanExtra("incoming_call", false) != true && callId.isNullOrBlank()) return
    if (callId.isNullOrBlank()) return
    if (fromUserId.isNullOrBlank()) fromUserId = ""

    try {
      val obj = org.json.JSONObject()
      obj.put("callId", callId)
      obj.put("fromUserId", fromUserId)
      obj.put("fromName", fromName)
      obj.put("isGroup", isGroup)
      obj.put("groupId", groupId)
      obj.put("groupName", groupName)
      obj.put("kind", "audio")
      obj.put("stashedAt", System.currentTimeMillis())
      if (callAction.isNotBlank()) obj.put("callAction", callAction)
      getSharedPreferences(vn.tubeppro.crmobilev2.call.IncomingCallHelper.PREFS, MODE_PRIVATE)
        .edit()
        .putString(vn.tubeppro.crmobilev2.call.IncomingCallHelper.PENDING_JSON, obj.toString())
        .apply()
    } catch (_: Exception) { }
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              super.invokeDefaultOnBackPressed()
          }
          return
      }
      super.invokeDefaultOnBackPressed()
  }
}
