package vn.tubeppro.crmobile

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  private var lockScreenCallBoot = false

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    super.onCreate(null)
    stashIncomingCallIntent(intent)
    if (lockScreenCallBoot) {
      window.decorView.post { moveTaskToBack(true) }
    }
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    stashIncomingCallIntent(intent)
    if (lockScreenCallBoot) {
      window.decorView.post { moveTaskToBack(true) }
    }
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
    lockScreenCallBoot = intent.getBooleanExtra("lock_screen_call", false)
      && callAction == "accept"

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
      getSharedPreferences("crm_call_intent", MODE_PRIVATE)
        .edit()
        .putString("pending_call_json", obj.toString())
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
