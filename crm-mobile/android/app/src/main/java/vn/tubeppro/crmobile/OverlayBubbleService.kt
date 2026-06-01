package vn.tubeppro.crmobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Bong bóng chat nổi trên các app khác — tương tự "chat head" của Messenger.
 *
 * Mô tả ngắn:
 *  - Foreground service (yêu cầu Android O+) giữ cho bubble không bị OS kill.
 *  - Vẽ 1 view (avatar + badge) qua `WindowManager` với type
 *    `TYPE_APPLICATION_OVERLAY` — cần quyền `SYSTEM_ALERT_WINDOW`.
 *  - Drag để di chuyển + tự snap về cạnh gần nhất khi nhả tay.
 *  - Tap nhanh → mở `MainActivity` (đem app về foreground) và gắn extra
 *    `bubble_group_key` để JS đọc qua `FloatingBubbleModule.consumePendingGroup`.
 *
 * Service chỉ giữ MỘT bubble tại 1 thời điểm. Nếu user start với group khác,
 * bubble cập nhật avatar/title/key tại chỗ (không tạo bubble thứ hai).
 */
class OverlayBubbleService : Service() {

  companion object {
    private const val CHANNEL_ID = "crm_floating_bubble_v1"
    private const val NOTIF_ID = 7711

    const val ACTION_START = "vn.tubeppro.crmobile.bubble.START"
    const val ACTION_UPDATE = "vn.tubeppro.crmobile.bubble.UPDATE"
    const val ACTION_BADGE = "vn.tubeppro.crmobile.bubble.BADGE"
    const val ACTION_STOP = "vn.tubeppro.crmobile.bubble.STOP"
    const val ACTION_HIDE_IF_KEY = "vn.tubeppro.crmobile.bubble.HIDE_IF_KEY"

    const val EXTRA_KEY = "key"
    const val EXTRA_TITLE = "title"
    const val EXTRA_LETTER = "letter"
    const val EXTRA_AVATAR_URL = "avatarUrl"
    const val EXTRA_BADGE = "badge"
  }

  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null

  private var currentKey: String? = null
  private var currentTitle: String = ""
  private var currentLetter: String = "?"
  private var currentAvatarUrl: String? = null
  private var currentBadge: Int = 0

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    ensureChannel()
    startInForeground()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action
    when (action) {
      ACTION_START, ACTION_UPDATE -> {
        currentKey = intent.getStringExtra(EXTRA_KEY) ?: currentKey
        currentTitle = intent.getStringExtra(EXTRA_TITLE) ?: currentTitle
        currentLetter = (intent.getStringExtra(EXTRA_LETTER) ?: currentLetter).let {
          if (it.isBlank()) "?" else it.take(1).uppercase()
        }
        val avatarUrl = intent.getStringExtra(EXTRA_AVATAR_URL)
        if (avatarUrl != null) currentAvatarUrl = avatarUrl.ifBlank { null }
        if (intent.hasExtra(EXTRA_BADGE)) currentBadge = intent.getIntExtra(EXTRA_BADGE, 0)

        if (bubbleView == null) addBubble()
        else refreshBubble()
      }
      ACTION_BADGE -> {
        currentBadge = intent.getIntExtra(EXTRA_BADGE, 0)
        refreshBadgeOnly()
      }
      ACTION_HIDE_IF_KEY -> {
        val k = intent.getStringExtra(EXTRA_KEY)
        if (k != null && k == currentKey) stopSelfClean()
      }
      ACTION_STOP -> stopSelfClean()
      else -> { /* no-op */ }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    removeBubble()
    super.onDestroy()
  }

  /* ─── overlay view lifecycle ──────────────────────────────────── */

  private fun addBubble() {
    val wm = windowManager ?: return
    val view = buildBubbleView()
    bubbleView = view

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    val lp = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    lp.gravity = Gravity.TOP or Gravity.START
    val dm = resources.displayMetrics
    lp.x = dm.widthPixels - dpToPx(72)
    lp.y = (dm.heightPixels * 0.30f).toInt()
    layoutParams = lp

    try {
      wm.addView(view, lp)
    } catch (_: Throwable) {
      bubbleView = null
    }
    attachDragHandler(view)
    refreshBubble()
  }

  private fun refreshBubble() {
    val v = bubbleView ?: return
    val title = v.findViewById<TextView?>(R.id.bubble_letter)
    title?.text = currentLetter
    val bg = v.findViewById<View?>(R.id.bubble_circle)
    bg?.background = circleDrawable(colorForKey(currentKey ?: currentTitle))
    refreshBadgeOnly()
    val url = currentAvatarUrl
    if (!url.isNullOrBlank()) loadAvatar(url)
    else clearAvatar()
  }

  private fun refreshBadgeOnly() {
    val badge = bubbleView?.findViewById<TextView?>(R.id.bubble_badge) ?: return
    if (currentBadge <= 0) {
      badge.visibility = View.GONE
    } else {
      badge.visibility = View.VISIBLE
      badge.text = if (currentBadge > 99) "99+" else currentBadge.toString()
    }
  }

