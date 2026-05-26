package vn.tubeppro.crmobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * Bridge no-op cho bong bóng chat ngoài app.
 *
 * Phase 2A (file này) chỉ giữ shape API để JS gọi không crash:
 *   - canDrawOverlays / openOverlaySettings / minimizeApp: triển khai thật
 *   - saveAuthToken / saveWebOrigin: ghi SharedPreferences (phục vụ Phase 2B/3)
 *   - các method còn lại: stub trả về mặc định (false/null/Unit)
 *
 * Phase 2B sẽ bổ sung [OverlayBubbleService] + [BubbleWindowManager] để
 * startOverlay/stopOverlay/showConvBubble/... thực sự hoạt động.
 *
 * Phase 3 bổ sung BubbleChatActivity + Notification BubbleMetadata để hỗ trợ
 * Android Bubbles API (Android 11+) — ưu tiên nếu user bật.
 */
class FloatingBubbleModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  private val appCtx: Context get() = reactContext.applicationContext
  private val prefs by lazy { appCtx.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

  // ---------- Quyền overlay ----------

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(appCtx)
      } else {
        true
      }
      promise.resolve(ok)
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun openOverlaySettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${appCtx.packageName}"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      appCtx.startActivity(intent)
    } catch (_: Throwable) {
    }
  }

  // ---------- Lifecycle overlay ----------

  /**
   * Bật service overlay. Nếu chưa có conversation nào (chưa show bubble),
   * service vẫn chạy nhưng không vẽ gì — chờ [showConvBubble]/[noteConv].
   */
  @ReactMethod
  fun startOverlay(promise: Promise) {
    try {
      if (!hasOverlayPermission()) {
        promise.resolve(false)
        return
      }
      // Khôi phục toàn bộ stack bong bóng đã lưu
      OverlayBubbleService.restoreStack(appCtx)
      promise.resolve(true)
    } catch (_: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    try {
      OverlayBubbleService.stop(appCtx)
      promise.resolve(true)
    } catch (_: Throwable) {
      promise.resolve(false)
    }
  }

  // ---------- Hiển thị bong bóng theo conversation ----------

  @ReactMethod
  fun showConvBubble(groupId: String, title: String, avatarLetter: String) {
    if (!hasOverlayPermission()) return
    rememberLastBubble(groupId, title, avatarLetter, null)
    OverlayBubbleService.startWithBubble(appCtx, groupId, title, avatarLetter, null)
  }

  /** Avatar URL người gửi (sender_avatar từ push). */
  @ReactMethod
  fun showConvBubbleWithAvatar(groupId: String, title: String, avatarLetter: String, avatarUrl: String) {
    if (!hasOverlayPermission()) return
    val url = avatarUrl.trim().ifBlank { null }
    rememberLastBubble(groupId, title, avatarLetter, url)
    OverlayBubbleService.startWithBubble(appCtx, groupId, title, avatarLetter, url)
  }

  /**
   * Push tin nhắn mới vào bong bóng (đồng thời update bubble + cache + peek).
   * JS gọi 1 lần là đủ cho 1 notification.
   */
  @ReactMethod
  fun pushIncomingMessage(
    bubbleKey: String,
    title: String,
    avatarLetter: String,
    avatarUrl: String,
    senderName: String,
    message: String,
  ) {
    if (!hasOverlayPermission()) return
    val url = avatarUrl.trim().ifBlank { null }
    rememberLastBubble(bubbleKey, title, avatarLetter, url)
    OverlayBubbleService.startWithBubble(
      appCtx, bubbleKey, title, avatarLetter, url,
      sender = senderName.ifBlank { null },
      message = message.ifBlank { null },
      // JS chỉ gọi khi có tin mới và user không đang xem → luôn +1 unread.
      incrementUnread = true,
    )
  }

  @ReactMethod
  fun saveUserAvatarUrl(avatarUrl: String) {
    /* giữ API; overlay ưu tiên sender_avatar per tin nhắn */
  }

  @ReactMethod
  fun hideConvBubble(groupId: String) {
    OverlayBubbleService.hide(appCtx, groupId)
  }

  /** Hiện peek (sender + message preview) cạnh bubble đang hiển thị. Tự ẩn sau ~4.5s. */
  @ReactMethod
  fun showPeek(sender: String, message: String, bubbleKey: String?) {
    if (!hasOverlayPermission()) return
    OverlayBubbleService.showPeek(appCtx, sender, message, bubbleKey)
  }

  /**
   * Track im lặng conversation mới nhất khi app đang foreground — không show bubble,
   * nhưng nhớ key để khi user rời app rồi tap bubble (nếu còn) sẽ mở đúng chat này.
   */
  @ReactMethod
  fun noteConv(groupId: String, title: String, avatarLetter: String) {
    rememberLastBubble(groupId, title, avatarLetter, null)
  }

  @ReactMethod
  fun noteConvWithAvatar(groupId: String, title: String, avatarLetter: String, avatarUrl: String) {
    val url = avatarUrl.trim().ifBlank { null }
    rememberLastBubble(groupId, title, avatarLetter, url)
  }

  @ReactMethod
  fun setBadgeCount(n: Int) {
    try {
      OverlayBubbleService.updateBadge(appCtx, n)
    } catch (_: Throwable) {
    }
  }

  // ---------- Android Bubbles API (Android 11+) ----------

  @ReactMethod
  fun areBubblesSupported(promise: Promise) {
    try {
      promise.resolve(BubbleNotifBuilder.areBubblesSupported(appCtx))
    } catch (_: Throwable) {
      promise.resolve(false)
    }
  }

  /**
   * JS gọi khi user bật pref `useAndroidBubblesWhenAvailable` → lưu vào
   * SharedPreferences để [BubbleFcmService] biết phải post Bubble API thay vì
   * wake overlay tự vẽ. Đây là cách duy nhất để bong bóng CRM được System UI
   * gom chung 1 stack với Messenger / Zalo.
   */
  @ReactMethod
  fun setPreferBubblesApi(prefer: Boolean) {
    prefs.edit().putBoolean(KEY_PREFER_BUBBLES_API, prefer).apply()
  }

  /**
   * Post notification kiểu bubble cho 1 conversation.
   * JS gọi khi có tin mới và muốn ưu tiên Android Bubbles thay vì overlay tự vẽ.
   */
  @ReactMethod
  fun postBubbleNotification(
    bubbleKey: String,
    title: String,
    senderName: String,
    message: String,
    avatarLetter: String,
    autoExpand: Boolean,
  ) {
    try {
      BubbleNotifBuilder.post(
        appCtx,
        bubbleKey = bubbleKey,
        title = title,
        senderName = senderName,
        message = message,
        avatarLetter = avatarLetter,
        notificationId = stableNotifId(bubbleKey),
        autoExpand = autoExpand,
      )
    } catch (_: Throwable) {}
  }

  @ReactMethod
  fun cancelBubbleNotification(bubbleKey: String) {
    BubbleNotifBuilder.cancel(appCtx, stableNotifId(bubbleKey))
  }

  /** JS query xem 1 bubble có đang được mở (expanded) không — để tránh rung/toast trùng. */
  @ReactMethod
  fun isBubbleExpanded(bubbleKey: String, promise: Promise) {
    promise.resolve(BubbleChatActivity.expandedKey == bubbleKey)
  }

  private fun stableNotifId(bubbleKey: String): Int = 0x42_00_00_00 or (bubbleKey.hashCode() and 0xFFFFFF)

  // ---------- Internals ----------

  private fun hasOverlayPermission(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(appCtx) else true

  private fun rememberLastBubble(groupId: String, title: String, letter: String, avatarUrl: String?) {
    prefs.edit().putString(KEY_LAST_BUBBLE_KEY, groupId).apply()
    BubbleStackStore.upsert(
      appCtx,
      BubbleStackStore.Entry(groupId, title, letter, avatarUrl),
    )
  }

  // ---------- Token & origin để overlay/BubbleActivity tự gọi backend ----------

  @ReactMethod
  fun saveAuthToken(token: String) {
    prefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
  }

  /** Lấy FCM token đã lưu bởi [BubbleFcmService.onNewToken]. JS upsert lên backend. */
  @ReactMethod
  fun consumeFcmToken(promise: Promise) {
    try {
      val token = prefs.getString(BubbleFcmService.KEY_FCM_TOKEN, null)
      if (token.isNullOrBlank()) {
        promise.resolve(null)
      } else {
        promise.resolve(token)
      }
    } catch (_: Throwable) {
      promise.resolve(null)
    }
  }

  /** Lưu user id hiện tại — native dùng để xác định `mine` khi parse chat history. */
  @ReactMethod
  fun saveUserId(userId: String) {
    prefs.edit().putString(KEY_USER_ID, userId).apply()
  }

  /**
   * JS gọi khi socket emit `lead:reactions` — cập nhật cache + refresh panel.
   * `reactionsJson` = JSON array `[{emoji, user_id, user_name}, ...]`
   */
  @ReactMethod
  fun applyReactions(bubbleKey: String, messageId: String, reactionsJson: String) {
    try {
      val arr = org.json.JSONArray(reactionsJson)
      val list = mutableListOf<ConversationCache.Reaction>()
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        list += ConversationCache.Reaction(
          emoji = o.optString("emoji", ""),
          userId = o.optString("user_id", o.optString("userId", "")),
          userName = o.optString("user_name", o.optString("userName", "")),
        )
      }
      ConversationCache.updateReactions(appCtx, bubbleKey, messageId, list)
      val intent = Intent(appCtx, OverlayBubbleService::class.java).apply {
        action = OverlayBubbleService.ACTION_REFRESH_PANEL
        putExtra(OverlayBubbleService.EXTRA_KEY, bubbleKey)
      }
      androidx.core.content.ContextCompat.startForegroundService(appCtx, intent)
    } catch (_: Throwable) {}
  }

  @ReactMethod
  fun saveWebOrigin(origin: String) {
    prefs.edit().putString(KEY_WEB_ORIGIN, origin).apply()
  }

  /** Lưu API gốc (không có /api) để native tự fetch lịch sử chat khi React off. */
  @ReactMethod
  fun saveApiOrigin(origin: String) {
    prefs.edit().putString(KEY_API_ORIGIN, origin.trimEnd('/')).apply()
  }

  // ---------- Routing khi user tap bubble từ ngoài app ----------

  /**
   * JS gọi khi MainActivity được khởi động lại — kiểm tra có pending group cần mở không.
   * Phase 2B/3 sẽ set giá trị này khi user tap bubble.
   */
  @ReactMethod
  fun consumePendingGroup(promise: Promise) {
    val v = prefs.getString(KEY_PENDING_GROUP, null)
    if (v != null) prefs.edit().remove(KEY_PENDING_GROUP).apply()
    promise.resolve(v)
  }

  /** Tương tự nhưng cho flow chung "mở Messenger" (không kèm group cụ thể). */
  @ReactMethod
  fun consumeOpenMessenger(promise: Promise) {
    val v = prefs.getBoolean(KEY_PENDING_OPEN_MESSENGER, false)
    if (v) prefs.edit().remove(KEY_PENDING_OPEN_MESSENGER).apply()
    promise.resolve(v)
  }

  // ---------- Helper ----------

  /** Đưa app về background (giống nhấn Home) — tránh đóng app khi mở chat từ bubble. */
  @ReactMethod
  fun minimizeApp() {
    try {
      reactContext.currentActivity?.moveTaskToBack(true)
    } catch (_: Throwable) {
    }
  }

  /** Đóng activity hiện tại — JS gọi khi user tap ra ngoài cửa sổ chat nổi. */
  @ReactMethod
  fun finishCurrentActivity() {
    try {
      reactContext.currentActivity?.finish()
    } catch (_: Throwable) {
    }
  }

  /** Trả danh sách bong bóng đang stack để JS render thanh avatar nhỏ phía trên cửa sổ. */
  @ReactMethod
  fun getBubbleStack(promise: Promise) {
    try {
      val list = BubbleStackStore.load(appCtx)
      val arr: WritableArray = Arguments.createArray()
      // Mới nhất nằm cuối stack; UI muốn hiển thị mới nhất bên trái → reversed.
      for (e in list.asReversed()) {
        val m: WritableMap = Arguments.createMap()
        m.putString("key", e.key)
        m.putString("title", e.title)
        m.putString("letter", e.letter)
        m.putString("avatarUrl", e.avatarUrl ?: "")
        arr.pushMap(m)
      }
      promise.resolve(arr)
    } catch (_: Throwable) {
      promise.resolve(Arguments.createArray())
    }
  }

  @ReactMethod
  fun removeBubble(bubbleKey: String) {
    BubbleStackStore.remove(appCtx, bubbleKey)
    OverlayBubbleService.hide(appCtx, bubbleKey)
  }

  /**
   * JS seed danh sách tin nhắn cho 1 conversation (gọi sau khi panel mở).
   * `msgsJson` = JSON array các object {sender, text, avatar, ts}.
   * Lấy service instance qua service connection nhẹ — đơn giản bằng cách
   * lưu vào ConversationCache rồi gửi action refresh cho service.
   */
  /**
   * Phase 4: JS gọi khi nhận socket realtime message (app đang foreground) —
   * FCM không deliver khi app foreground nên cần fallback local notif này.
   *
   * Idempotent theo `messageId` (cùng dedupe set với FCM path).
   */
  @ReactMethod
  fun postChatNotification(
    bubbleKey: String,
    title: String,
    sender: String,
    avatar: String?,
    message: String,
    messageId: String?,
    messageType: String?,
  ) {
    try {
      val preview = when (messageType) {
        "image" -> "📷 Đã gửi 1 ảnh"
        "video" -> "🎬 Đã gửi 1 video"
        "audio" -> "🎙 Tin thoại"
        "file" -> "📎 Đã gửi 1 tệp"
        else -> message
      }
      ChatHeadsUpNotifier.post(
        appCtx,
        bubbleKey = bubbleKey,
        conversationTitle = title.ifBlank { sender },
        senderName = sender.ifBlank { title },
        senderAvatarUrl = avatar?.takeIf { it.isNotBlank() },
        message = message.ifBlank { preview },
        messageId = messageId?.takeIf { it.isNotBlank() },
        contentPreview = preview,
      )
    } catch (_: Throwable) {}
  }

  /**
   * Phase 6: JS gọi để cancel notification của 1 conversation
   * (khi user mở chat trong app → đã đọc).
   */
  @ReactMethod
  fun cancelChatNotification(bubbleKey: String) {
    try { ChatHeadsUpNotifier.cancel(appCtx, bubbleKey) } catch (_: Throwable) {}
  }

  @ReactMethod
  fun seedConversationMessages(bubbleKey: String, msgsJson: String) {
    try {
      val arr = org.json.JSONArray(msgsJson)
      val out = ArrayList<ConversationCache.Msg>(arr.length())
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val rxArr = o.optJSONArray("reactions")
        val rx = if (rxArr == null) emptyList<ConversationCache.Reaction>() else (0 until rxArr.length()).mapNotNull { j ->
          val r = rxArr.optJSONObject(j) ?: return@mapNotNull null
          val emo = ChatHistoryFetcher.safeStr(r, "emoji")
          if (emo.isBlank()) return@mapNotNull null
          ConversationCache.Reaction(
            emoji = emo,
            userId = ChatHistoryFetcher.safeStr(r, "user_id").ifBlank { ChatHistoryFetcher.safeStr(r, "userId") },
            userName = ChatHistoryFetcher.safeStr(r, "user_name").ifBlank { ChatHistoryFetcher.safeStr(r, "userName") },
          )
        }
        out.add(
          ConversationCache.Msg(
            id = ChatHistoryFetcher.safeStr(o, "id").ifBlank { null },
            userId = ChatHistoryFetcher.safeStr(o, "user_id").ifBlank { ChatHistoryFetcher.safeStr(o, "userId") }.ifBlank { null },
            sender = ChatHistoryFetcher.safeStr(o, "sender"),
            text = ChatHistoryFetcher.safeStr(o, "text"),
            avatar = ChatHistoryFetcher.safeStr(o, "avatar").ifBlank { null },
            ts = o.optLong("ts", System.currentTimeMillis()),
            replyToText = ChatHistoryFetcher.safeStr(o, "reply_to_text").ifBlank { ChatHistoryFetcher.safeStr(o, "replyToText") }.ifBlank { null },
            attachmentUrl = ChatHistoryFetcher.safeStr(o, "attachment_url").ifBlank { ChatHistoryFetcher.safeStr(o, "attachmentUrl") }.ifBlank { null },
            messageType = ChatHistoryFetcher.safeStr(o, "message_type").ifBlank { ChatHistoryFetcher.safeStr(o, "messageType") }.ifBlank { null },
            reactions = rx,
          ),
        )
      }
      ConversationCache.replaceAll(appCtx, bubbleKey, out)
      val intent = Intent(appCtx, OverlayBubbleService::class.java).apply {
        action = OverlayBubbleService.ACTION_REFRESH_PANEL
        putExtra(OverlayBubbleService.EXTRA_KEY, bubbleKey)
      }
      androidx.core.content.ContextCompat.startForegroundService(appCtx, intent)
    } catch (_: Throwable) {}
  }

  companion object {
    const val NAME = "FloatingBubbleOverlay"

    private const val PREFS = "crm_floating_bubble_prefs"
    internal const val KEY_AUTH_TOKEN = "auth_token"
    internal const val KEY_API_ORIGIN = "api_origin"
    internal const val KEY_USER_ID = "user_id"
    private const val KEY_WEB_ORIGIN = "web_origin"
    internal const val KEY_PENDING_GROUP = "pending_group"
    internal const val KEY_PENDING_OPEN_MESSENGER = "pending_open_messenger"
    private const val KEY_LAST_BUBBLE_KEY = "last_bubble_key"
    /** true = ưu tiên Android Bubbles API thay vì overlay tự vẽ. */
    internal const val KEY_PREFER_BUBBLES_API = "prefer_bubbles_api"
  }
}
