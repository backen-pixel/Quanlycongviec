package vn.tubeppro.crmobilev2.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Outline
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlin.math.abs
import kotlin.math.hypot
import vn.tubeppro.crmobilev2.MainActivity
import vn.tubeppro.crmobilev2.R
import java.net.URL

class OverlayBubbleService : Service() {
  private var windowManager: WindowManager? = null
  private var bubbleRoot: FrameLayout? = null
  private var peekRoot: LinearLayout? = null
  private var badgeView: TextView? = null
  private var letterView: TextView? = null
  private var avatarView: ImageView? = null
  private var avatarClipHost: FrameLayout? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var badgeCount = 0
  private var bubbleLetter = "?"
  private var bubbleTitle = "Chat"
  private var bubbleGroupId = ""
  private var bubbleAvatarUrl = ""
  private var callOverlayCallId = ""
  private var chatPanel: OverlayChatPanel? = null
  private val handler = Handler(Looper.getMainLooper())
  private var peekHideRunnable: Runnable? = null
  private var foregroundStarted = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        removeOverlay()
        stopForeground(STOP_FOREGROUND_REMOVE)
        foregroundStarted = false
        stopSelf()
        return START_NOT_STICKY
      }
    }
    startAsForeground()
    when (intent?.action) {
      ACTION_SET_BADGE -> {
        badgeCount = intent.getIntExtra(EXTRA_BADGE, 0).coerceAtLeast(0)
        saveBadgeToPrefs()
        if (badgeCount > 0 && bubbleRoot == null && !isBubbleDismissed()) {
          ensureOverlay()
        }
        updateBadge()
        return START_STICKY
      }
      ACTION_SHOW_BUBBLE -> {
        bubbleGroupId = intent.getStringExtra(EXTRA_GROUP_ID).orEmpty()
        bubbleTitle = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "Chat" }
        bubbleLetter = intent.getStringExtra(EXTRA_LETTER).orEmpty().ifBlank { "?" }
        bubbleAvatarUrl = intent.getStringExtra(EXTRA_AVATAR_URL).orEmpty()
        if (intent.getBooleanExtra(EXTRA_INCREMENT_BADGE, false)) {
          incrementBadgeCount()
        }
        prefs().edit().remove(PREF_BUBBLE_DISMISSED).apply()
        ensureOverlay()
        updateBubbleContent()
        return START_STICKY
      }
      ACTION_SHOW_PEEK -> {
        val sender = intent.getStringExtra(EXTRA_SENDER).orEmpty()
        val message = intent.getStringExtra(EXTRA_MESSAGE).orEmpty()
        val gid = intent.getStringExtra(EXTRA_GROUP_ID).orEmpty()
        if (gid.isNotBlank()) bubbleGroupId = gid
        if (intent.getBooleanExtra(EXTRA_INCREMENT_BADGE, true)) {
          incrementBadgeCount()
        }
        if (bubbleRoot == null) ensureOverlay()
        showPeek(sender, message)
        return START_STICKY
      }
      ACTION_SHOW_CALL_OVERLAY -> {
        val callId = intent.getStringExtra(EXTRA_CALL_ID).orEmpty()
        val fromName = intent.getStringExtra(EXTRA_CALL_FROM).orEmpty()
        val kind = intent.getStringExtra(EXTRA_CALL_KIND).orEmpty().ifBlank { "audio" }
        val isGroup = intent.getBooleanExtra(EXTRA_CALL_IS_GROUP, false)
        val groupName = intent.getStringExtra(EXTRA_CALL_GROUP_NAME).orEmpty()
        if (callId.isBlank()) return START_STICKY
        callOverlayCallId = callId
        if (bubbleRoot == null) ensureOverlay()
        showCallPeek(fromName, kind, isGroup, groupName)
        return START_STICKY
      }
      ACTION_HIDE_CALL_OVERLAY -> {
        val callId = intent.getStringExtra(EXTRA_CALL_ID).orEmpty()
        if (callId.isBlank() || callId == callOverlayCallId) {
          callOverlayCallId = ""
          removePeek()
        }
        return START_STICKY
      }
      ACTION_OPEN_CHAT_PANEL -> {
        val gid = intent.getStringExtra(EXTRA_GROUP_ID).orEmpty()
        val t = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        if (gid.isNotBlank()) {
          bubbleGroupId = gid
          if (t.isNotBlank()) bubbleTitle = t
        }
        openChatPanel()
        return START_STICKY
      }
      ACTION_CLOSE_CHAT_PANEL -> {
        closeChatPanel()
        return START_STICKY
      }
      ACTION_SEED_MESSAGES -> {
        val gid = intent.getStringExtra(EXTRA_GROUP_ID).orEmpty()
        val json = intent.getStringExtra(EXTRA_MESSAGES_JSON).orEmpty()
        if (gid.isNotBlank() && gid == bubbleGroupId) {
          chatPanel?.seedMessages(json)
        }
        return START_STICKY
      }
      ACTION_APPEND_MESSAGE -> {
        val gid = intent.getStringExtra(EXTRA_GROUP_ID).orEmpty()
        val sender = intent.getStringExtra(EXTRA_SENDER).orEmpty()
        val message = intent.getStringExtra(EXTRA_MESSAGE).orEmpty()
        if (gid.isNotBlank() && gid == bubbleGroupId && chatPanel?.isShowing() == true) {
          chatPanel?.appendIncoming(sender, message)
        }
        return START_STICKY
      }
      else -> return START_STICKY
    }
  }

  private fun ensureOverlay() {
    if (!Settings.canDrawOverlays(this)) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      foregroundStarted = false
      stopSelf()
      return
    }
    if (bubbleRoot != null) return
    loadBadgeFromPrefs()
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    val dm = resources.displayMetrics
    val bubbleSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 58f, dm).toInt()
    val params = WindowManager.LayoutParams(
      bubbleSize,
      bubbleSize,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.x = dm.widthPixels - bubbleSize - dp(12)
    params.y = (dm.heightPixels * 0.58f).toInt()
    layoutParams = params

    val root = FrameLayout(this)
    root.id = R.id.sx_bubble_root

    val outer = FrameLayout(this)
    val outerBg = GradientDrawable()
    outerBg.shape = GradientDrawable.OVAL
    outerBg.setColor(Color.WHITE)
    outerBg.setStroke(dp(3), Color.parseColor("#6C5CE7"))
    outer.background = outerBg
    outer.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )

    val innerSize = bubbleSize - dp(6)
    val clipHost = FrameLayout(this)
    avatarClipHost = clipHost
    val clipLp = FrameLayout.LayoutParams(innerSize, innerSize)
    clipLp.gravity = Gravity.CENTER
    clipHost.layoutParams = clipLp
    clipHost.clipToOutline = true
    clipHost.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setOval(0, 0, view.width, view.height)
      }
    }
    val hostBg = GradientDrawable()
    hostBg.shape = GradientDrawable.OVAL
    hostBg.setColor(colorFromName(bubbleTitle.ifBlank { bubbleLetter }))
    clipHost.background = hostBg

    val letter = TextView(this)
    letter.gravity = Gravity.CENTER
    letter.setTextColor(Color.WHITE)
    letter.setTypeface(letter.typeface, Typeface.BOLD)
    letter.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    letter.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
    letterView = letter

    val avatar = ImageView(this)
    avatar.scaleType = ImageView.ScaleType.CENTER_CROP
    avatar.visibility = View.GONE
    avatar.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
    avatarView = avatar

    clipHost.addView(letter)
    clipHost.addView(avatar)
    outer.addView(clipHost)

    val badge = TextView(this)
    badge.gravity = Gravity.CENTER
    badge.setTextColor(Color.WHITE)
    badge.setTypeface(badge.typeface, Typeface.BOLD)
    badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
    badge.setPadding(dp(5), dp(1), dp(5), dp(1))
    badge.minWidth = dp(20)
    badge.minHeight = dp(20)
    val badgeBg = GradientDrawable()
    badgeBg.shape = GradientDrawable.RECTANGLE
    badgeBg.cornerRadius = dp(10).toFloat()
    badgeBg.setColor(Color.parseColor("#FF3B30"))
    badge.background = badgeBg
    badge.elevation = dp(4).toFloat()
    badge.visibility = View.GONE
    val badgeLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
    )
    badgeLp.gravity = Gravity.END or Gravity.TOP
    badgeLp.topMargin = -dp(2)
    badgeLp.marginEnd = -dp(2)
    badge.layoutParams = badgeLp
    badgeView = badge

    outer.addView(badge)
    root.addView(outer)

    attachDrag(root, params)
    root.setOnClickListener { openPendingChat() }

    windowManager?.addView(root, params)
    bubbleRoot = root
    updateBubbleContent()
    updateBadge()
  }

  private fun attachDrag(root: FrameLayout, params: WindowManager.LayoutParams) {
    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var moved = false
    root.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          startX = params.x
          startY = params.y
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - downX).toInt()
          val dy = (event.rawY - downY).toInt()
          if (abs(dx) + abs(dy) > dp(4)) moved = true
          params.x = startX + dx
          params.y = startY + dy
          windowManager?.updateViewLayout(root, params)
          updatePeekPosition()
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (!moved) {
            root.performClick()
          } else if (shouldDismissBubble(params, downX, downY, event.rawX, event.rawY)) {
            dismissBubble()
          } else {
            snapToEdge(params)
            windowManager?.updateViewLayout(root, params)
            updatePeekPosition()
          }
          true
        }
        else -> false
      }
    }
  }

  /** Kéo ra ngoài màn hình hoặc kéo xa (>72dp) → đóng bong bóng. */
  private fun shouldDismissBubble(
    params: WindowManager.LayoutParams,
    downX: Float,
    downY: Float,
    upX: Float,
    upY: Float,
  ): Boolean {
    val dm = resources.displayMetrics
    val cx = params.x + params.width / 2f
    val cy = params.y + params.height / 2f
    val offScreen = cx < 0 || cx > dm.widthPixels || cy < 0 || cy > dm.heightPixels
    val dragDist = hypot((upX - downX).toDouble(), (upY - downY).toDouble())
    return offScreen || dragDist >= dp(72)
  }

  private fun dismissBubble() {
    removeOverlay()
    prefs().edit().putBoolean(PREF_BUBBLE_DISMISSED, true).apply()
  }

  private fun isBubbleDismissed(): Boolean =
    prefs().getBoolean(PREF_BUBBLE_DISMISSED, false)

  private fun loadBadgeFromPrefs() {
    badgeCount = prefs().getInt(PREF_BADGE_COUNT, 0).coerceAtLeast(0)
  }

  private fun saveBadgeToPrefs() {
    prefs().edit().putInt(PREF_BADGE_COUNT, badgeCount.coerceAtLeast(0)).apply()
  }

  private fun incrementBadgeCount() {
    badgeCount = (badgeCount + 1).coerceAtMost(999)
    saveBadgeToPrefs()
    updateBadge()
  }

  private fun snapToEdge(params: WindowManager.LayoutParams) {
    val dm = resources.displayMetrics
    val bubbleSize = params.width
    val mid = dm.widthPixels / 2
    params.x = if (params.x + bubbleSize / 2 < mid) dp(10) else dm.widthPixels - bubbleSize - dp(10)
    params.y = params.y.coerceIn(dp(72), dm.heightPixels - bubbleSize - dp(96))
  }

  private fun showCallPeek(fromName: String, kind: String, isGroup: Boolean, groupName: String) {
    removePeek()
    if (!Settings.canDrawOverlays(this)) return
    val wm = windowManager ?: return
    val lp = layoutParams ?: return
    val dm = resources.displayMetrics

    val peek = LinearLayout(this)
    peek.orientation = LinearLayout.VERTICAL
    peek.id = R.id.sx_bubble_peek
    val bg = GradientDrawable()
    bg.cornerRadius = dp(12).toFloat()
    bg.setColor(Color.parseColor("#FFF0FDF4"))
    bg.setStroke(dp(2), Color.parseColor("#3310B981"))
    peek.background = bg
    peek.setPadding(dp(12), dp(10), dp(12), dp(10))
    peek.elevation = dp(8).toFloat()

    val titleTv = TextView(this)
    titleTv.setTextColor(Color.parseColor("#047857"))
    titleTv.setTypeface(titleTv.typeface, Typeface.BOLD)
    titleTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    titleTv.text = when {
      isGroup -> "Cuộc gọi nhóm ${if (kind == "video") "video" else "thoại"}"
      kind == "video" -> "Cuộc gọi video đến"
      else -> "Cuộc gọi đến"
    }

    val nameTv = TextView(this)
    nameTv.setTextColor(Color.parseColor("#1E293B"))
    nameTv.setTypeface(nameTv.typeface, Typeface.BOLD)
    nameTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    nameTv.maxLines = 2
    nameTv.text = when {
      isGroup && groupName.isNotBlank() -> "${fromName.ifBlank { "Ai đó" }} · $groupName"
      else -> fromName.ifBlank { "Người gọi" }
    }

    val hintTv = TextView(this)
    hintTv.setTextColor(Color.parseColor("#475569"))
    hintTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    hintTv.text = "Chạm để trả lời"

    peek.addView(titleTv)
    peek.addView(nameTv)
    peek.addView(hintTv)
    peek.setOnClickListener { openIncomingCall() }

    val bubbleOnRight = lp.x + lp.width / 2 >= dm.widthPixels / 2
    val peekParams = WindowManager.LayoutParams(
      dp(220),
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    peekParams.gravity = Gravity.TOP or Gravity.START
    peekParams.x = if (bubbleOnRight) {
      (lp.x - dp(228)).coerceAtLeast(dp(4))
    } else {
      lp.x + lp.width + dp(8)
    }
    peekParams.y = lp.y - dp(6)
    wm.addView(peek, peekParams)
    peekRoot = peek

    peekHideRunnable?.let { handler.removeCallbacks(it) }
    peekHideRunnable = Runnable { removePeek() }
    handler.postDelayed(peekHideRunnable!!, 35000)
  }

  private fun openIncomingCall() {
    val launch = Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra("incoming_call", true)
      if (callOverlayCallId.isNotBlank()) putExtra("call_id", callOverlayCallId)
    }
    startActivity(launch)
  }

  private fun openPendingChat() {
    openChatPanel()
  }

  private fun openChatPanel() {
    if (bubbleGroupId.isBlank()) return
    badgeCount = 0
    saveBadgeToPrefs()
    updateBadge()
    removePeek()
    closeChatPanel()
    snapBubbleForChatPanel()
    bubbleRoot?.visibility = View.VISIBLE
    showNativeChatPanel()
  }

  /** Panel overlay native — không mở MainActivity, chat nổi trên app khác. */
  private fun showNativeChatPanel() {
    val wm = windowManager ?: return
    val topReserve = snapBubbleForChatPanel()
    chatPanel = OverlayChatPanel(
      this,
      wm,
      onClosed = {
        chatPanel = null
        bubbleRoot?.visibility = View.VISIBLE
      },
      onExpand = { gid, title -> openBubbleChatInApp(gid, title) },
    )
    chatPanel?.show(bubbleGroupId, bubbleTitle, topReserve)
  }

  private fun stashPendingBubbleChat(groupId: String, title: String) {
    try {
      val obj = org.json.JSONObject()
      obj.put("threadId", groupId)
      obj.put("title", title.ifBlank { "Chat" })
      obj.put("ts", System.currentTimeMillis())
      prefs().edit().putString(PREF_PENDING_BUBBLE_CHAT, obj.toString()).apply()
    } catch (_: Exception) { }
  }

  private fun openBubbleChatInApp(groupId: String = bubbleGroupId, title: String = bubbleTitle) {
    if (groupId.isBlank()) return
    closeChatPanel()
    stashPendingBubbleChat(groupId, title)
    FloatingBubbleBridge.emitPanelOpened(groupId, title, fullApp = true)
    val intent = Intent(this, MainActivity::class.java).apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
          or Intent.FLAG_ACTIVITY_SINGLE_TOP
          or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
          or Intent.FLAG_ACTIVITY_NO_ANIMATION,
      )
      putExtra("bubble_chat", true)
      putExtra("group_id", groupId)
      putExtra("title", title)
    }
    startActivity(intent)
  }

  /** Đưa bubble lên mép trên — panel chat chiếm phần còn lại, không chừa khoảng trống lớn. */
  private fun snapBubbleForChatPanel(): Int {
    val lp = layoutParams ?: return statusBarHeight() + dp(58) + dp(10)
    val root = bubbleRoot ?: return statusBarHeight() + dp(58) + dp(10)
    val dm = resources.displayMetrics
    lp.x = dm.widthPixels - lp.width - dp(12)
    lp.y = statusBarHeight() + dp(8)
    try {
      windowManager?.updateViewLayout(root, lp)
      bringBubbleToFront(root, lp)
    } catch (_: Exception) { }
    return lp.y + lp.height + dp(6)
  }

  private fun bringBubbleToFront(root: View, lp: WindowManager.LayoutParams) {
    try {
      windowManager?.removeView(root)
      windowManager?.addView(root, lp)
    } catch (_: Exception) { }
  }

  private fun statusBarHeight(): Int {
    val resId = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resId > 0) resources.getDimensionPixelSize(resId) else dp(24)
  }

  private fun closeChatPanel() {
    chatPanel?.hide()
    chatPanel = null
    bubbleRoot?.visibility = View.VISIBLE
  }

  private fun showPeek(sender: String, message: String) {
    removePeek()
    if (!Settings.canDrawOverlays(this)) return
    val wm = windowManager ?: return
    val lp = layoutParams ?: return
    val dm = resources.displayMetrics

    val peek = LinearLayout(this)
    peek.orientation = LinearLayout.VERTICAL
    peek.id = R.id.sx_bubble_peek
    val bg = GradientDrawable()
    bg.cornerRadius = dp(12).toFloat()
    bg.setColor(Color.parseColor("#F0FFFFFF"))
    bg.setStroke(dp(1), Color.parseColor("#336C5CE7"))
    peek.background = bg
    peek.setPadding(dp(10), dp(8), dp(10), dp(8))
    peek.elevation = dp(6).toFloat()

    val senderTv = TextView(this)
    senderTv.setTextColor(Color.parseColor("#1E293B"))
    senderTv.setTypeface(senderTv.typeface, Typeface.BOLD)
    senderTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    senderTv.maxLines = 1
    senderTv.text = if (sender.isNotBlank()) sender else bubbleTitle

    val msgTv = TextView(this)
    msgTv.setTextColor(Color.parseColor("#475569"))
    msgTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    msgTv.maxLines = 2
    msgTv.text = message.take(120)

    peek.addView(senderTv)
    peek.addView(msgTv)

    peek.setOnClickListener { openPendingChat() }

    val bubbleOnRight = lp.x + lp.width / 2 >= dm.widthPixels / 2
    val peekParams = WindowManager.LayoutParams(
      dp(196),
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    peekParams.gravity = Gravity.TOP or Gravity.START
    peekParams.x = if (bubbleOnRight) {
      (lp.x - dp(204)).coerceAtLeast(dp(4))
    } else {
      lp.x + lp.width + dp(8)
    }
    peekParams.y = lp.y - dp(6)
    wm.addView(peek, peekParams)
    peekRoot = peek

    peekHideRunnable?.let { handler.removeCallbacks(it) }
    peekHideRunnable = Runnable { removePeek() }
    handler.postDelayed(peekHideRunnable!!, 5000)
  }

  private fun updatePeekPosition() {
    val peek = peekRoot ?: return
    val lp = layoutParams ?: return
    val dm = resources.displayMetrics
    val bubbleOnRight = lp.x + lp.width / 2 >= dm.widthPixels / 2
    val peekLp = peek.layoutParams as? WindowManager.LayoutParams ?: return
    peekLp.x = if (bubbleOnRight) {
      (lp.x - dp(204)).coerceAtLeast(dp(4))
    } else {
      lp.x + lp.width + dp(8)
    }
    peekLp.y = lp.y - dp(6)
    windowManager?.updateViewLayout(peek, peekLp)
  }

  private fun removePeek() {
    peekRoot?.let {
      try {
        windowManager?.removeView(it)
      } catch (_: Exception) { }
    }
    peekRoot = null
  }

  private fun updateBubbleContent() {
    letterView?.text = bubbleLetter.take(2).uppercase()
    val host = avatarClipHost
    if (host != null) {
      (host.background as? GradientDrawable)?.setColor(
        colorFromName(bubbleTitle.ifBlank { bubbleLetter }),
      ) ?: run {
        val bg = GradientDrawable()
        bg.shape = GradientDrawable.OVAL
        bg.setColor(colorFromName(bubbleTitle.ifBlank { bubbleLetter }))
        host.background = bg
      }
    }
    loadAvatarImage(bubbleAvatarUrl)
  }

  private fun loadAvatarImage(url: String) {
    val imageView = avatarView ?: return
    val letter = letterView ?: return
    val host = avatarClipHost ?: return
    if (url.isBlank()) {
      imageView.setImageDrawable(null)
      imageView.visibility = View.GONE
      letter.visibility = View.VISIBLE
      host.visibility = View.VISIBLE
      return
    }
    Thread {
      try {
        val conn = URL(url).openConnection()
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        val bmp = BitmapFactory.decodeStream(conn.getInputStream())
        handler.post {
          if (bmp != null) {
            imageView.setImageBitmap(bmp)
            imageView.visibility = View.VISIBLE
            letter.visibility = View.GONE
            host.background = null
          } else {
            imageView.visibility = View.GONE
            letter.visibility = View.VISIBLE
          }
        }
      } catch (_: Exception) {
        handler.post {
          imageView.visibility = View.GONE
          letter.visibility = View.VISIBLE
        }
      }
    }.start()
  }

  private fun colorFromName(name: String): Int {
    val palette = intArrayOf(
      0xFFEC4899.toInt(),
      0xFF3B82F6.toInt(),
      0xFF10B981.toInt(),
      0xFFF59E0B.toInt(),
      0xFF8B5CF6.toInt(),
      0xFF06B6D4.toInt(),
      0xFFF97316.toInt(),
    )
    var h = 0
    for (c in name) h = (h + c.code * 17) % palette.size
    return palette[h]
  }

  private fun updateBadge() {
    val badge = badgeView ?: return
    if (badgeCount <= 0) {
      badge.visibility = View.GONE
      return
    }
    badge.visibility = View.VISIBLE
    badge.text = when {
      badgeCount > 99 -> "99+"
      badgeCount > 9 -> badgeCount.toString()
      else -> badgeCount.toString()
    }
    badge.requestLayout()
  }

  private fun removeOverlay() {
    closeChatPanel()
    removePeek()
    bubbleRoot?.let {
      try {
        windowManager?.removeView(it)
      } catch (_: Exception) { }
    }
    bubbleRoot = null
    avatarView = null
    letterView = null
    avatarClipHost = null
    badgeView = null
    layoutParams = null
  }

  private fun startAsForeground() {
    if (foregroundStarted) return
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(CHANNEL_ID, "Bong bóng chat", NotificationManager.IMPORTANCE_LOW)
      ch.description = "Giữ bong bóng chat hiển thị trên màn hình"
      nm.createNotificationChannel(ch)
    }
    val tap = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_chat)
      .setContentTitle("Quản lý sản xuất · Tin nhắn")
      .setContentText("Sẵn sàng nhận tin nhắn")
      .setContentIntent(tap)
      .setOngoing(true)
      .setSilent(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, notif)
    }
    foregroundStarted = true
  }

  private fun overlayType(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
  }

  private fun dp(v: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      v.toFloat(),
      resources.displayMetrics,
    ).toInt()
  }

  private fun prefs() = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

  override fun onDestroy() {
    removeOverlay()
    super.onDestroy()
  }

  companion object {
    const val PREF_NAME = "sx_bubble_prefs"
    const val PREF_PENDING_BUBBLE_CHAT = "pending_bubble_chat_json"
    const val PREF_PENDING_GROUP = "pending_group_id"
    const val PREF_PENDING_TITLE = "pending_group_title"
    const val PREF_BUBBLE_DISMISSED = "bubble_dismissed"
    const val PREF_BADGE_COUNT = "badge_count"
    private const val CHANNEL_ID = "sx_bubble_overlay"
    private const val NOTIF_ID = 8801

    const val ACTION_START = "vn.tubeppro.crmobilev2.overlay.START"
    const val ACTION_STOP = "vn.tubeppro.crmobilev2.overlay.STOP"
    const val ACTION_SET_BADGE = "vn.tubeppro.crmobilev2.overlay.SET_BADGE"
    const val ACTION_SHOW_BUBBLE = "vn.tubeppro.crmobilev2.overlay.SHOW_BUBBLE"
    const val ACTION_SHOW_PEEK = "vn.tubeppro.crmobilev2.overlay.SHOW_PEEK"
    const val ACTION_SHOW_CALL_OVERLAY = "vn.tubeppro.crmobilev2.overlay.SHOW_CALL_OVERLAY"
    const val ACTION_HIDE_CALL_OVERLAY = "vn.tubeppro.crmobilev2.overlay.HIDE_CALL_OVERLAY"
    const val ACTION_OPEN_CHAT_PANEL = "vn.tubeppro.crmobilev2.overlay.OPEN_CHAT_PANEL"
    const val ACTION_CLOSE_CHAT_PANEL = "vn.tubeppro.crmobilev2.overlay.CLOSE_CHAT_PANEL"
    const val ACTION_SEED_MESSAGES = "vn.tubeppro.crmobilev2.overlay.SEED_MESSAGES"
    const val ACTION_APPEND_MESSAGE = "vn.tubeppro.crmobilev2.overlay.APPEND_MESSAGE"

    const val EXTRA_BADGE = "badge"
    const val EXTRA_GROUP_ID = "group_id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_LETTER = "letter"
    const val EXTRA_AVATAR_URL = "avatar_url"
    const val EXTRA_SENDER = "sender"
    const val EXTRA_MESSAGE = "message"
    const val EXTRA_INCREMENT_BADGE = "increment_badge"
    const val EXTRA_CALL_ID = "call_id"
    const val EXTRA_CALL_FROM = "call_from"
    const val EXTRA_CALL_KIND = "call_kind"
    const val EXTRA_CALL_IS_GROUP = "call_is_group"
    const val EXTRA_CALL_GROUP_NAME = "call_group_name"
    const val EXTRA_MESSAGES_JSON = "messages_json"

    fun start(ctx: Context) {
      val i = Intent(ctx, OverlayBubbleService::class.java).apply { action = ACTION_START }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
      else ctx.startService(i)
    }

    fun stop(ctx: Context) {
      ctx.startService(Intent(ctx, OverlayBubbleService::class.java).apply { action = ACTION_STOP })
    }
  }
}