  private fun removeBubble() {
    val v = bubbleView ?: return
    try { windowManager?.removeView(v) } catch (_: Throwable) { /* ignore */ }
    bubbleView = null
    layoutParams = null
  }

  private fun stopSelfClean() {
    removeBubble()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION") stopForeground(true)
    }
    stopSelf()
  }

  /* ─── view building ───────────────────────────────────────────── */

  private fun buildBubbleView(): View {
    val ctx = this
    val root = FrameLayout(ctx)
    root.layoutParams = ViewGroup.LayoutParams(dpToPx(56), dpToPx(56))

    // Vòng tròn nền + chữ cái viết tắt
    val circle = FrameLayout(ctx)
    circle.id = R.id.bubble_circle
    val size = dpToPx(56)
    val cp = FrameLayout.LayoutParams(size, size)
    cp.gravity = Gravity.CENTER
    circle.layoutParams = cp
    circle.background = circleDrawable(Color.parseColor("#2563EB"))

    // ImageView (avatar) bên trong vòng tròn — ẩn nếu không có URL
    val avatar = ImageView(ctx)
    avatar.id = R.id.bubble_avatar
    val ap = FrameLayout.LayoutParams(size, size)
    ap.gravity = Gravity.CENTER
    avatar.layoutParams = ap
    avatar.visibility = View.GONE
    circle.addView(avatar)

    val letter = TextView(ctx)
    letter.id = R.id.bubble_letter
    letter.text = currentLetter
    letter.setTextColor(Color.WHITE)
    letter.textSize = 18f
    letter.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    val lp = FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.gravity = Gravity.CENTER
    letter.layoutParams = lp
    circle.addView(letter)

    root.addView(circle)

    // Badge nhỏ ở góc trên phải
    val badge = TextView(ctx)
    badge.id = R.id.bubble_badge
    badge.setTextColor(Color.WHITE)
    badge.textSize = 10f
    badge.setTypeface(Typeface.DEFAULT_BOLD)
    badge.setPadding(dpToPx(5), dpToPx(1), dpToPx(5), dpToPx(1))
    badge.background = pillDrawable(Color.parseColor("#EF4444"))
    badge.visibility = View.GONE
    val bp = FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    bp.gravity = Gravity.TOP or Gravity.END
    bp.topMargin = -dpToPx(2)
    bp.rightMargin = -dpToPx(2)
    badge.layoutParams = bp
    root.addView(badge)
    return root
  }

  private fun circleDrawable(color: Int): GradientDrawable {
    val d = GradientDrawable()
    d.shape = GradientDrawable.OVAL
    d.setColor(color)
    d.setStroke(dpToPx(2), Color.WHITE)
    return d
  }

  private fun pillDrawable(color: Int): GradientDrawable {
    val d = GradientDrawable()
    d.shape = GradientDrawable.RECTANGLE
    d.cornerRadius = dpToPx(10).toFloat()
    d.setColor(color)
    d.setStroke(dpToPx(1), Color.WHITE)
    return d
  }

  private fun colorForKey(s: String): Int {
    val palette = intArrayOf(
      Color.parseColor("#2563EB"),
      Color.parseColor("#EF4444"),
      Color.parseColor("#F59E0B"),
      Color.parseColor("#10B981"),
      Color.parseColor("#8B5CF6"),
      Color.parseColor("#EC4899"),
    )
    var h = 0
    for (c in s) h = (h * 31 + c.code) and 0x7fffffff
    return palette[h % palette.size]
  }

  /* ─── drag + tap ──────────────────────────────────────────────── */

  private fun attachDragHandler(view: View) {
    var startX = 0
    var startY = 0
    var startTouchX = 0f
    var startTouchY = 0f
    var downTime = 0L
    val touchSlop = dpToPx(8)

    view.setOnTouchListener { _, ev ->
      val lp = layoutParams ?: return@setOnTouchListener false
      val wm = windowManager ?: return@setOnTouchListener false
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          startX = lp.x
          startY = lp.y
          startTouchX = ev.rawX
          startTouchY = ev.rawY
          downTime = System.currentTimeMillis()
          true
        }
        MotionEvent.ACTION_MOVE -> {
          lp.x = startX + (ev.rawX - startTouchX).toInt()
          lp.y = startY + (ev.rawY - startTouchY).toInt()
          try { wm.updateViewLayout(view, lp) } catch (_: Throwable) { /* ignore */ }
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          val dx = abs(ev.rawX - startTouchX)
          val dy = abs(ev.rawY - startTouchY)
          val isTap = dx < touchSlop && dy < touchSlop &&
            System.currentTimeMillis() - downTime < 280
          if (isTap) {
            onBubbleTap()
          } else {
            snapToEdge(view, lp)
          }
          true
        }
        else -> false
      }
    }
  }

  private fun snapToEdge(view: View, lp: WindowManager.LayoutParams) {
    val wm = windowManager ?: return
    val dm: DisplayMetrics = resources.displayMetrics
    val centerX = lp.x + view.width / 2
    val targetX = if (centerX < dm.widthPixels / 2) 0 else dm.widthPixels - view.width
    val maxY = dm.heightPixels - view.height - dpToPx(72)
    val finalY = lp.y.coerceIn(dpToPx(32), maxY)
    // Animate đơn giản theo 8 bước (~120ms) — không cần ValueAnimator để gọn.
    val startX = lp.x
    val steps = 8
    for (i in 1..steps) {
      mainHandler.postDelayed({
        lp.x = startX + ((targetX - startX) * i / steps)
        lp.y = lp.y + ((finalY - lp.y) / (steps - i + 1))
        try { wm.updateViewLayout(view, lp) } catch (_: Throwable) { /* */ }
      }, (i * 14L))
    }
  }

  private fun onBubbleTap() {
    val key = currentKey ?: return
    FloatingBubbleModule.pendingGroupKey = key
    try {
      val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
      launch.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
          Intent.FLAG_ACTIVITY_SINGLE_TOP,
      )
      launch.putExtra("bubble_group_key", key)
      startActivity(launch)
    } catch (_: Throwable) { /* ignore */ }
  }

  /* ─── avatar download (best-effort, không chặn UI) ───────────── */

  private fun loadAvatar(url: String) {
    Thread {
      val bmp = try {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 4000
          readTimeout = 6000
          instanceFollowRedirects = true
        }
        conn.inputStream.use { BitmapFactory.decodeStream(it) }
      } catch (_: Throwable) {
        null
      } ?: return@Thread
      val circular = makeCircular(bmp)
      mainHandler.post {
        val v = bubbleView ?: return@post
        val avatar = v.findViewById<ImageView?>(R.id.bubble_avatar) ?: return@post
        val letter = v.findViewById<TextView?>(R.id.bubble_letter)
        avatar.setImageBitmap(circular)
        avatar.visibility = View.VISIBLE
        letter?.visibility = View.GONE
      }
    }.start()
  }

  private fun clearAvatar() {
    val v = bubbleView ?: return
    val avatar = v.findViewById<ImageView?>(R.id.bubble_avatar) ?: return
    val letter = v.findViewById<TextView?>(R.id.bubble_letter)
    avatar.setImageBitmap(null)
    avatar.visibility = View.GONE
    letter?.visibility = View.VISIBLE
  }

  private fun makeCircular(src: Bitmap): Bitmap {
    val size = minOf(src.width, src.height)
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val rectF = RectF(0f, 0f, size.toFloat(), size.toFloat())
    canvas.drawOval(rectF, paint)
    paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    val srcRect = Rect((src.width - size) / 2, (src.height - size) / 2, (src.width + size) / 2, (src.height + size) / 2)
    canvas.drawBitmap(src, srcRect, rectF, paint)
    return output
  }

  /* ─── foreground notification ─────────────────────────────────── */

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val ch = NotificationChannel(CHANNEL_ID, "Bong bóng chat TuBep CRM", NotificationManager.IMPORTANCE_LOW)
    ch.description = "Giữ bong bóng chat nổi hoạt động khi app ở nền."
    ch.setShowBadge(false)
    nm.createNotificationChannel(ch)
  }

  private fun startInForeground() {
    val openApp = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    val piFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    else
      PendingIntent.FLAG_UPDATE_CURRENT
    val pi = PendingIntent.getActivity(this, 0, openApp, piFlag)

    val builder = Notification.Builder(
      this,
      CHANNEL_ID,
    ).apply {
      setSmallIcon(applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_email)
      setContentTitle("Bong bóng chat đang bật")
      setContentText("Chạm để mở TuBep CRM")
      setContentIntent(pi)
      setOngoing(true)
      setOnlyAlertOnce(true)
      setShowWhen(false)
    }
    val notif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.build()
    else @Suppress("DEPRECATION") Notification.Builder(this)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Bong bóng chat đang bật")
      .setContentText("Chạm để mở TuBep CRM")
      .setContentIntent(pi)
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 14+ — chỉ định loại foreground service tường minh
      try {
        startForeground(
          NOTIF_ID,
          notif,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
        )
      } catch (_: Throwable) {
        // fallback nếu device không cho phép SPECIAL_USE — vẫn start nhưng có thể bị OS hạn chế.
        try { startForeground(NOTIF_ID, notif) } catch (_: Throwable) { /* */ }
      }
    } else {
      try { startForeground(NOTIF_ID, notif) } catch (_: Throwable) { /* */ }
    }
  }

  /* ─── helpers ─────────────────────────────────────────────────── */

  private fun dpToPx(dp: Int): Int =
    (dp * resources.displayMetrics.density).roundToInt()
}
