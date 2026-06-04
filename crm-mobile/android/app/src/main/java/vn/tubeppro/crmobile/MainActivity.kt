package vn.tubeppro.crmobile

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    stashIncomingCallIntent(intent)
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    stashIncomingCallIntent(intent)
  }

  private fun stashIncomingCallIntent(intent: android.content.Intent?) {
    if (intent?.getBooleanExtra("incoming_call", false) != true) return
    val callId = intent.getStringExtra("call_id") ?: return
    try {
      val obj = org.json.JSONObject()
      obj.put("callId", callId)
      obj.put("fromUserId", intent.getStringExtra("from_user_id") ?: "")
      obj.put("fromName", intent.getStringExtra("from_name") ?: "")
      obj.put("isGroup", intent.getBooleanExtra("is_group", false))
      obj.put("groupId", intent.getStringExtra("group_id") ?: "")
      obj.put("groupName", intent.getStringExtra("group_name") ?: "")
      obj.put("kind", "audio")
      getSharedPreferences("crm_call_intent", MODE_PRIVATE)
        .edit()
        .putString("pending_call_json", obj.toString())
        .apply()
    } catch (_: Exception) { }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
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

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
