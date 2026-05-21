package vn.tubeppro.crmobile

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
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.core.app.NotificationCompat
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

  private data class ManagedBubble(
    val key: String,
    val view: BubbleOverlayView,
    var params: WindowManager.LayoutParams,
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
        if (!sender.isNullOrBlank() && !message.isNullOrBlank()) {
          ConversationCache.append(
            this, key,
            ConversationCache.Msg(sender, message, avatarUrl, System.currentTimeMillis()),
          )
          // Nếu panel đang mở cho conversation này → refresh ngay
          if (expandedPanel.isShowing()) expandedPanel.onIncoming(key)
        }
        val entries = BubbleStackStore.upsert(
          this,
          BubbleStackStore.Entry(key, title, letter, avatarUrl),
        )
        renderStack(entries, loadAvatarForKey = key, loadAvatarUrl = avatarUrl)
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
        showPeek(sender, message, key)
      }
      ACTION_RESTORE_STACK -> {
        renderStack(BubbleStackStore.load(this))
      }
      ACTION_STOP -> {
        clearAllBubbles()
        BubbleStackStore.clear(this)
        stopSelf()
      }
    }
    return START_STICKY
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

  private fun bubbleSizePx(): Int = dp(52f).toInt()
  private fun stackOverlapPx(): Int = dp(16f).toInt()

  private fun renderStack(
    entries: List<BubbleStackStore.Entry>,
    loadAvatarForKey: String? = null,
    loadAvatarUrl: String? = null,
  ) {
    if (!canDrawOverlays()) {
      stopSelf()
      return
    }
    val sizePx = bubbleSizePx()
    val keysInStack = entries.map { it.key }.toSet()
    // Gỡ bubble không còn trong store
    val toRemove = managed.keys.filter { it !in keysInStack }
    for (k in toRemove) removeBubbleView(k)

    val metrics = resources.displayMetrics
    val edgeX = metrics.widthPixels - sizePx - dp(10f).toInt()
    val baseY = (metrics.heightPixels * 0.55f).toInt()

    entries.forEachIndexed { index, entry ->
      val y = (baseY - index * stackOverlapPx()).coerceAtLeast(dp(48f).toInt())
      val mb = managed[entry.key]
      if (mb != null) {
        mb.view.setAvatarLetter(entry.letter)
        mb.params.x = edgeX
        mb.params.y = y
        try { wm.updateViewLayout(mb.view, mb.params) } catch (_: Throwable) {}
        if (globalBadge > 0 && index == entries.lastIndex) mb.view.setBadge(globalBadge)
        else if (index != entries.lastIndex) mb.view.setBadge(0)
        if (!entry.avatarUrl.isNullOrBlank()) loadAvatarAsync(entry.avatarUrl, mb.view)
      } else {
        attachBubble(entry, edgeX, y, sizePx, isTop = index == entries.lastIndex)
      }
      if (entry.key == loadAvatarForKey && !loadAvatarUrl.isNullOrBlank()) {
        managed[entry.key]?.let { loadAvatarAsync(loadAvatarUrl, it.view) }
      }
    }
    applyBadgeToTop()
    if (peekForKey != null && peekForKey !in managed) hidePeek()
  }

  private fun attachBubble(entry: BubbleStackStore.Entry, x: Int, y: Int, sizePx: Int, isTop: Boolean) {
    val view = BubbleOverlayView(this, object : BubbleOverlayView.Callback {
      override fun onTap() = handleTap(entry.key)
      override fun onLongPress() = handleLongPress(entry.key)
      override fun onDragStart() {
        draggingKey = entry.key
        bringToFront(entry.key)
        showDropTarget()
      }
      override fun onDragMove(rawX: Float, rawY: Float) = moveBubble(entry.key, rawX, rawY, sizePx)
      override fun onDragEnd(rawX: Float, rawY: Float, droppedToDismiss: Boolean) {
        // QUAN TRỌNG: kiểm tra drop trước khi reset draggingKey,
        // vì isOverDropTarget cần draggingKey để xác định vị trí bubble.
        val dropped = isOverDropTarget(rawX, rawY, sizePx)
        draggingKey = null
        hideDropTarget()
        if (dropped) {
          removeBubble(entry.key)
        } else {
          snapBubbleToEdge(entry.key, sizePx)
          layoutStackPositions()
        }
      }
    }).apply {
      setAvatarLetter(entry.letter)
      if (isTop && globalBadge > 0) setBadge(globalBadge)
    }
    val params = BubbleOverlayView.makeLayoutParams(sizePx, x, y)
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
    val sizePx = bubbleSizePx()
    val metrics = resources.displayMetrics
    val edgeX = metrics.widthPixels - sizePx - dp(10f).toInt()
    val baseY = (metrics.heightPixels * 0.55f).toInt()
    entries.forEachIndexed { index, entry ->
      val mb = managed[entry.key] ?: return@forEachIndexed
      mb.params.x = edgeX
      mb.params.y = (baseY - index * stackOverlapPx()).coerceAtLeast(dp(48f).toInt())
      try { wm.updateViewLayout(mb.view, mb.params) } catch (_: Throwable) {}
    }
  }

  private fun bringToFront(key: String) {
    val mb = managed[key] ?: return
    try {
      wm.removeView(mb.view)
      wm.addView(mb.view, mb.params)
    } catch (_: Throwable) {}
  }

  private fun removeBubble(key: String) {
    BubbleStackStore.remove(this, key)
    removeBubbleView(key)
    layoutStackPositions()
    if (managed.isEmpty()) stopSelf()
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

  private fun applyBadgeToTop() {
    val topKey = BubbleStackStore.load(this).lastOrNull()?.key
    for ((k, mb) in managed) {
      mb.view.setBadge(if (k == topKey && globalBadge > 0) globalBadge else 0)
    }
  }

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
    val sizePx = bubbleSizePx()
    val metrics = resources.displayMetrics
    val onLeft = mb.params.x + sizePx / 2 < metrics.widthPixels / 2
    val x = if (onLeft) mb.params.x + sizePx + dp(6f).toInt() else mb.params.x - width - dp(6f).toInt()
    val y = mb.params.y + dp(4f).toInt()
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

  private fun moveBubble(key: String, rawX: Float, rawY: Float, sizePx: Int) {
    val mb = managed[key] ?: return
    val metrics = resources.displayMetrics
    val half = sizePx / 2
    mb.params.x = clamp((rawX - half).toInt(), 0, metrics.widthPixels - sizePx)
    mb.params.y = clamp((rawY - half).toInt(), 0, metrics.heightPixels - sizePx)
    try { wm.updateViewLayout(mb.view, mb.params) } catch (_: Throwable) {}
  }

  private fun snapBubbleToEdge(key: String, sizePx: Int) {
    val mb = managed[key] ?: return
    val metrics = resources.displayMetrics
    val edge = dp(8f).toInt()
    val mid = metrics.widthPixels / 2
    mb.params.x = if (mb.params.x + sizePx / 2 < mid) edge else metrics.widthPixels - sizePx - edge
    try { wm.updateViewLayout(mb.view, mb.params) } catch (_: Throwable) {}
  }

  private fun showDropTarget() {
    if (dropTargetView != null) return
    val sizePx = dp(72f).toInt()
    val container = FrameLayout(this).apply {
      background = android.graphics.drawable.GradientDrawable().apply {
        shape = android.graphics.drawable.GradientDrawable.OVAL
        setColor(android.graphics.Color.parseColor("#33EF4444"))
        setStroke(dp(2f).toInt(), android.graphics.Color.parseColor("#A0EF4444"))
      }
      addView(android.widget.TextView(this@OverlayBubbleService).apply {
        text = "×"
        setTextColor(android.graphics.Color.parseColor("#DC2626"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
        gravity = Gravity.CENTER
      }, FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ))
    }
    val params = WindowManager.LayoutParams(
      sizePx, sizePx, 0, dp(80f).toInt(),
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

  private fun hideDropTarget() {
    val v = dropTargetView ?: return
    try { wm.removeView(v) } catch (_: Throwable) {}
    dropTargetView = null
  }

  private fun isOverDropTarget(rawX: Float, rawY: Float, sizePx: Int): Boolean {
    val realH = getRealScreenHeightPx()
    val displayH = resources.displayMetrics.heightPixels
    val yThresh = (minOf(realH, displayH)) * 0.65f
    // Chỉ cần ngón tay HOẶC tâm bubble nằm trong 35% dưới màn là xóa.
    val key = draggingKey
    val mb = key?.let { managed[it] }
    val bubbleCy = mb?.let { it.params.y + sizePx / 2f } ?: rawY
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
    // Ẩn các bong bóng vật lý — UI bubble row hiện thị bên trong panel
    for (mb in managed.values) mb.view.visibility = View.INVISIBLE
    hideDropTarget()
    // Native tự fetch lịch sử — không phụ thuộc React (kể cả khi app đã tắt).
    ChatHistoryFetcher.seedAsync(this, key) { count ->
      if (count > 0 && expandedPanel.isShowing() && expandedPanel.currentKey() == key) {
        expandedPanel.onIncoming(key)
      }
    }
    // Vẫn phát event để app đang chạy có thể seed thêm / mark read.
    notifyPanelOpened(key)
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
    for (mb in managed.values) mb.view.visibility = View.VISIBLE
    layoutStackPositions()
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

  private fun handleLongPress(@Suppress("UNUSED_PARAMETER") key: String) {}

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

    const val ACTION_SHOW_BUBBLE = "vn.tubeppro.crmobile.bubble.SHOW"
    const val ACTION_HIDE_BUBBLE = "vn.tubeppro.crmobile.bubble.HIDE"
    const val ACTION_UPDATE_BADGE = "vn.tubeppro.crmobile.bubble.BADGE"
    const val ACTION_SHOW_PEEK = "vn.tubeppro.crmobile.bubble.PEEK"
    const val ACTION_RESTORE_STACK = "vn.tubeppro.crmobile.bubble.RESTORE"
    const val ACTION_EXPAND = "vn.tubeppro.crmobile.bubble.EXPAND"
    const val ACTION_COLLAPSE = "vn.tubeppro.crmobile.bubble.COLLAPSE"
    const val ACTION_REFRESH_PANEL = "vn.tubeppro.crmobile.bubble.REFRESH_PANEL"
    const val ACTION_STOP = "vn.tubeppro.crmobile.bubble.STOP"

    const val EXTRA_KEY = "key"
    const val EXTRA_TITLE = "title"
    const val EXTRA_AVATAR_LETTER = "avatar"
    const val EXTRA_AVATAR_URL = "avatar_url"
    const val EXTRA_BADGE = "badge"
    const val EXTRA_PEEK_SENDER = "peek_sender"
    const val EXTRA_PEEK_MESSAGE = "peek_message"

    const val PEEK_AUTO_HIDE_MS = 4500L

    fun startWithBubble(
      ctx: Context,
      key: String,
      title: String,
      letter: String,
      avatarUrl: String? = null,
      sender: String? = null,
      message: String? = null,
    ) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply {
        action = ACTION_SHOW_BUBBLE
        putExtra(EXTRA_KEY, key)
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_AVATAR_LETTER, letter)
        if (!avatarUrl.isNullOrBlank()) putExtra(EXTRA_AVATAR_URL, avatarUrl)
        if (!sender.isNullOrBlank()) putExtra(EXTRA_PEEK_SENDER, sender)
        if (!message.isNullOrBlank()) putExtra(EXTRA_PEEK_MESSAGE, message)
      }
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    fun restoreStack(ctx: Context) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply { action = ACTION_RESTORE_STACK }
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
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
  }
}
