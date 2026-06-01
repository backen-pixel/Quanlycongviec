package vn.tubeppro.crmobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * Cầu nối JS ⇄ overlay bubble (Android).
 *
 * Module này được `SystemBubbleSync` và các màn hình chat gọi vào. Để tránh
 * crash phía JS khi gọi vào những method không thuộc phạm vi v1 (vd. seed
 * lịch sử, postBubbleNotification của Android Bubbles API…), module cung
 * cấp **stub an toàn** cho mọi method được JS reference, chỉ những method
 * "lõi" mới thực sự làm việc:
 *
 *  - `canDrawOverlays`, `openOverlaySettings`
 *  - `showConvBubble*`, `hideConvBubble`, `setBadgeCount`, `stopOverlay`,
 *    `startOverlay`, `noteConv*`, `pushIncomingMessage`
 *  - `minimizeApp`
 *  - `consumePendingGroup` — đọc + xoá `pendingGroupKey` khi user tap bubble
 */
class FloatingBubbleModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    /** Key bubble user vừa tap — `OverlayBubbleService` set, JS đọc lúc app foreground. */
    @Volatile var pendingGroupKey: String? = null
  }

  override fun getName(): String = "FloatingBubbleOverlay"

  /* ─── Permission helpers ─────────────────────────────────────── */

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        Settings.canDrawOverlays(reactApplicationContext)
      else true
      promise.resolve(ok)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun openOverlaySettings() {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactApplicationContext.packageName}"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
    } catch (_: Throwable) {
      try {
        reactApplicationContext.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:${reactApplicationContext.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      } catch (_: Throwable) { /* ignore */ }
    }
  }

  /* ─── Bubble lifecycle ───────────────────────────────────────── */

  @ReactMethod
  fun showConvBubble(groupId: String?, title: String?, letter: String?) {
    showInternal(groupId, title, letter, null)
  }

  @ReactMethod
  fun showConvBubbleWithAvatar(
    groupId: String?,
    title: String?,
    letter: String?,
    avatarUrl: String?,
  ) {
    showInternal(groupId, title, letter, avatarUrl)
  }

  /** Alias: SystemBubbleSync gọi noteConv khi muốn ghi nhận hội thoại có hoạt động. */
  @ReactMethod
  fun noteConv(groupId: String?, title: String?, letter: String?) {
    showInternal(groupId, title, letter, null)
  }

  @ReactMethod
  fun noteConvWithAvatar(
    groupId: String?,
    title: String?,
    letter: String?,
    avatarUrl: String?,
  ) {
    showInternal(groupId, title, letter, avatarUrl)
  }

  /** SystemBubbleSync gọi khi có tin mới ngoài app — hiện bubble cho conv mới nhất. */
  @ReactMethod
  fun pushIncomingMessage(
    bubbleKey: String?,
    title: String?,
    avatarLetter: String?,
    avatarUrl: String?,
    @Suppress("UNUSED_PARAMETER") senderName: String?,
    @Suppress("UNUSED_PARAMETER") message: String?,
  ) {
    showInternal(bubbleKey, title, avatarLetter, avatarUrl)
  }

  @ReactMethod
  fun hideConvBubble(groupId: String?) {
    val key = groupId ?: return
    val ctx = reactApplicationContext
    val intent = Intent(ctx, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_HIDE_IF_KEY
      putExtra(OverlayBubbleService.EXTRA_KEY, key)
    }
    safeStart(intent)
  }

  @ReactMethod
  fun startOverlay(promise: Promise) {
    // No-op start: chỉ đảm bảo service đã chạy nếu đã có conv hiện thị; nếu
    // chưa có target nào thì không tự tạo bubble (tránh "bubble rỗng").
    promise.resolve(true)
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    val ctx = reactApplicationContext
    val intent = Intent(ctx, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_STOP
    }
    safeStart(intent)
    promise.resolve(true)
  }

  @ReactMethod
  fun setBadgeCount(n: Int) {
    val ctx = reactApplicationContext
    val intent = Intent(ctx, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_BADGE
      putExtra(OverlayBubbleService.EXTRA_BADGE, n)
    }
    safeStart(intent)
  }

  /* ─── App lifecycle helpers ──────────────────────────────────── */

  @ReactMethod
  fun minimizeApp() {
    val act: Activity = reactApplicationContext.currentActivity ?: return
    try { act.moveTaskToBack(true) } catch (_: Throwable) { /* */ }
  }

  @ReactMethod
  fun consumePendingGroup(promise: Promise) {
    val k = pendingGroupKey
    pendingGroupKey = null
    promise.resolve(k)
  }

  /* ─── No-op stubs giữ tương thích SystemBubbleSync ───────────── */

  @ReactMethod fun saveAuthToken(@Suppress("UNUSED_PARAMETER") token: String?) {}
  @ReactMethod fun saveWebOrigin(@Suppress("UNUSED_PARAMETER") origin: String?) {}
  @ReactMethod fun saveApiOrigin(@Suppress("UNUSED_PARAMETER") origin: String?) {}
  @ReactMethod fun saveUserId(@Suppress("UNUSED_PARAMETER") userId: String?) {}
  @ReactMethod fun saveUserAvatarUrl(@Suppress("UNUSED_PARAMETER") url: String?) {}
  @ReactMethod fun setPreferBubblesApi(@Suppress("UNUSED_PARAMETER") prefer: Boolean) {}

  @ReactMethod fun showPeek(
    @Suppress("UNUSED_PARAMETER") sender: String?,
    @Suppress("UNUSED_PARAMETER") message: String?,
    @Suppress("UNUSED_PARAMETER") bubbleKey: String?,
  ) {}

  @ReactMethod fun seedConversationMessages(
    @Suppress("UNUSED_PARAMETER") bubbleKey: String?,
    @Suppress("UNUSED_PARAMETER") msgsJson: String?,
  ) {}

  @ReactMethod fun areBubblesSupported(promise: Promise) {
    // V1 chỉ dùng overlay tự vẽ → trả false để JS bỏ nhánh Android Bubbles API.
    promise.resolve(false)
  }

  @ReactMethod fun postBubbleNotification(
    @Suppress("UNUSED_PARAMETER") bubbleKey: String?,
    @Suppress("UNUSED_PARAMETER") title: String?,
    @Suppress("UNUSED_PARAMETER") senderName: String?,
    @Suppress("UNUSED_PARAMETER") message: String?,
    @Suppress("UNUSED_PARAMETER") avatarLetter: String?,
    @Suppress("UNUSED_PARAMETER") autoExpand: Boolean,
  ) {}

  @ReactMethod fun cancelBubbleNotification(@Suppress("UNUSED_PARAMETER") bubbleKey: String?) {}

  @ReactMethod fun isBubbleExpanded(@Suppress("UNUSED_PARAMETER") bubbleKey: String?, promise: Promise) {
    promise.resolve(false)
  }

  @ReactMethod fun consumeOpenMessenger(promise: Promise) {
    promise.resolve(false)
  }

  @ReactMethod fun consumeFcmToken(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod fun applyReactions(
    @Suppress("UNUSED_PARAMETER") bubbleKey: String?,
    @Suppress("UNUSED_PARAMETER") messageId: String?,
    @Suppress("UNUSED_PARAMETER") reactionsJson: String?,
  ) {}

  @ReactMethod fun postChatNotification(
    @Suppress("UNUSED_PARAMETER") bubbleKey: String?,
    @Suppress("UNUSED_PARAMETER") title: String?,
    @Suppress("UNUSED_PARAMETER") sender: String?,
    @Suppress("UNUSED_PARAMETER") avatar: String?,
    @Suppress("UNUSED_PARAMETER") message: String?,
    @Suppress("UNUSED_PARAMETER") messageId: String?,
    @Suppress("UNUSED_PARAMETER") messageType: String?,
  ) {}

  @ReactMethod fun cancelChatNotification(@Suppress("UNUSED_PARAMETER") bubbleKey: String?) {}

  @ReactMethod fun getBubbleStack(promise: Promise) {
    val arr: WritableArray = Arguments.createArray()
    promise.resolve(arr)
  }

  /* ─── private helpers ────────────────────────────────────────── */

  private fun showInternal(groupId: String?, title: String?, letter: String?, avatarUrl: String?) {
    val key = groupId?.takeIf { it.isNotBlank() } ?: return
    val ctx = reactApplicationContext
    val intent = Intent(ctx, OverlayBubbleService::class.java).apply {
      action = OverlayBubbleService.ACTION_START
      putExtra(OverlayBubbleService.EXTRA_KEY, key)
      putExtra(OverlayBubbleService.EXTRA_TITLE, title ?: "")
      putExtra(OverlayBubbleService.EXTRA_LETTER, letter ?: "?")
      if (avatarUrl != null) putExtra(OverlayBubbleService.EXTRA_AVATAR_URL, avatarUrl)
    }
    safeStart(intent)
  }

  private fun safeStart(intent: Intent) {
    val ctx = reactApplicationContext
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent)
      else ctx.startService(intent)
    } catch (_: Throwable) {
      try { ctx.startService(intent) } catch (_: Throwable) { /* */ }
    }
  }
}
