package vn.tubeppro.crmobile

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.core.app.NotificationCompat
import androidx.dynamicanimation.animation.DynamicAnimation
import androidx.dynamicanimation.animation.FlingAnimation
import androidx.dynamicanimation.animation.FloatValueHolder
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Foreground service — stack nhiều bong bóng overlay (giống Messenger Chat Heads).
 */
class OverlayBubbleService : Service() {

  private lateinit var wm: WindowManager
  private lateinit var prefs: SharedPreferences

  /** key → bubble đang gắn trên WindowManager */
  private val managed = LinkedHashMap<String, ManagedBubble>()
  private var dropTargetView: View? = null
  private var draggingKey: String? = null
  private var globalBadge = 0

  private var peekView: View? = null
  private var peekForKey: String? = null
  private val peekHandler = android.os.Handler(android.os.Looper.getMainLooper())
  private val peekHideRunnable = Runnable { hidePeek() }

  /** Khung chat mở rộng (native overlay, không React). */
  private val expandedPanel by lazy { ExpandedChatPanel(this, this) }

  private class ManagedBubble(
    val key: String,
    val view: BubbleOverlayView,
    var params: WindowManager.LayoutParams,
    var springX: SpringAnimation? = null,
    var springY: SpringAnimation? = null,
    var flingX: FlingAnimation? = null,
    var flingY: FlingAnimation? = null,
  )

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    ensureChannel()
    startForeground(NOTIF_ID, buildNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_SHOW_BUBBLE -> {
        val key = intent.getStringExtra(EXTRA_KEY) ?: return START_STICKY
        val title = intent.getStringExtra(EXTRA_TITLE) ?: key
        val letter = intent.getStringExtra(EXTRA_AVATAR_LETTER) ?: title.take(1)
        val avatarUrl = intent.getStringExtra(EXTRA_AVATAR_URL)?.takeIf { it.isNotBlank() }
        val sender = intent.getStringExtra(EXTRA_PEEK_SENDER)
        val message = intent.getStringExtra(EXTRA_PEEK_MESSAGE)
        val shouldIncUnread = intent.getBooleanExtra(EXTRA_INC_UNREAD, false)
        if (!sender.isNullOrBlank() && !message.isNullOrBlank()) {
          ConversationCache.append(
            this, key,
            ConversationCache.Msg(
              sender = sender, text = message,
              avatar = avatarUrl, ts = System.currentTimeMillis(),
            ),
          )
          if (expandedPanel.isShowing()) expandedPanel.onIncoming(key)
        }
        // Bước 1: upsert entry (giữ unread cũ nếu đã tồn tại, =0 nếu mới)
        BubbleStackStore.upsert(
          this,
          BubbleStackStore.Entry(key, title, letter, avatarUrl, unreadCount = 0),
        )
        // Bước 2: nếu user không đang xem panel của conv này → +1 unread
        if (shouldIncUnread && activeExpandedKey != key) {
          BubbleStackStore.incrementUnread(this, key)
        }
        val entries = BubbleStackStore.load(this)
        renderStack(entries, loadAvatarForKey = key, loadAvatarUrl = avatarUrl)
        applyUnreadBadges()
      }
      ACTION_EXPAND -> {
        val key = intent.getStringExtra(EXTRA_KEY) ?: return START_STICKY
        expand(key)
      }
      ACTION_REFRESH_PANEL -> {
        val key = intent.getStringExtra(EXTRA_KEY) ?: return START_STICKY
        if (expandedPanel.isShowing() && expandedPanel.currentKey() == key) {
          expandedPanel.onIncoming(key)
        }
      }
      ACTION_COLLAPSE -> collapsePanel()
      ACTION_HIDE_BUBBLE -> {
        val key = intent.getStringExtra(EXTRA_KEY)
        if (key.isNullOrBlank()) clearAllBubbles() else removeBubble(key)
      }
      ACTION_UPDATE_BADGE -> {
        globalBadge = intent.getIntExtra(EXTRA_BADGE, 0)
        applyBadgeToTop()
      }
      ACTION_SHOW_PEEK -> {
        val sender = intent.getStringExtra(EXTRA_PEEK_SENDER) ?: return START_STICKY
        val message = intent.getStringExtra(EXTRA_PEEK_MESSAGE) ?: ""
        val key = intent.getStringExtra(EXTRA_KEY)
        // Suppress nếu panel đang mở cho chính conv này.
        if (key != null && activeExpandedKey == key) {
          // skip peek
        } else {
          showPeek(sender, message, key)
        }
      }
      ACTION_RESTORE_STACK -> {
        renderStack(BubbleStackStore.load(this))
      }
      ACTION_STOP -> {
        clearAllBubbles()
        BubbleStackStore.clear(this)
        stopSelf()
      }
      ACTION_KEEP_ALIVE -> {
        // Không làm gì — chỉ giữ service alive (đã startForeground ở onCreate)
        // để Android 12+ không chặn `startForegroundService` khi FCM tới sau này.
      }
      ACTION_HIDE_FOR_EXTERNAL -> hideOverlayTemporarily()
      ACTION_SHOW_AFTER_EXTERNAL -> showOverlayBack()
    }
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    // Khi user swipe-kill app từ recents → schedule restart service qua AlarmManager
    // (OEM Trung Quốc hay kill cả foreground service nếu task bị remove).
    try {
      val restart = Intent(applicationContext, OverlayBubbleService::class.java).apply {
        action = ACTION_KEEP_ALIVE
      }
      val pi = PendingIntent.getForegroundService(
        applicationContext,
        0,
        restart,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val am = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      val triggerAt = System.currentTimeMillis() + 2_000L
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, triggerAt, pi)
      } else {
        am.setExact(android.app.AlarmManager.RTC_WAKEUP, triggerAt, pi)
      }
    } catch (_: Throwable) {}
  }

  override fun onDestroy() {
    clearAllBubbles()
    super.onDestroy()
  }

  // ---- Notification (FGS) ----

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Bong bóng chat", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Giữ bong bóng nổi khi app tắt"
        setShowBadge(false)
        enableLights(false)
        enableVibration(false)
      },
    )
  }

  private fun buildNotification(): Notification {
    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val pi = openApp?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("TuBep CRM")
      .setContentText("Bong bóng chat đang chạy nền")
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setOngoing(true)
      .setShowWhen(false)
      .setContentIntent(pi)
      .build()
  }

  // ---- Multi-bubble stack ----

  /** Kích thước bubble nhìn thấy (dp). Khớp với [BubbleOverlayView.VISIBLE_DP]. */
  private fun bubbleVisibleSizePx(): Int = BubbleOverlayView.visibleSizePx(this)

  /**
   * Kích thước WINDOW thật của bubble — lớn hơn bubble visible để phần đệm
   * trong suốt giúp ngón tay không "thoát" window khi kéo nhanh. Nhờ đó touch
   * capture luôn được giữ → drag mượt mà giống Messenger ChatHeads / Zalo.
   * Khớp với [BubbleOverlayView.WINDOW_DP].
   */
  private fun bubbleWindowSizePx(): Int = BubbleOverlayView.windowSizePx(this)

  /** Padding trong suốt giữa mép window và mép bubble (mỗi bên). */
  private fun bubblePadPx(): Int = (bubbleWindowSizePx() - bubbleVisibleSizePx()) / 2

  /** Backwards compat: code cũ gọi `bubbleSizePx()` nghĩa là VISIBLE size. */
  private fun bubbleSizePx(): Int = bubbleVisibleSizePx()

  private fun stackOverlapPx(): Int = dp(18f).toInt()

  private fun renderStack(
    entries: List<BubbleStackStore.Entry>,
    loadAvatarForKey: String? = null,
    loadAvatarUrl: String? = null,
  ) {
    if (!canDrawOverlays()) {
      // Không có quyền overlay → vẫn để service alive ở keep-alive mode để có thể nhận FCM.
      // Không show bubble, chỉ skip render.
      return
    }
    val visSize = bubbleVisibleSizePx()
    val winSize = bubbleWindowSizePx()
    val pad = bubblePadPx()
    val keysInStack = entries.map { it.key }.toSet()
    // Gỡ bubble không còn trong store
    val toRemove = managed.keys.filter { it !in keysInStack }
    for (k in toRemove) removeBubbleView(k)

    val metrics = resources.displayMetrics
    // Vị trí lưu = TOP-LEFT của BUBBLE NHÌN THẤY (visible) — bền vững khi đổi
    // window size sau này.
    val savedVisX = prefs.getInt(KEY_TOP_X, Int.MIN_VALUE)
    val savedVisY = prefs.getInt(KEY_TOP_Y, Int.MIN_VALUE)
    val defaultVisX = metrics.widthPixels - visSize - dp(10f).toInt()
    val defaultVisY = (metrics.heightPixels * 0.55f).toInt()
    val topVisX = if (savedVisX != Int.MIN_VALUE) savedVisX.coerceIn(0, metrics.widthPixels - visSize) else defaultVisX
    val topVisY = if (savedVisY != Int.MIN_VALUE) savedVisY.coerceIn(0, metrics.heightPixels - visSize) else defaultVisY

    entries.forEachIndexed { index, entry ->
      val isTop = index == entries.lastIndex
      val visibleY = if (isTop) topVisY else (topVisY - (entries.lastIndex - index) * stackOverlapPx()).coerceAtLeast(dp(48f).toInt())
      // Convert sang WINDOW position (window có pad trong suốt bao quanh bubble).
      val winX = topVisX - pad
      val winY = visibleY - pad
      val mb = managed[entry.key]
      // Bỏ qua bubble đang được user kéo — animate sẽ ghi đè translation.
      if (mb != null && entry.key == draggingKey) return@forEachIndexed
      if (mb != null) {
        mb.view.setAvatarLetter(entry.letter)
        animateTo(mb, winX, winY)
        // Badge per-bubble: mỗi bubble hiện count riêng (theo entry.unreadCount).
        mb.view.setBadge(entry.unreadCount)
        if (!entry.avatarUrl.isNullOrBlank()) loadAvatarAsync(entry.avatarUrl, mb.view)
      } else {
        attachBubble(entry, winX, winY, winSize, isTop = isTop)
      }
      if (entry.key == loadAvatarForKey && !loadAvatarUrl.isNullOrBlank()) {
        managed[entry.key]?.let { loadAvatarAsync(loadAvatarUrl, it.view) }
      }
    }
    applyUnreadBadges()
    if (peekForKey != null && peekForKey !in managed) hidePeek()
  }

  /**
   * @param windowSize WINDOW size (180dp) — không phải visible bubble (60dp).
   */
  private fun attachBubble(entry: BubbleStackStore.Entry, x: Int, y: Int, windowSize: Int, isTop: Boolean) {
    val view = BubbleOverlayView(this, object : BubbleOverlayView.Callback {
      override fun onTap() = handleTap(entry.key)
      override fun onLongPress() = handleLongPress(entry.key)
      override fun onDragStart() {
        draggingKey = entry.key
        bringToFront(entry.key)
        cancelAnimations(entry.key)
        showDropTarget()
      }
      override fun onDragMove(rawX: Float, rawY: Float) {
        moveBubble(entry.key, rawX, rawY)
        // Magnetic: khi gần drop → vibrate nhẹ + scale ring drop
        val dropDist = distanceToDropCenter(rawX, rawY)
        magneticFeedback(dropDist)
      }
      override fun onDragEnd(rawX: Float, rawY: Float, droppedToDismiss: Boolean, vx: Float, vy: Float) {
        val dropped = isOverDropTarget(rawX, rawY)
        draggingKey = null
        hideDropTarget()
        // Commit View translation đã dùng trong drag → chuyển sang vị trí window thật.
        commitDragTranslation(entry.key)
        if (dropped) {
          vibrateLight()
          removeBubble(entry.key)
        } else {
          settleBubble(entry.key, vx, vy)
        }
      }
    }).apply {
      setAvatarLetter(entry.letter)
      // Badge per-bubble = entry.unreadCount (đúng số tin chưa đọc của RIÊNG conv này).
      setBadge(entry.unreadCount)
    }
    val params = BubbleOverlayView.makeLayoutParams(windowSize, x, y)
    try {
      wm.addView(view, params)
      managed[entry.key] = ManagedBubble(entry.key, view, params)
      if (!entry.avatarUrl.isNullOrBlank()) loadAvatarAsync(entry.avatarUrl, view)
    } catch (_: Throwable) {
      stopSelf()
    }
  }

  private fun layoutStackPositions() {
    if (draggingKey != null) return
    val entries = BubbleStackStore.load(this)
    val visSize = bubbleVisibleSizePx()
    val pad = bubblePadPx()
    val metrics = resources.displayMetrics
    val topKey = entries.lastOrNull()?.key
    val topMb = topKey?.let { managed[it] }
    val topWinX = topMb?.params?.x ?: (metrics.widthPixels - visSize - dp(10f).toInt() - pad)
    val topWinY = topMb?.params?.y ?: ((metrics.heightPixels * 0.55f).toInt() - pad)
    entries.forEachIndexed { index, entry ->
      val mb = managed[entry.key] ?: return@forEachIndexed
      val isTop = index == entries.lastIndex
      val targetWinX = topWinX
      // Stack offset là theo VISIBLE bubble; pad không đổi nên cộng/trừ trên window cũng đúng.
      val targetWinY = if (isTop) topWinY else (topWinY - (entries.lastIndex - index) * stackOverlapPx()).coerceAtLeast(dp(48f).toInt() - pad)
      animateTo(mb, targetWinX, targetWinY)
    }
  }

  private fun bringToFront(key: String) {
    val mb = managed[key] ?: return
    // Optimization: nếu bubble đã ở TOP stack (case phổ biến nhất) thì không
    // cần remove+add — tránh flicker/jank ngay đầu drag mà user mô tả là
    // "kéo không mượt mà". Chỉ remove+add khi user kéo bubble ở dưới chồng.
    val topKey = BubbleStackStore.load(this).lastOrNull()?.key
    if (topKey == key) return
    try {
      wm.removeView(mb.view)
      wm.addView(mb.view, mb.params)
    } catch (_: Throwable) {}
  }

  private fun removeBubble(key: String) {
    BubbleStackStore.remove(this, key)
    removeBubbleView(key)
    ConversationCache.clear(this, key)
    cancelNotifFor(key)
    layoutStackPositions()
    // Không stopSelf — giữ service alive để nhận FCM tiếp theo (Phase 3 keep-alive).
  }

  private fun removeBubbleView(key: String) {
    val mb = managed.remove(key) ?: return
    try { wm.removeView(mb.view) } catch (_: Throwable) {}
    if (peekForKey == key) hidePeek()
  }

  private fun clearAllBubbles() {
    for (k in managed.keys.toList()) removeBubbleView(k)
    hideDropTarget()
    hidePeek()
  }

  /**
   * Đồng bộ badge từ [BubbleStackStore] vào UI (1 badge/bubble = unreadCount của
   * entry tương ứng). Gọi sau mọi thao tác có thể đổi unread:
   *  - FCM tới (incrementUnread)
   *  - User expand panel (clearUnread)
   *  - upsert/remove bubble
   */
  private fun applyUnreadBadges() {
    val entries = BubbleStackStore.load(this)
    val byKey = entries.associateBy { it.key }
    for ((k, mb) in managed) {
      val n = byKey[k]?.unreadCount ?: 0
      mb.view.setBadge(n)
    }
  }

  /** Compat alias — JS-side setBadgeCount cũ ghi vào globalBadge (không còn áp UI nữa). */
  @Suppress("unused")
  private fun applyBadgeToTop() = applyUnreadBadges()

  // ---- Peek ----

  private fun showPeek(sender: String, message: String, key: String?) {
    val targetKey = key ?: BubbleStackStore.load(this).lastOrNull()?.key
    val mb = targetKey?.let { managed[it] } ?: return
    hidePeek()
    peekForKey = targetKey
    val view = buildPeekView(sender, message)
    val params = peekLayoutParams(mb)
    try {
      wm.addView(view, params)
      peekView = view
      peekHandler.removeCallbacks(peekHideRunnable)
      peekHandler.postDelayed(peekHideRunnable, PEEK_AUTO_HIDE_MS)
    } catch (_: Throwable) {}
  }

  private fun hidePeek() {
    val v = peekView ?: return
    peekHandler.removeCallbacks(peekHideRunnable)
    try { wm.removeView(v) } catch (_: Throwable) {}
    peekView = null
    peekForKey = null
  }

  private fun buildPeekView(sender: String, message: String): View {
    val container = android.widget.LinearLayout(this).apply {
      orientation = android.widget.LinearLayout.VERTICAL
      setPadding(dp(10f).toInt(), dp(7f).toInt(), dp(10f).toInt(), dp(7f).toInt())
      background = android.graphics.drawable.GradientDrawable().apply {
        setColor(android.graphics.Color.parseColor("#EB0068FF"))
        cornerRadius = dp(10f)
      }
    }
    container.addView(android.widget.TextView(this).apply {
      text = sender
      setTextColor(android.graphics.Color.WHITE)
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      maxLines = 1
    })
    container.addView(android.widget.TextView(this).apply {
      text = message
      setTextColor(android.graphics.Color.parseColor("#E6FFFFFF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      maxLines = 2
    })
    return container
  }

  private fun peekLayoutParams(mb: ManagedBubble): WindowManager.LayoutParams {
    val type = overlayWindowType()
    val width = dp(200f).toInt()
    val visSize = bubbleVisibleSizePx()
    val pad = bubblePadPx()
    val metrics = resources.displayMetrics
    // Bubble visible top-left = window top-left + pad. Center = + winSize/2.
    val visLeft = mb.params.x + pad
    val visTop = mb.params.y + pad
    val visCx = mb.params.x + bubbleWindowSizePx() / 2
    val onLeft = visCx < metrics.widthPixels / 2
    val x = if (onLeft) visLeft + visSize + dp(6f).toInt() else visLeft - width - dp(6f).toInt()
    val y = visTop + dp(4f).toInt()
    return WindowManager.LayoutParams(
      width, WindowManager.LayoutParams.WRAP_CONTENT,
      x.coerceIn(0, metrics.widthPixels - width),
      y.coerceIn(0, metrics.heightPixels - dp(60f).toInt()),
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }
  }

  // ---- Drag ----

  /**
   * Khi user đang kéo, **không** gọi [WindowManager.updateViewLayout] — nhiều OEM
   * (Xiaomi/Oppo/Vivo) sẽ dispatch `ACTION_CANCEL` ngay khi window đổi vị trí
   * trong lúc gesture đang chạy → bubble "tịt" sau vài pixel. Thay vào đó, giữ
   * nguyên vị trí window và dịch chuyển View bằng `translationX/Y` (kết hợp
   * `FLAG_LAYOUT_NO_LIMITS` đã set ở [BubbleOverlayView.makeLayoutParams]).
   *
   * Vị trí thật được commit ở [commitDragTranslation] khi user nhả tay.
   */
  private fun moveBubble(key: String, rawX: Float, rawY: Float) {
    val mb = managed[key] ?: return
    // Bubble vẽ ở GIỮA window 180dp → muốn bubble center ở finger thì window
    // top-left = finger - windowSize/2.
    val halfWin = bubbleWindowSizePx() / 2
    val targetWinX = (rawX - halfWin).toInt()
    val targetWinY = (rawY - halfWin).toInt()
    mb.view.translationX = (targetWinX - mb.params.x).toFloat()
    mb.view.translationY = (targetWinY - mb.params.y).toFloat()
  }

  /**
   * Sau ACTION_UP, dồn translation thành vị trí window thật để các animation
   * (spring/fling) chạy từ đúng điểm bubble đang hiển thị.
   */
  private fun commitDragTranslation(key: String) {
    val mb = managed[key] ?: return
    val tx = mb.view.translationX
    val ty = mb.view.translationY
    if (tx == 0f && ty == 0f) return
    mb.params.x += tx.toInt()
    mb.params.y += ty.toInt()
    mb.view.translationX = 0f
    mb.view.translationY = 0f
    try { wm.updateViewLayout(mb.view, mb.params) } catch (_: Throwable) {}
  }

  /**
   * Đỗ bubble sau khi user thả tay:
   *  - Nếu velocity đủ lớn → FlingAnimation rồi snap mép gần nhất.
   *  - Nếu velocity nhỏ → SpringAnimation snap thẳng tới mép gần nhất.
   *  - Cuối cùng persist XY + reflow stack.
   */
  private fun settleBubble(key: String, vx: Float, vy: Float) {
    val mb = managed[key] ?: return
    val metrics = resources.displayMetrics
    val visSize = bubbleVisibleSizePx()
    val pad = bubblePadPx()
    val edge = dp(8f).toInt()
    // Bounds tính theo VISIBLE bubble, sau đó convert sang WINDOW (= visible - pad).
    val maxVisX = metrics.widthPixels - visSize - edge
    val maxVisY = metrics.heightPixels - visSize - dp(80f).toInt()
    val minVisY = dp(48f).toInt()
    val minWinX = (edge - pad).toFloat()
    val minWinY = (minVisY - pad).toFloat()
    val maxWinX = (maxVisX - pad).toFloat()
    val maxWinY = (maxVisY - pad).toFloat()
    cancelAnimations(key)

    val speed = hypot(vx.toDouble(), vy.toDouble()).toFloat()
    if (speed > dp(800f)) {
      // Fling X & Y với friction; sau khi friction xong → snap mép gần nhất
      val finX = FloatValueHolder(mb.params.x.toFloat())
      val finY = FloatValueHolder(mb.params.y.toFloat())
      val flingX = FlingAnimation(finX).apply {
        setStartVelocity(vx)
        friction = 1.1f
        setMinValue(minWinX); setMaxValue(maxWinX)
        addUpdateListener { _, value, _ ->
          mb.params.x = value.toInt(); safeUpdate(mb)
        }
        addEndListener { _, _, _, _ -> snapToEdgeSpring(mb) }
      }
      val flingY = FlingAnimation(finY).apply {
        setStartVelocity(vy)
        friction = 1.1f
        setMinValue(minWinY); setMaxValue(maxWinY)
        addUpdateListener { _, value, _ ->
          mb.params.y = value.toInt(); safeUpdate(mb)
        }
      }
      mb.flingX = flingX; mb.flingY = flingY
      flingX.start(); flingY.start()
    } else {
      snapToEdgeSpring(mb)
      // Spring Y về vị trí gần nhất hợp lệ
      animateTo(mb, mb.params.x, mb.params.y.coerceIn(minWinY.toInt(), maxWinY.toInt()))
    }
    persistTopPos()
    layoutStackPositions()
  }

  private fun snapToEdgeSpring(mb: ManagedBubble) {
    val metrics = resources.displayMetrics
    val visSize = bubbleVisibleSizePx()
    val pad = bubblePadPx()
    val edge = dp(8f).toInt()
    val mid = metrics.widthPixels / 2
    val visCx = mb.params.x + bubbleWindowSizePx() / 2
    val targetVisX = if (visCx < mid) edge else metrics.widthPixels - visSize - edge
    val targetWinX = targetVisX - pad
    animateTo(mb, targetWinX, mb.params.y)
    persistTopPos()
  }

  private fun animateTo(mb: ManagedBubble, x: Int, y: Int) {
    cancelAnimations(mb.key)
    val sxHolder = FloatValueHolder(mb.params.x.toFloat())
    val syHolder = FloatValueHolder(mb.params.y.toFloat())
    val sx = SpringAnimation(sxHolder).apply {
      spring = SpringForce(x.toFloat()).apply {
        stiffness = SpringForce.STIFFNESS_LOW
        dampingRatio = SpringForce.DAMPING_RATIO_LOW_BOUNCY
      }
      addUpdateListener { _, value, _ -> mb.params.x = value.toInt(); safeUpdate(mb) }
    }
    val sy = SpringAnimation(syHolder).apply {
      spring = SpringForce(y.toFloat()).apply {
        stiffness = SpringForce.STIFFNESS_LOW
        dampingRatio = SpringForce.DAMPING_RATIO_LOW_BOUNCY
      }
      addUpdateListener { _, value, _ -> mb.params.y = value.toInt(); safeUpdate(mb) }
    }
    mb.springX = sx; mb.springY = sy
    sx.start(); sy.start()
  }

  private fun cancelAnimations(key: String) {
    val mb = managed[key] ?: return
    mb.springX?.cancel(); mb.springX = null
    mb.springY?.cancel(); mb.springY = null
    mb.flingX?.cancel(); mb.flingX = null
    mb.flingY?.cancel(); mb.flingY = null
  }

  private fun safeUpdate(mb: ManagedBubble) {
    try { wm.updateViewLayout(mb.view, mb.params) } catch (_: Throwable) {}
  }

  private fun persistTopPos() {
    val topKey = BubbleStackStore.load(this).lastOrNull()?.key ?: return
    val mb = managed[topKey] ?: return
    val pad = bubblePadPx()
    // Lưu VISIBLE bubble top-left (= window top-left + pad). Semantic ổn định
    // qua các lần đổi window size sau này.
    prefs.edit()
      .putInt(KEY_TOP_X, mb.params.x + pad)
      .putInt(KEY_TOP_Y, mb.params.y + pad)
      .apply()
  }

  private fun showDropTarget() {
    if (dropTargetView != null) return
    val ringSizePx = dp(76f).toInt()
    val ring = FrameLayout(this).apply {
      background = android.graphics.drawable.GradientDrawable().apply {
        shape = android.graphics.drawable.GradientDrawable.OVAL
        setColor(android.graphics.Color.parseColor("#33EF4444"))
        setStroke(dp(2f).toInt(), android.graphics.Color.parseColor("#A0EF4444"))
      }
      addView(android.widget.TextView(this@OverlayBubbleService).apply {
        text = "×"
        setTextColor(android.graphics.Color.parseColor("#DC2626"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 32f)
        gravity = Gravity.CENTER
      }, FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ))
    }
    val container = android.widget.LinearLayout(this).apply {
      orientation = android.widget.LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      addView(
        android.widget.TextView(this@OverlayBubbleService).apply {
          text = "Thả vào đây để đóng"
          setTextColor(android.graphics.Color.parseColor("#DC2626"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          typeface = android.graphics.Typeface.DEFAULT_BOLD
          gravity = Gravity.CENTER
        },
        android.widget.LinearLayout.LayoutParams(
          android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
          android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(6f).toInt() },
      )
      addView(
        ring,
        android.widget.LinearLayout.LayoutParams(ringSizePx, ringSizePx),
      )
      scaleX = 0.6f; scaleY = 0.6f; alpha = 0f
      animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(180).start()
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      0, dp(80f).toInt(),
      overlayWindowType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL }
    try {
      wm.addView(container, params)
      dropTargetView = container
    } catch (_: Throwable) {}
  }

  /** Tâm drop target trên màn (raw screen coords) — dùng cho hit-test & magnetic. */
  private fun dropCenter(): Pair<Float, Float> {
    val metrics = resources.displayMetrics
    val realH = getRealScreenHeightPx()
    val w = metrics.widthPixels
    val centerX = w / 2f
    val centerY = realH - dp(80f) - dp(38f)
    return centerX to centerY
  }

  private fun distanceToDropCenter(rawX: Float, rawY: Float): Float {
    val (cx, cy) = dropCenter()
    return hypot((rawX - cx).toDouble(), (rawY - cy).toDouble()).toFloat()
  }

  private var lastVibrateAt = 0L
  private var lastMagneticFactor = 1f
  private fun magneticFeedback(distance: Float) {
    val threshold = dp(120f)
    val container = dropTargetView ?: return
    val targetFactor = if (distance < threshold) {
      (1.0f + (1.0f - (distance / threshold)) * 0.3f).coerceIn(1f, 1.3f)
    } else 1f
    // Chỉ update khi factor thật sự thay đổi đáng kể (>2%) — `animate()` được
    // gọi mỗi 16ms nếu không gate sẽ queue animation chồng chất gây jank trên
    // máy yếu, làm bubble drag GIẬT (đây có thể là nguồn của "không mượt mà").
    if (kotlin.math.abs(targetFactor - lastMagneticFactor) > 0.02f) {
      lastMagneticFactor = targetFactor
      container.animate().cancel()
      container.animate().scaleX(targetFactor).scaleY(targetFactor)
        .setDuration(if (targetFactor > 1f) 60 else 80).start()
    }
    if (distance < dp(80f)) {
      val now = System.currentTimeMillis()
      if (now - lastVibrateAt > 220) {
        lastVibrateAt = now
        vibrateLight()
      }
    }
  }

  private fun vibrateLight() {
    try {
      val vib = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vib.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION") vib.vibrate(20)
      }
    } catch (_: Throwable) {}
  }

  private fun hideDropTarget() {
    val v = dropTargetView ?: return
    try { wm.removeView(v) } catch (_: Throwable) {}
    dropTargetView = null
    lastMagneticFactor = 1f
  }

  private fun isOverDropTarget(rawX: Float, rawY: Float): Boolean {
    val realH = getRealScreenHeightPx()
    val displayH = resources.displayMetrics.heightPixels
    val yThresh = (minOf(realH, displayH)) * 0.65f
    // Bubble visible center y = window y + translation y + windowSize/2 (vì
    // bubble vẽ ở GIỮA window).
    val key = draggingKey
    val mb = key?.let { managed[it] }
    val winSize = bubbleWindowSizePx()
    val bubbleCy = mb?.let { (it.params.y + it.view.translationY) + winSize / 2f } ?: rawY
    return rawY >= yThresh || bubbleCy >= yThresh
  }

  // ---- Avatar ----

  private val loadedAvatars = java.util.concurrent.ConcurrentHashMap<String, android.graphics.Bitmap>()
  private val ioExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()
  private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

  private fun loadAvatarAsync(url: String, target: BubbleOverlayView) {
    loadedAvatars[url]?.let {
      target.setAvatarBitmap(it)
      return
    }
    ioExecutor.execute {
      val bmp = fetchBitmap(url) ?: return@execute
      loadedAvatars[url] = bmp
      mainHandler.post { target.setAvatarBitmap(bmp) }
    }
  }

  private fun fetchBitmap(url: String): android.graphics.Bitmap? {
    return try {
      val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
      conn.connectTimeout = 8000
      conn.readTimeout = 10000
      conn.instanceFollowRedirects = true
      val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null)
      if (!token.isNullOrBlank()) conn.setRequestProperty("Authorization", "Bearer $token")
      conn.inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }
    } catch (_: Throwable) {
      null
    }
  }

  private fun getRealScreenHeightPx(): Int = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      wm.maximumWindowMetrics.bounds.height()
    } else {
      val metrics = android.util.DisplayMetrics()
      @Suppress("DEPRECATION")
      wm.defaultDisplay.getRealMetrics(metrics)
      metrics.heightPixels
    }
  } catch (_: Throwable) {
    resources.displayMetrics.heightPixels
  }

  // ---- Tap → MỞ KHUNG CHAT NỔI (native overlay panel) ----

  private fun handleTap(key: String) {
    prefs.edit()
      .putString(KEY_PENDING_GROUP, key)
      .putString(KEY_LAST_BUBBLE_KEY, key)
      .apply()
    if (isKeyguardLocked()) return
    expand(key)
  }

  fun expand(key: String) {
    hidePeek()
    expandedPanel.show(wm, key)
    activeExpandedKey = key
    // Ẩn các bong bóng vật lý — UI bubble row hiện thị bên trong panel
    for (mb in managed.values) mb.view.visibility = View.INVISIBLE
    hideDropTarget()
    // Native tự fetch lịch sử — không phụ thuộc React (kể cả khi app đã tắt).
    ChatHistoryFetcher.seedAsync(this, key) { count ->
      if (count > 0 && expandedPanel.isShowing() && expandedPanel.currentKey() == key) {
        expandedPanel.onIncoming(key)
      }
    }
    cancelNotifFor(key)
    markConversationRead(key)
    // Badge per-bubble: reset chỉ RIÊNG conv đang mở về 0 (các bubble khác giữ
    // nguyên unread của họ). Sau đó refresh UI ngay.
    BubbleStackStore.clearUnread(this, key)
    applyUnreadBadges()
    notifyPanelOpened(key)
  }

  private fun cancelNotifFor(key: String) {
    try {
      val notifId = 0x42_00_00_00 or (key.hashCode() and 0xFFFFFF)
      androidx.core.app.NotificationManagerCompat.from(this).cancel(notifId)
    } catch (_: Throwable) {}
  }

  private val readMarkExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()
  private fun markConversationRead(key: String) {
    val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null) ?: return
    val origin = prefs.getString(FloatingBubbleModule.KEY_API_ORIGIN, null)?.trimEnd('/') ?: return
    val path = if (key.startsWith("lead:")) {
      // Lead chat dùng PATCH /api/crm/leads/:id/read (nếu có; tránh fail bằng try)
      "/api/crm/leads/${key.removePrefix("lead:")}/read"
    } else {
      "/api/messenger/groups/$key/read"
    }
    readMarkExecutor.execute {
      try {
        val conn = java.net.URL("$origin$path").openConnection() as java.net.HttpURLConnection
        conn.requestMethod = "PATCH"
        conn.connectTimeout = 8000
        conn.readTimeout = 10000
        conn.doOutput = false
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Accept", "application/json")
        conn.responseCode // trigger
      } catch (_: Throwable) {
        // Một số endpoint chưa có → bỏ qua im lặng
      }
    }
  }

  /** Gửi event qua React để JS fetch messages và seed cache. */
  private fun notifyPanelOpened(key: String) {
    try {
      val app = applicationContext as? MainApplication ?: return
      val rim = app.reactNativeHost.reactInstanceManager
      val ctx = rim.currentReactContext ?: return
      val params = com.facebook.react.bridge.Arguments.createMap().apply {
        putString("key", key)
      }
      ctx.getJSModule(
        com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java,
      ).emit("BubblePanelOpened", params)
    } catch (_: Throwable) {}
  }

  /** JS gọi để nạp/cập nhật danh sách tin nhắn cho 1 conversation. */
  fun seedMessages(key: String, msgs: List<ConversationCache.Msg>) {
    ConversationCache.clear(this, key)
    for (m in msgs) ConversationCache.append(this, key, m)
    if (expandedPanel.isShowing() && expandedPanel.currentKey() == key) {
      expandedPanel.onIncoming(key)
    }
  }

  fun collapsePanel() {
    if (!expandedPanel.isShowing()) return
    expandedPanel.hide(wm)
    activeExpandedKey = null
    for (mb in managed.values) mb.view.visibility = View.VISIBLE
    layoutStackPositions()
  }

  /**
   * Ẩn TẠM panel + tất cả bong bóng overlay để Activity bên ngoài (camera, file
   * picker, gallery) có thể hiển thị mà không bị che (overlay window luôn nằm
   * trên Activity).
   *
   * State được giữ — gọi [showOverlayBack] để khôi phục đúng những gì đang mở.
   */
  private var hiddenPanelKey: String? = null
  private var overlayHiddenForExternal = false

  fun hideOverlayTemporarily() {
    if (overlayHiddenForExternal) return
    overlayHiddenForExternal = true
    hiddenPanelKey = if (expandedPanel.isShowing()) expandedPanel.currentKey() else null
    if (expandedPanel.isShowing()) {
      try { expandedPanel.hide(wm) } catch (_: Throwable) {}
    }
    for (mb in managed.values) mb.view.visibility = View.INVISIBLE
    hideDropTarget()
    hidePeek()
  }

  fun showOverlayBack() {
    if (!overlayHiddenForExternal) return
    overlayHiddenForExternal = false
    for (mb in managed.values) mb.view.visibility = View.VISIBLE
    val key = hiddenPanelKey
    hiddenPanelKey = null
    if (key != null) {
      try { expand(key) } catch (_: Throwable) {}
    }
  }

  fun switchPanelTo(key: String) {
    expandedPanel.switchTo(key)
  }

  fun dismissBubbleAndPanel(key: String) {
    val entries = BubbleStackStore.remove(this, key)
    removeBubbleView(key)
    ConversationCache.clear(this, key)
    if (entries.isEmpty()) {
      collapsePanel()
      stopSelf()
    } else {
      // Switch sang conversation kế tiếp
      expandedPanel.switchTo(entries.last().key)
    }
  }

  fun openInAppAndCollapse(key: String) {
    prefs.edit().putString(KEY_PENDING_GROUP, key).apply()
    collapsePanel()
    launchMainActivity()
  }

  /**
   * Long-press bubble → menu:
   *  - Đóng tin (xoá khỏi stack)
   *  - Mở trong app (full chat)
   *  - Tắt toàn bộ bong bóng
   */
  private fun handleLongPress(key: String) {
    val mb = managed[key] ?: return
    val popupRoot = android.widget.LinearLayout(this).apply {
      orientation = android.widget.LinearLayout.VERTICAL
      background = android.graphics.drawable.GradientDrawable().apply {
        setColor(android.graphics.Color.WHITE)
        cornerRadius = dp(10f)
        setStroke(1, android.graphics.Color.parseColor("#E5E7EB"))
      }
      elevation = dp(8f)
    }
    val popup = android.widget.PopupWindow(
      popupRoot,
      android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
      android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
      true,
    )
    popup.isOutsideTouchable = true
    popup.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT))

    fun item(label: String, onClick: () -> Unit) = android.widget.TextView(this).apply {
      text = label
      setTextColor(android.graphics.Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(dp(14f).toInt(), dp(10f).toInt(), dp(14f).toInt(), dp(10f).toInt())
      setOnClickListener { onClick(); popup.dismiss() }
    }
    popupRoot.addView(item("Mở chat") { handleTap(key) })
    popupRoot.addView(item("Mở trong app") { openInAppAndCollapse(key) })
    popupRoot.addView(item("Đóng bong bóng này") { removeBubble(key) })
    popupRoot.addView(item("Tắt toàn bộ") { clearAllBubbles(); BubbleStackStore.clear(this); stopSelf() })

    val loc = IntArray(2)
    mb.view.getLocationOnScreen(loc)
    try {
      popup.showAtLocation(mb.view, Gravity.NO_GRAVITY, loc[0] - dp(120f).toInt(), loc[1])
    } catch (_: Throwable) {}
  }

  private fun launchMainActivity() {
    val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
      )
    } ?: return
    try { startActivity(intent) } catch (_: Throwable) {}
  }

  private fun isKeyguardLocked(): Boolean = try {
    val km = getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
    km.isKeyguardLocked
  } catch (_: Throwable) {
    false
  }

  private fun overlayWindowType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  private fun canDrawOverlays(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) android.provider.Settings.canDrawOverlays(this) else true

  private fun dp(v: Float): Float =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

  private fun clamp(v: Int, min: Int, max: Int): Int = max(min, min(max, v))

  companion object {
    const val CHANNEL_ID = "crm_bubble_overlay_channel"
    const val NOTIF_ID = 0xB0B
    const val PREFS = "crm_floating_bubble_prefs"
    const val KEY_PENDING_GROUP = "pending_group"
    const val KEY_LAST_BUBBLE_KEY = "last_bubble_key"
    const val KEY_TOP_X = "bubble_pos_x"
    const val KEY_TOP_Y = "bubble_pos_y"

    const val ACTION_SHOW_BUBBLE = "vn.tubeppro.crmobile.bubble.SHOW"
    const val ACTION_HIDE_BUBBLE = "vn.tubeppro.crmobile.bubble.HIDE"
    const val ACTION_UPDATE_BADGE = "vn.tubeppro.crmobile.bubble.BADGE"
    const val ACTION_SHOW_PEEK = "vn.tubeppro.crmobile.bubble.PEEK"
    const val ACTION_RESTORE_STACK = "vn.tubeppro.crmobile.bubble.RESTORE"
    const val ACTION_EXPAND = "vn.tubeppro.crmobile.bubble.EXPAND"
    const val ACTION_COLLAPSE = "vn.tubeppro.crmobile.bubble.COLLAPSE"
    const val ACTION_REFRESH_PANEL = "vn.tubeppro.crmobile.bubble.REFRESH_PANEL"
    const val ACTION_STOP = "vn.tubeppro.crmobile.bubble.STOP"
    const val ACTION_KEEP_ALIVE = "vn.tubeppro.crmobile.bubble.KEEP_ALIVE"
    const val ACTION_HIDE_FOR_EXTERNAL = "vn.tubeppro.crmobile.bubble.HIDE_FOR_EXTERNAL"
    const val ACTION_SHOW_AFTER_EXTERNAL = "vn.tubeppro.crmobile.bubble.SHOW_AFTER_EXTERNAL"

    const val EXTRA_KEY = "key"
    const val EXTRA_TITLE = "title"
    const val EXTRA_AVATAR_LETTER = "avatar"
    const val EXTRA_AVATAR_URL = "avatar_url"
    const val EXTRA_BADGE = "badge"
    const val EXTRA_PEEK_SENDER = "peek_sender"
    const val EXTRA_PEEK_MESSAGE = "peek_message"
    const val EXTRA_INC_UNREAD = "inc_unread"

    const val PEEK_AUTO_HIDE_MS = 4500L

    /** Bubble key đang được mở rộng (panel native overlay) — null nếu không. */
    @Volatile var activeExpandedKey: String? = null

    fun startWithBubble(
      ctx: Context,
      key: String,
      title: String,
      letter: String,
      avatarUrl: String? = null,
      sender: String? = null,
      message: String? = null,
      /** true → +1 unread cho bubble (chỉ khi user không đang xem panel của conv này). */
      incrementUnread: Boolean = false,
    ) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply {
        action = ACTION_SHOW_BUBBLE
        putExtra(EXTRA_KEY, key)
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_AVATAR_LETTER, letter)
        if (!avatarUrl.isNullOrBlank()) putExtra(EXTRA_AVATAR_URL, avatarUrl)
        if (!sender.isNullOrBlank()) putExtra(EXTRA_PEEK_SENDER, sender)
        if (!message.isNullOrBlank()) putExtra(EXTRA_PEEK_MESSAGE, message)
        putExtra(EXTRA_INC_UNREAD, incrementUnread)
      }
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    fun restoreStack(ctx: Context) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply { action = ACTION_RESTORE_STACK }
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    /**
     * Khởi động service ở chế độ chỉ keep-alive (không show bubble).
     * Gọi từ MainApplication.onCreate / Boot receiver / FCM onNewToken.
     * Mục đích: trên Android 12+ service phải đã alive khi FCM tới, nếu không
     * BackgroundServiceStartNotAllowedException sẽ chặn `startForegroundService`.
     */
    /**
     * Ẩn TẠM mọi UI overlay (panel + bubbles + peek) để Activity bên ngoài
     * (camera, file picker) hiển thị mà không bị che. Gọi `requestShowOverlay`
     * sau khi Activity kết thúc.
     */
    fun requestHideOverlay(ctx: Context) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply {
        action = ACTION_HIDE_FOR_EXTERNAL
      }
      try { androidx.core.content.ContextCompat.startForegroundService(ctx, i) } catch (_: Throwable) {}
    }

    fun requestShowOverlay(ctx: Context) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply {
        action = ACTION_SHOW_AFTER_EXTERNAL
      }
      try { androidx.core.content.ContextCompat.startForegroundService(ctx, i) } catch (_: Throwable) {}
    }

    fun startKeepAlive(ctx: Context) {
      // Chỉ start nếu user đã grant overlay (nếu chưa thì service vẫn lên nhưng
      // sẽ stopSelf khi cố addView — không sao, chỉ phí 1 vài ms).
      try {
        val i = Intent(ctx, OverlayBubbleService::class.java).apply { action = ACTION_KEEP_ALIVE }
        androidx.core.content.ContextCompat.startForegroundService(ctx, i)
      } catch (_: Throwable) { /* ignore */ }
    }

    fun hide(ctx: Context, key: String?) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply {
        action = ACTION_HIDE_BUBBLE
        if (key != null) putExtra(EXTRA_KEY, key)
      }
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    fun updateBadge(ctx: Context, n: Int) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply {
        action = ACTION_UPDATE_BADGE
        putExtra(EXTRA_BADGE, n)
      }
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    fun showPeek(ctx: Context, sender: String, message: String, bubbleKey: String? = null) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply {
        action = ACTION_SHOW_PEEK
        putExtra(EXTRA_PEEK_SENDER, sender)
        putExtra(EXTRA_PEEK_MESSAGE, message)
        if (bubbleKey != null) putExtra(EXTRA_KEY, bubbleKey)
      }
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    fun stop(ctx: Context) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply { action = ACTION_STOP }
      try { ctx.startService(i) } catch (_: Throwable) {
        ctx.stopService(Intent(ctx, OverlayBubbleService::class.java))
      }
    }

    /**
     * Mark-read một conversation (lead hoặc messenger group) — gọi được từ
     * BroadcastReceiver / FCM service mà không cần instance.
     */
    private val staticReadExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()
    fun markConversationReadAsync(ctx: Context, bubbleKey: String) {
      val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val token = prefs.getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null) ?: return
      val origin = prefs.getString(FloatingBubbleModule.KEY_API_ORIGIN, null)?.trimEnd('/') ?: return
      val path = if (bubbleKey.startsWith("lead:")) {
        "/api/crm/leads/${bubbleKey.removePrefix("lead:")}/read"
      } else {
        "/api/messenger/groups/$bubbleKey/read"
      }
      staticReadExecutor.execute {
        try {
          val conn = java.net.URL("$origin$path").openConnection() as java.net.HttpURLConnection
          conn.requestMethod = "PATCH"
          conn.connectTimeout = 8000
          conn.readTimeout = 10000
          conn.setRequestProperty("Authorization", "Bearer $token")
          conn.setRequestProperty("Accept", "application/json")
          conn.responseCode
        } catch (_: Throwable) { /* ignore */ }
      }
    }
  }
}
