package vn.tubeppro.vcmobile.overlay



import android.content.Intent

import android.net.Uri

import android.os.Build

import android.provider.Settings

import com.facebook.react.bridge.Arguments

import com.facebook.react.bridge.LifecycleEventListener

import com.facebook.react.bridge.Promise

import com.facebook.react.bridge.ReactApplicationContext

import com.facebook.react.bridge.ReactContextBaseJavaModule

import com.facebook.react.bridge.ReactMethod



/**

 * C?u n?i JS ? bong bóng overlay h? th?ng (Android).

 */

class FloatingBubbleModule(private val reactContext: ReactApplicationContext) :

  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {



  init {

    FloatingBubbleBridge.attach(reactContext)

    reactContext.addLifecycleEventListener(this)

  }



  override fun getName(): String = "FloatingBubbleOverlay"



  override fun onHostResume() {

    FloatingBubbleBridge.attach(reactContext)

  }



  override fun onHostPause() { }



  override fun onHostDestroy() {

    FloatingBubbleBridge.detach()

  }



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

  fun showConvBubbleRich(
    groupId: String,
    title: String,
    avatarLetter: String,
    avatarUrl: String,
    senderName: String,
    preview: String,
  ) {
    sendShowBubble(groupId, title, avatarLetter, avatarUrl, senderName, preview)
  }



  @ReactMethod

  fun showConvBubbleWithAvatar(groupId: String, title: String, avatarLetter: String, avatarUrl: String) {

    sendShowBubble(groupId, title, avatarLetter, avatarUrl, "", "")

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

    sendShowBubble(bubbleKey, title, avatarLetter, avatarUrl, senderName, message)

    dispatchAppendMessage(bubbleKey, senderName, message)

    dispatchShowPeek(bubbleKey, senderName, message)

  }



  @ReactMethod

  fun showPeek(sender: String, message: String, bubbleKey: String?) {

    dispatchShowPeek(bubbleKey.orEmpty(), sender, message)

  }



  @ReactMethod

  fun openChatPanel(groupId: String, title: String) {

    if (groupId.isBlank()) return

    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {

      action = OverlayBubbleService.ACTION_OPEN_CHAT_PANEL

      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, groupId)

      putExtra(OverlayBubbleService.EXTRA_TITLE, title)

    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(i)

    else reactContext.startService(i)

  }



  @ReactMethod

  fun closeChatPanel() {

    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {

      action = OverlayBubbleService.ACTION_CLOSE_CHAT_PANEL

    }

    reactContext.startService(i)

  }



  @ReactMethod

  fun consumePendingGroup(promise: Promise) {

    promise.resolve(null)

  }



  @ReactMethod(isBlockingSynchronousMethod = true)
  fun peekPendingBubbleChat(): com.facebook.react.bridge.WritableMap? {
    return readPendingBubbleChatMap(removeAfterRead = false)
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun peekPendingOutboundCall(): com.facebook.react.bridge.WritableMap? {
    return readPendingOutboundCallMap(removeAfterRead = false)
  }

  @ReactMethod
  fun consumePendingChat(promise: Promise) {
    try {
      val map = readPendingBubbleChatMap(removeAfterRead = true)
      promise.resolve(map)
    } catch (_: Exception) {
      promise.resolve(null)
    }
  }

  private fun readPendingBubbleChatMap(removeAfterRead: Boolean): com.facebook.react.bridge.WritableMap? {
    val prefs = reactContext.getSharedPreferences(
      OverlayBubbleService.PREF_NAME,
      android.content.Context.MODE_PRIVATE,
    )
    val raw = prefs.getString(OverlayBubbleService.PREF_PENDING_BUBBLE_CHAT, null)?.trim()
    if (raw.isNullOrBlank()) return null
    val obj = try {
      org.json.JSONObject(raw)
    } catch (_: Exception) {
      if (removeAfterRead) prefs.edit().remove(OverlayBubbleService.PREF_PENDING_BUBBLE_CHAT).apply()
      return null
    }
    val ts = obj.optLong("ts", 0L)
    if (ts > 0L && System.currentTimeMillis() - ts > 120_000L) {
      prefs.edit().remove(OverlayBubbleService.PREF_PENDING_BUBBLE_CHAT).apply()
      return null
    }
    val threadId = obj.optString("threadId", "").trim()
    if (threadId.isBlank()) return null
    val map = com.facebook.react.bridge.Arguments.createMap()
    map.putString("threadId", threadId)
    map.putString("title", obj.optString("title", ""))
    if (removeAfterRead) {
      prefs.edit().remove(OverlayBubbleService.PREF_PENDING_BUBBLE_CHAT).apply()
    }
    return map
  }

  @ReactMethod
  fun consumePendingOutboundCall(promise: Promise) {
    try {
      val map = readPendingOutboundCallMap(removeAfterRead = true)
      promise.resolve(map)
    } catch (_: Exception) {
      promise.resolve(null)
    }
  }

  private fun readPendingOutboundCallMap(removeAfterRead: Boolean): com.facebook.react.bridge.WritableMap? {
    val prefs = reactContext.getSharedPreferences(
      OverlayBubbleService.PREF_NAME,
      android.content.Context.MODE_PRIVATE,
    )
    val raw = prefs.getString(OverlayBubbleService.PREF_PENDING_OUTBOUND_CALL, null)?.trim()
    if (raw.isNullOrBlank()) return null
    val obj = try {
      org.json.JSONObject(raw)
    } catch (_: Exception) {
      if (removeAfterRead) prefs.edit().remove(OverlayBubbleService.PREF_PENDING_OUTBOUND_CALL).apply()
      return null
    }
    val ts = obj.optLong("ts", 0L)
    if (ts > 0L && System.currentTimeMillis() - ts > 120_000L) {
      prefs.edit().remove(OverlayBubbleService.PREF_PENDING_OUTBOUND_CALL).apply()
      return null
    }
    val groupId = obj.optString("groupId", "").trim()
    if (groupId.isBlank()) return null
    val map = com.facebook.react.bridge.Arguments.createMap()
    map.putString("groupId", groupId)
    map.putString("title", obj.optString("title", ""))
    map.putString("media", obj.optString("media", "audio"))
    if (removeAfterRead) {
      prefs.edit().remove(OverlayBubbleService.PREF_PENDING_OUTBOUND_CALL).apply()
    }
    return map
  }



  @ReactMethod

  fun minimizeApp() {

    val act = reactContext.currentActivity ?: return
    act.moveTaskToBack(true)
    act.overridePendingTransition(0, 0)

  }



  @ReactMethod

  fun showCallOverlay(

    callId: String,

    fromName: String,

    kind: String,

    isGroup: Boolean,

    groupName: String,

  ) {

    if (callId.isBlank()) return

    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {

      action = OverlayBubbleService.ACTION_SHOW_CALL_OVERLAY

      putExtra(OverlayBubbleService.EXTRA_CALL_ID, callId)

      putExtra(OverlayBubbleService.EXTRA_CALL_FROM, fromName)

      putExtra(OverlayBubbleService.EXTRA_CALL_KIND, kind.ifBlank { "audio" })

      putExtra(OverlayBubbleService.EXTRA_CALL_IS_GROUP, isGroup)

      putExtra(OverlayBubbleService.EXTRA_CALL_GROUP_NAME, groupName)

    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(i)

    else reactContext.startService(i)

  }



  @ReactMethod

  fun hideCallOverlay(callId: String) {

    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {

      action = OverlayBubbleService.ACTION_HIDE_CALL_OVERLAY

      putExtra(OverlayBubbleService.EXTRA_CALL_ID, callId)

    }

    reactContext.startService(i)

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

  @ReactMethod fun saveUiTheme(mode: String) {
    val m = mode.trim().lowercase()
    if (m != "light" && m != "dark") return
    reactContext.getSharedPreferences(OverlayBubbleService.PREF_NAME, 0)
      .edit()
      .putString(OverlayChatTheme.PREF_UI_THEME, m)
      .apply()
  }

  @ReactMethod fun saveWebOrigin(origin: String) { /* noop */ }

  @ReactMethod fun setPreferBubblesApi(prefer: Boolean) { /* noop */ }

  @ReactMethod fun hideConvBubble(groupId: String) { /* noop */ }

  @ReactMethod fun consumeOpenMessenger(promise: Promise) { promise.resolve(false) }



  @ReactMethod

  fun seedConversationMessages(bubbleKey: String, msgsJson: String) {

    if (bubbleKey.isBlank() || msgsJson.isBlank()) return

    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {

      action = OverlayBubbleService.ACTION_SEED_MESSAGES

      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, bubbleKey)

      putExtra(OverlayBubbleService.EXTRA_MESSAGES_JSON, msgsJson)

    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(i)

    else reactContext.startService(i)

  }



  @ReactMethod
  fun appendPanelMessage(groupId: String, sender: String, message: String, messageId: String?) {
    dispatchAppendMessage(groupId, sender, message, messageId)
  }

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



  private fun sendShowBubble(
    groupId: String,
    title: String,
    letter: String,
    avatarUrl: String,
    sender: String = "",
    preview: String = "",
  ) {

    if (groupId.isBlank()) return

    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {

      action = OverlayBubbleService.ACTION_SHOW_BUBBLE

      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, groupId)

      putExtra(OverlayBubbleService.EXTRA_TITLE, title)

      putExtra(OverlayBubbleService.EXTRA_LETTER, letter.ifBlank { "?" })

      putExtra(OverlayBubbleService.EXTRA_AVATAR_URL, avatarUrl)

      putExtra(OverlayBubbleService.EXTRA_SENDER, sender)

      putExtra(OverlayBubbleService.EXTRA_MESSAGE, preview)

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



  private fun dispatchAppendMessage(
    groupId: String,
    sender: String,
    message: String,
    messageId: String? = null,
  ) {
    if (groupId.isBlank()) return
    val i = Intent(reactContext, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_APPEND_MESSAGE
      putExtra(OverlayBubbleService.EXTRA_GROUP_ID, groupId)
      putExtra(OverlayBubbleService.EXTRA_SENDER, sender)
      putExtra(OverlayBubbleService.EXTRA_MESSAGE, message)
      if (!messageId.isNullOrBlank()) {
        putExtra(OverlayBubbleService.EXTRA_MESSAGE_ID, messageId)
      }
    }
    reactContext.startService(i)
  }

}


