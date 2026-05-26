package vn.tubeppro.crmobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * Build & post notification kiểu Android Bubbles (Notification.BubbleMetadata).
 *
 * Đối ứng `setBubbleMetadata` / `setAutoExpandBubble` của Messenger.
 *
 * Yêu cầu Android 11+ (R) cho Bubbles API. Trên thiết bị thấp hơn,
 * notification vẫn được post nhưng không nổi bubble (sẽ là MessagingStyle thường).
 *
 * Bắt buộc của Bubbles:
 *  1. Conversation Shortcut (ShortcutManagerCompat.pushDynamicShortcut) — `shortcutId`
 *  2. Notification có `setShortcutId(shortcutId)` + `setLocusId(LocusIdCompat(shortcutId))`
 *  3. MessagingStyle với Person
 *  4. BubbleMetadata với intent + icon (icon phải là Adaptive/Bitmap, không là vector)
 */
object BubbleNotifBuilder {

  const val CHANNEL_ID = "crm_bubble_chat_channel"
  const val CHANNEL_NAME = "Tin nhắn (bong bóng)"
  const val EXTRA_BUBBLE_KEY = "vn.tubeppro.crmobile.bubble.bubble_key"

  fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val ch = NotificationChannel(
      CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Hiển thị tin nhắn dạng bong bóng nổi (Android 11+)"
      setShowBadge(true)
      enableLights(true)
      enableVibration(true)
      // Bubbles bắt buộc allowBubbles=true ở channel level
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        setAllowBubbles(true)
      }
    }
    nm.createNotificationChannel(ch)
  }

  /**
   * Post notification có bubble cho 1 conversation.
   *
   * @param bubbleKey       key duy nhất per-conversation (vd "lead:123" / messenger group id)
   * @param title           tên hội thoại
   * @param senderName      tên người gửi tin mới
   * @param message         nội dung
   * @param avatarLetter    1 ký tự để vẽ icon avatar
   * @param notificationId  id để cập nhật / hủy
   * @param autoExpand      true để mở luôn bubble (chỉ nên dùng khi user vừa ở app)
   */
  fun post(
    ctx: Context,
    bubbleKey: String,
    title: String,
    senderName: String,
    message: String,
    avatarLetter: String,
    notificationId: Int,
    autoExpand: Boolean = false,
  ) {
    // Suppress notification nếu bubble cho chính conv này đang được mở rộng
    // — giống "suppress notification due to user in same thread, call, or bubble" của Messenger.
    if (BubbleChatActivity.expandedKey == bubbleKey) return
    if (OverlayBubbleService.activeExpandedKey == bubbleKey) return

    ensureChannel(ctx)

    val avatarIcon = IconCompat.createWithAdaptiveBitmap(makeAvatarBitmap(avatarLetter))
    val person = Person.Builder()
      .setName(senderName)
      .setIcon(avatarIcon)
      .setKey(senderName)
      .build()

    // 1. Conversation shortcut (bắt buộc cho Bubbles)
    val shortcutId = "conv:$bubbleKey"
    val targetIntent = Intent(ctx, BubbleChatActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      flags = Intent.FLAG_ACTIVITY_NEW_DOCUMENT or Intent.FLAG_ACTIVITY_MULTIPLE_TASK
      data = Uri.parse("crmobile://bubble/$bubbleKey")
      putExtra(EXTRA_BUBBLE_KEY, bubbleKey)
    }
    val shortcut = ShortcutInfoCompat.Builder(ctx, shortcutId)
      .setShortLabel(title)
      .setLongLabel(title)
      .setLongLived(true)
      .setIcon(avatarIcon)
      .setIntent(targetIntent)
      .setLocusId(LocusIdCompat(shortcutId))
      .setPerson(person)
      .setCategories(setOf("android.shortcut.conversation"))
      .build()
    try {
      ShortcutManagerCompat.pushDynamicShortcut(ctx, shortcut)
    } catch (_: Throwable) {}

    // 2. PendingIntent cho bubble + content
    val bubblePI = PendingIntent.getActivity(
      ctx,
      bubbleKey.hashCode(),
      targetIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )

    // 3. BubbleMetadata
    val bubble = NotificationCompat.BubbleMetadata.Builder(bubblePI, avatarIcon)
      .setDesiredHeight(600)
      .setAutoExpandBubble(autoExpand)
      .setSuppressNotification(autoExpand) // nếu auto-expand thì khỏi spam tray
      .build()

    // 4. MessagingStyle
    val style = NotificationCompat.MessagingStyle(person)
      .addMessage(
        NotificationCompat.MessagingStyle.Message(
          message,
          System.currentTimeMillis(),
          person,
        ),
      )
      .setConversationTitle(title)
      .setGroupConversation(false)

    val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(ctx.applicationInfo.icon)
      .setStyle(style)
      .setShortcutId(shortcutId)
      .setLocusId(LocusIdCompat(shortcutId))
      .setBubbleMetadata(bubble)
      .setContentIntent(bubblePI)
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()

    try {
      val nm = androidx.core.app.NotificationManagerCompat.from(ctx)
      if (nm.areNotificationsEnabled()) {
        nm.notify(notificationId, notif)
      }
    } catch (_: Throwable) {}
  }

  fun cancel(ctx: Context, notificationId: Int) {
    try {
      androidx.core.app.NotificationManagerCompat.from(ctx).cancel(notificationId)
    } catch (_: Throwable) {}
  }

  /** Vẽ avatar tròn 1 ký tự — đủ làm icon Bubble (yêu cầu Bitmap, không vector). */
  private fun makeAvatarBitmap(letter: String, sizePx: Int = 256): Bitmap {
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val pBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#E8F4FF") }
    val pRing = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#0068FF")
      style = Paint.Style.STROKE
      strokeWidth = sizePx * 0.06f
    }
    val pTxt = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#0068FF")
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      textAlign = Paint.Align.CENTER
      textSize = sizePx * 0.55f
    }
    val r = sizePx / 2f
    c.drawCircle(r, r, r - pRing.strokeWidth / 2f, pBg)
    c.drawCircle(r, r, r - pRing.strokeWidth / 2f, pRing)
    val fm = pTxt.fontMetrics
    val ty = r - (fm.ascent + fm.descent) / 2f
    val ch = letter.trim().ifEmpty { "?" }.take(1).uppercase()
    c.drawText(ch, r, ty, pTxt)
    return bmp
  }

  /** Kiểm tra thiết bị có hỗ trợ Bubbles không (Android 11+ và user không cấm). */
  fun areBubblesSupported(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
    return try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      // bubblePreference: NONE=0, SELECTED=1, ALL=2
      nm.bubblePreference != NotificationManager.BUBBLE_PREFERENCE_NONE
    } catch (_: Throwable) {
      false
    }
  }
}
