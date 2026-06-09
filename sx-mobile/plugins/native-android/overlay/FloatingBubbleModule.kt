package vn.tubeppro.sxmobile.overlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Cầu nối JS ⇄ bong bóng overlay hệ thống (Android).
 */
class FloatingBubbleModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FloatingBubbleOverlay"

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    promise.resolve(Settings.canDrawOverlays(reactContext))
  }

  @ReactMethod
  fun openOverlaySettings() {
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactContext.packageName}"),
    ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun startOverlay(promise: Promise) {
    try {
      if (!Settings.canDrawOverlays(reactContext)) {
        promise.resolve(false)
        return
      }
      OverlayBubbleService.start(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("start_overlay", e.message, e)
    }
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    try {
      OverlayBubbleService.stop(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("stop_overlay", e.message, e)
    }
  }

  @ReactMethod
  fun setBadgeCount(n: Int) {
    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_SET_BADGE
      putExtra(OverlayBubbleService.EXTRA_BADGE, n)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(i)
    else reactContext.startService(i)
  }

  @ReactMethod
  fun showConvBubble(groupId: String, title: String, avatarLetter: String) {
    sendShowBubble(groupId, title, avatarLetter, "")
  }

  @ReactMethod
  fun showConvBubbleWithAvatar(groupId: String, title: String, avatarLetter: String, avatarUrl: String) {
    sendShowBubble(groupId, title, avatarLetter, avatarUrl)
  }

  @ReactMethod
  fun noteConv(groupId: String, title: String, avatarLetter: String) {
    sendShowBubble(groupId, title, avatarLetter, "")
  }

  @ReactMethod
  fun noteConvWithAvatar(groupId: String, title: String, avatarLetter: String, avatarUrl: String) {
    sendShowBubble(groupId, title, avatarLetter, avatarUrl)
  }

  @ReactMethod
  fun pushIncomingMessage(
    bubbleKey: String,
    title: String,
    avatarLetter: String,
    avatarUrl: String,
    senderName: String,
    message: String,
  ) {
    sendShowBubble(bubbleKey, title, avatarLetter, avatarUrl)
    dispatchShowPeek(bubbleKey, senderName, message)
  }

  @ReactMethod
  fun showPeek(sender: String, message: String, bubbleKey: String?) {
    dispatchShowPeek(bubbleKey.orEmpty(), sender, message)
  }

  @ReactMethod
  fun consumePendingGroup(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(OverlayBubbleService.PREF_NAME, 0)
      val gid = prefs.getString(OverlayBubbleService.PREF_PENDING_GROUP, null)
      if (!gid.isNullOrBlank()) {
        prefs.edit()
          .remove(OverlayBubbleService.PREF_PENDING_GROUP)
          .remove(OverlayBubbleService.PREF_PENDING_TITLE)
          .apply()
      }
      promise.resolve(gid)
    } catch (e: Exception) {
      promise.reject("consume_pending", e.message, e)
    }
  }

  @ReactMethod
  fun consumePendingChat(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(OverlayBubbleService.PREF_NAME, 0)
      val gid = prefs.getString(OverlayBubbleService.PREF_PENDING_GROUP, null)
      val title = prefs.getString(OverlayBubbleService.PREF_PENDING_TITLE, null)
      if (gid.isNullOrBlank()) {
        promise.resolve(null)
        return
      }
      prefs.edit()
        .remove(OverlayBubbleService.PREF_PENDING_GROUP)
        .remove(OverlayBubbleService.PREF_PENDING_TITLE)
        .apply()
      val map = Arguments.createMap()
      map.putString("groupId", gid)
      map.putString("title", title?.ifBlank { "Tin nhắn" } ?: "Tin nhắn")
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("consume_pending_chat", e.message, e)
    }
  }

  @ReactMethod
  fun minimizeApp() {
    reactContext.currentActivity?.moveTaskToBack(true)
  }

  @ReactMethod fun saveAuthToken(token: String) {
    val t = token.trim()
    if (t.isBlank()) return
    reactContext.getSharedPreferences(OverlayBubbleService.PREF_NAME, 0)
      .edit()
      .putString("auth_token", t)
      .remove("fcm_token_sent")
      .apply()
  }
  @ReactMethod fun saveApiOrigin(origin: String) {
    BubbleFcmWake.saveApiOrigin(reactContext, origin)
  }
  @ReactMethod fun saveUserId(userId: String) {
    val id = userId.trim()
    if (id.isBlank()) return
    reactContext.getSharedPreferences(OverlayBubbleService.PREF_NAME, 0)
      .edit()
      .putString("user_id", id)
      .apply()
  }
  @ReactMethod fun saveWebOrigin(origin: String) { /* noop */ }
  @ReactMethod fun setPreferBubblesApi(prefer: Boolean) { /* noop */ }
  @ReactMethod fun hideConvBubble(groupId: String) { /* noop */ }
  @ReactMethod fun consumeOpenMessenger(promise: Promise) { promise.resolve(false) }
  @ReactMethod fun seedConversationMessages(bubbleKey: String, msgsJson: String) { /* noop */ }
  @ReactMethod fun postChatNotification(
    bubbleKey: String,
    title: String,
    sender: String,
    avatar: String?,
    message: String,
    messageId: String?,
    messageType: String?,
  ) {
    dispatchShowPeek(bubbleKey, sender, message)
  }

  private fun sendShowBubble(groupId: String, title: String, letter: String, avatarUrl: String) {
    if (groupId.isBlank()) return
    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_SHOW_BUBBLE
      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, groupId)
      putExtra(OverlayBubbleService.EXTRA_TITLE, title)
      putExtra(OverlayBubbleService.EXTRA_LETTER, letter.ifBlank { "?" })
      putExtra(OverlayBubbleService.EXTRA_AVATAR_URL, avatarUrl)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(i)
    else reactContext.startService(i)
  }

  private fun dispatchShowPeek(groupId: String, sender: String, message: String, incrementBadge: Boolean = true) {
    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_SHOW_PEEK
      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, groupId)
      putExtra(OverlayBubbleService.EXTRA_SENDER, sender)
      putExtra(OverlayBubbleService.EXTRA_MESSAGE, message)
      putExtra(OverlayBubbleService.EXTRA_INCREMENT_BADGE, incrementBadge)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(i)
    else reactContext.startService(i)
  }
}
