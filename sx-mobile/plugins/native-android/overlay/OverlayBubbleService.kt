package vn.tubeppro.sxmobile.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.animation.ValueAnimator
import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
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
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.view.animation.DecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.view.animation.OvershootInterpolator
import androidx.core.app.NotificationCompat
import kotlin.math.abs
import kotlin.math.hypot
import vn.tubeppro.sxmobile.MainActivity
import vn.tubeppro.sxmobile.R
import java.net.URL

class OverlayBubbleService : Service() {
  private var windowManager: WindowManager? = null
  private var bubbleRoot: FrameLayout? = null
  private var stackHost: FrameLayout? = null
  private var peekRoot: View? = null
  private var convPickerRoot: FrameLayout? = null
  private var badgeView: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var badgeCount = 0
  private var bubbleLetter = "?"
  private var bubbleTitle = "Chat"
  private var bubbleGroupId = ""
  private var bubbleAvatarUrl = ""
  private val convStack = LinkedHashMap<String, ConvBubble>()
  private var callOverlayCallId = ""
  private var chatPanel: OverlayChatPanel? = null
  private val handler = Handler(Looper.getMainLooper())
  private var peekHideRunnable: Runnable? = null
  private var foregroundStarted = false
  /** Mốc thời gian (ms) hiệu ứng «hiện lên» của bong bóng kết thúc — tránh nảy chồng lên nó. */
  private var entranceUntilMs = 0L
  /** Hoạt ảnh vòng sáng nhấp nháy quanh bong bóng — phải hủy khi dựng lại/gỡ bong bóng để khỏi rò rỉ. */
  private var glowAnimator: ValueAnimator? = null
  /** Phần chồng bong bóng cao thêm phía trên bong bóng trước nhất (px) — để dời cửa sổ cho bong bóng trước nhất đứng yên. */
  private var stackExtraPx = 0
  /** Các bong bóng nằm dưới bong bóng trước nhất kèm độ sâu (1 = ngay dưới) — để lộ ra phía sau khi kéo. */
  private val trailViews = ArrayList<Pair<View, Int>>()
  private val trailRelaxRunnable = Runnable { trailBack() }
  /** Kích thước (px) và vị trí (phía trên/dưới bong bóng) của thẻ xem trước tin nhắn đang hiện — dùng khi kéo bong bóng. */
  private var peekW = 0
  private var peekH = 0
  private var peekToLeft = true

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
        // Chưa biết đoạn chat nào (chồng bong bóng nằm trong bộ nhớ, mất khi tiến trình khởi động lại) thì KHÔNG có bong bóng để gắn huy
        // hiệu: đừng tạo cửa sổ overlay chỉ để hiện một con số trơ trọi, và gỡ cửa sổ trống nếu đang có.
        if (convStack.isEmpty()) {
          if (bubbleRoot != null) removeOverlay()
          return START_STICKY
        }
        if (badgeCount > 0 && bubbleRoot == null && !isBubbleDismissed()) {
          ensureOverlay()
        }
        updateBadge()
        return START_STICKY
      }
      ACTION_SHOW_BUBBLE -> {
        val gid = intent.getStringExtra(EXTRA_GROUP_ID).orEmpty()
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "Chat" }
        val letter = intent.getStringExtra(EXTRA_LETTER).orEmpty().ifBlank { "?" }
        val avatarUrl = intent.getStringExtra(EXTRA_AVATAR_URL).orEmpty()
        val sender = intent.getStringExtra(EXTRA_SENDER).orEmpty()
        val preview = intent.getStringExtra(EXTRA_MESSAGE).orEmpty()
        val increment = intent.getBooleanExtra(EXTRA_INCREMENT_BADGE, false)
        val openGid = openPanelGroupId()
        if (openGid.isNotBlank()) {
          // Khung chat đang mở: tin của chính đoạn đang xem thì khung tự cập nhật (xem SHOW_PEEK) — không nảy bong bóng.
          if (gid == openGid) return START_STICKY
          // Tin của đoạn khác: ghi nhận vào chồng + huy hiệu, đưa người đó lên dải đầu chat; bong bóng đang ẩn nên không nảy.
          upsertConversation(gid, title, letter, avatarUrl, sender, preview, increment)
          if (increment) incrementBadgeCount()
          chatPanel?.updateHeads(chatHeads())
          rebuildStackUi()
          return START_STICKY
        }
        upsertConversation(gid, title, letter, avatarUrl, sender, preview, increment)
        if (increment) incrementBadgeCount()
        prefs().edit().remove(PREF_BUBBLE_DISMISSED).apply()
        val existed = bubbleRoot != null
        ensureOverlay()
        rebuildStackUi()
        // Bong bóng đã có sẵn mà có tin mới → nảy nhẹ cho dễ để ý; mới tạo thì đã có hiệu ứng xuất hiện.
        if (existed && increment) popBubble()
        return START_STICKY
      }
      ACTION_SHOW_PEEK -> {
        val sender = intent.getStringExtra(EXTRA_SENDER).orEmpty()
        val message = intent.getStringExtra(EXTRA_MESSAGE).orEmpty()
        val gid = intent.getStringExtra(EXTRA_GROUP_ID).orEmpty()
        // Một tin có thể tới nhiều đường (FCM bị gọi 2 lần, FCM + socket): chỉ xử lý MỘT lần, kẻo bong bóng nháy 2 lần và huy hiệu cộng đôi.
        if (isDuplicateIncoming(gid, sender, message, intent.getStringExtra(EXTRA_MESSAGE_ID))) return START_STICKY
        val openGid = openPanelGroupId()
        if (openGid.isNotBlank()) {
          val panel = chatPanel
          if (panel != null && (gid.isBlank() || gid == openGid)) {
            // Đang xem đúng đoạn chat này: chèn tin thẳng vào khung (rồi tải lại cho khớp máy chủ), KHÔNG hiện thẻ xem trước.
            panel.appendIncoming(
              sender,
              message,
              intent.getStringExtra(EXTRA_MESSAGE_ID).orEmpty().ifBlank { null },
              convStack[openGid]?.avatarUrl,
            )
            panel.reloadMessages()
            return START_STICKY
          }
          // Tin của đoạn khác trong lúc khung đang mở: chỉ cập nhật chồng/huy hiệu/dải đầu chat, không bật thẻ đè lên khung.
          upsertConversation(
            gid,
            bubbleTitle.ifBlank { sender.ifBlank { "Chat" } },
            bubbleLetter.ifBlank { sender.firstOrNull()?.uppercaseChar()?.toString() ?: "?" },
            bubbleAvatarUrl,
            sender,
            message,
            increment = false,
          )
          if (intent.getBooleanExtra(EXTRA_INCREMENT_BADGE, true)) incrementBadgeCount()
          panel?.updateHeads(chatHeads())
          rebuildStackUi()
          return START_STICKY
        }
        if (gid.isNotBlank()) {
          upsertConversation(
            gid,
            bubbleTitle.ifBlank { sender.ifBlank { "Chat" } },
            bubbleLetter.ifBlank { sender.firstOrNull()?.uppercaseChar()?.toString() ?: "?" },
            bubbleAvatarUrl,
            sender,
            message,
            increment = false,
          )
        }
        if (intent.getBooleanExtra(EXTRA_INCREMENT_BADGE, true)) {
          incrementBadgeCount()
        }
        val existed = bubbleRoot != null
        if (!existed) ensureOverlay()
        rebuildStackUi()
        if (existed) popBubble()
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
        val messageId = intent.getStringExtra(EXTRA_MESSAGE_ID).orEmpty().ifBlank { null }
        val panel = chatPanel
        if (gid.isNotBlank() && panel?.isAlive() == true && panel.currentGroupId() == gid) {
          panel.reloadMessages()
        }
        return START_STICKY
      }
      else -> return START_STICKY
    }
  }

  /** Tin đến gần đây (khoá → thời điểm) để loại bản trùng. Chỉ dùng trên luồng chính (onStartCommand). */
  private val recentIncoming = LinkedHashMap<String, Long>()

  /**
   * true nếu tin này vừa được xử lý rồi. Có mã tin nhắn thì so theo mã (nhớ 2 phút); không có thì so theo nhóm + người gửi + nội
   * dung trong 5 giây (đủ phủ hai lần gọi liền nhau của cùng một thông báo đẩy mà không nuốt hai tin giống hệt cách nhau lâu).
   */
  private fun isDuplicateIncoming(groupId: String, sender: String, message: String, messageId: String?): Boolean {
    val now = System.currentTimeMillis()
    val it = recentIncoming.entries.iterator()
    while (it.hasNext()) if (now - it.next().value > 120_000L) it.remove()
    val key: String
    val ttl: Long
    if (!messageId.isNullOrBlank()) {
      key = "id:$messageId"
      ttl = 120_000L
    } else {
      key = "t:$groupId|$sender|$message"
      ttl = 5_000L
    }
    val last = recentIncoming[key]
    if (last != null && now - last < ttl) {
      // Không ghi nội dung tin hay tên người gửi (riêng tư). Trùng theo MÃ là đường đi bình thường (socket + FCM cùng báo một tin) →
      // chỉ mức Debug. Trùng theo NỘI DUNG (tin không có mã) bất thường hơn → mức Error để còn thấy trên Vivo/ROM ẩn Info/Warn.
      if (!messageId.isNullOrBlank()) {
        android.util.Log.d("SxPeek", "bỏ qua tin trùng cùng mã $messageId, nhóm ${groupId.take(8)}, cách lần trước ${now - last}ms")
      } else {
        android.util.Log.e("SxPeek", "BỎ QUA tin trùng (không có mã, cùng nhóm+người gửi+nội dung), nhóm ${groupId.take(8)}, cách lần trước ${now - last}ms")
      }
      return true
    }
    recentIncoming[key] = now
    return false
  }

  private data class ConvBubble(
    val groupId: String,
    var title: String,
    var lastSender: String,
    var lastPreview: String,
    var letter: String,
    var avatarUrl: String,
  )

  private fun upsertConversation(
    groupId: String,
    title: String,
    letter: String,
    avatarUrl: String,
    lastSender: String,
    lastPreview: String,
    increment: Boolean,
  ) {
    if (groupId.isBlank()) return
    val prev = convStack.remove(groupId)
    val conv = ConvBubble(
      groupId = groupId,
      title = title.ifBlank { prev?.title ?: "Chat" },
      lastSender = lastSender.ifBlank { prev?.lastSender ?: "" },
      lastPreview = lastPreview.ifBlank { prev?.lastPreview ?: "" },
      letter = letter.ifBlank { prev?.letter ?: "?" },
      avatarUrl = avatarUrl.ifBlank { prev?.avatarUrl ?: "" },
    )
    convStack[groupId] = conv
    // Tải sẵn ảnh đại diện ngay khi có tin: bong bóng, thẻ xem trước và khung chat đều dùng chung bản đã đệm.
    if (conv.avatarUrl.isNotBlank()) OverlayAvatarCache.prefetch(this, conv.avatarUrl)
    bubbleGroupId = groupId
    bubbleTitle = conv.title
    bubbleLetter = conv.letter
    bubbleAvatarUrl = conv.avatarUrl
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
    val bubbleSize = dp(58)
    val params = WindowManager.LayoutParams(
      bubbleSize,
      bubbleSize,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    // Cửa sổ rộng hơn bong bóng 2 × bubbleMargin() (chừa chỗ cho vòng sáng nhấp nháy + bóng) nên dựa sát mép phải.
    params.x = dm.widthPixels - bubbleSize - bubbleMargin() * 2
    params.y = (dm.heightPixels * 0.58f).toInt()
    layoutParams = params

    val root = FrameLayout(this)
    root.id = R.id.sx_bubble_root
    // Khung con (host) vẽ bong bóng bên dưới lệch ra ngoài mép của nó khi kéo → khung cha cũng phải tắt cắt, nếu không phần lộ ra
    // bị cắt thẳng đứng ngay mép host. Vẫn giới hạn bởi lề cửa sổ (bubbleMargin).
    root.clipChildren = false

    val host = FrameLayout(this)
    host.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
    stackHost = host
    root.addView(host)

    val badge = TextView(this)
    badge.gravity = Gravity.CENTER
    badge.setTextColor(Color.WHITE)
    badge.setTypeface(badge.typeface, Typeface.BOLD)
    badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    badge.setPadding(dp(5), dp(1), dp(5), dp(1))
    badge.minWidth = dp(22)
    badge.minHeight = dp(22)
    val badgeBg = GradientDrawable()
    badgeBg.shape = GradientDrawable.RECTANGLE
    badgeBg.cornerRadius = dp(11).toFloat()
    badgeBg.setColor(Color.parseColor("#FA3E3E"))
    // Viền trắng quanh huy hiệu để nó "tách" khỏi ảnh đại diện phía sau (đúng thiết kế: đỏ #FA3E3E, viền trắng 2dp).
    badgeBg.setStroke(dp(2), Color.WHITE)
    badge.background = badgeBg
    badge.elevation = dp(4).toFloat()
    badge.visibility = View.GONE
    val badgeLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
    )
    badgeLp.gravity = Gravity.END or Gravity.TOP
    // Cửa sổ rộng hơn bong bóng ~12dp bên phải (chừa chỗ cho bóng đổ) nên huy hiệu lùi vào cho khớp mép bong bóng.
    badgeLp.topMargin = bubbleMargin() - dp(6)
    badgeLp.marginEnd = bubbleMargin() - dp(4)
    badge.layoutParams = badgeLp
    badgeView = badge
    root.addView(badge)

    attachDrag(root, params)
    root.setOnClickListener { onBubbleStackTapped() }

    windowManager?.addView(root, params)
    bubbleRoot = root
    rebuildStackUi()
    updateBadge()

    // Hiện lên: phóng từ nhỏ lên với độ nảy nhẹ + mờ dần vào, thay vì xuất hiện cái bụp.
    root.alpha = 0f
    root.scaleX = 0.35f
    root.scaleY = 0.35f
    entranceUntilMs = System.currentTimeMillis() + 480
    root.animate()
      .alpha(1f)
      .scaleX(1f)
      .scaleY(1f)
      .setDuration(420)
      .setInterpolator(OvershootInterpolator(1.9f))
      .withEndAction {
        // Phòng khi hiệu ứng bị huỷ giữa chừng: luôn trả về trạng thái hiển thị đầy đủ.
        root.alpha = 1f
        root.scaleX = 1f
        root.scaleY = 1f
      }
      .start()
  }

  /** Nảy nhẹ khi có tin mới (bong bóng đã hiện sẵn). Bỏ qua nếu hiệu ứng hiện lên còn đang chạy (tin đến liền sau khi tạo). */
  private fun popBubble() {
    val root = bubbleRoot ?: return
    if (System.currentTimeMillis() < entranceUntilMs) return
    root.animate().cancel()
    root.alpha = 1f
    root.scaleX = 1f
    root.scaleY = 1f
    root.animate()
      .scaleX(1.16f)
      .scaleY(1.16f)
      .setDuration(110)
      .setInterpolator(DecelerateInterpolator())
      .withEndAction {
        root.animate()
          .scaleX(1f)
          .scaleY(1f)
          .setDuration(320)
          .setInterpolator(OvershootInterpolator(3f))
          .start()
      }
      .start()
  }

  private fun onBubbleStackTapped() {
    hideConvPicker()
    // Chạm bong bóng luôn mở THẲNG đoạn chat đang hiện trên bong bóng (cuộc mới nhất). Muốn chuyển cuộc khác thì dùng dải
    // đầu chat hoặc trang «Đoạn chat» trong khung — không còn hộp «Chọn cuộc trò chuyện».
    openPendingChat()
  }

  private fun rebuildStackUi() {
    val host = stackHost ?: return
    host.removeAllViews()
    val convs = convStack.values.toList()
    if (convs.isEmpty()) {
      if (bubbleGroupId.isNotBlank()) {
        convStack[bubbleGroupId] = ConvBubble(
          bubbleGroupId,
          bubbleTitle,
          "",
          "",
          bubbleLetter,
          bubbleAvatarUrl,
        )
        return rebuildStackUi()
      }
      return
    }

    glowAnimator?.cancel()
    glowAnimator = null
    val bubbleSize = dp(58)
    // Chồng TRÙNG KHÍT (kiểu B): mọi cuộc trò chuyện nằm đúng một chỗ, chỉ hiện bong bóng của cuộc MỚI NHẤT; huy hiệu đỏ là số
    // tin chưa đọc tổng. Không có lớp nào nhô ra/lệch, không chip «+N» (số cuộc trong chồng không phản ánh tin chưa đọc).
    // Chạm vào bong bóng khi có nhiều cuộc thì hiện danh sách để chọn.
    val peek = 0
    val visible = convs.takeLast(3) // cũ → mới; phần tử cuối là bong bóng trước nhất, các cuộc cũ nằm khuất ngay bên dưới
    val depthMax = visible.size - 1
    val extra = peek * depthMax
    val stackW = bubbleSize
    val stackH = bubbleSize + extra

    // Cửa sổ overlay cắt mọi thứ ngoài mép → chừa lề đều bốn phía (bubbleMargin) cho vòng sáng nhấp nháy và bóng đổ.
    val m = bubbleMargin()
    host.clipChildren = false
    host.layoutParams = FrameLayout.LayoutParams(stackW, stackH).apply {
      leftMargin = m
      topMargin = m
    }
    // Huy hiệu bám góc trên phải của bong bóng TRƯỚC NHẤT (nằm thấp hơn đỉnh chồng một đoạn `extra`).
    badgeView?.let { b ->
      (b.layoutParams as? FrameLayout.LayoutParams)?.let { blp ->
        blp.topMargin = m + extra - dp(6)
        b.layoutParams = blp
      }
    }
    layoutParams?.let { lp ->
      lp.width = stackW + m * 2
      lp.height = stackH + m * 2
      // Chồng cao thêm (hoặc thấp đi) về phía TRÊN: dời cửa sổ cùng lượng đó để bong bóng trước nhất đứng yên một chỗ.
      lp.y -= extra - stackExtraPx
      stackExtraPx = extra
      // Giữ cửa sổ nằm gọn trong màn hình, khỏi bị cắt mép.
      val dm = resources.displayMetrics
      lp.x = lp.x.coerceAtMost(dm.widthPixels - lp.width).coerceAtLeast(0)
      lp.y = lp.y.coerceAtMost(dm.heightPixels - lp.height - dp(96)).coerceAtLeast(dp(72))
      bubbleRoot?.let { root ->
        try {
          windowManager?.updateViewLayout(root, lp)
        } catch (_: Exception) { }
      }
    }

    trailViews.clear()
    visible.forEachIndexed { index, conv ->
      val depth = depthMax - index // 0 = trước nhất
      val bubble = buildMiniBubble(conv, bubbleSize, dim = depth > 0)
      // Các bong bóng phía dưới trùng khít bên dưới bong bóng trước nhất (bị che kín khi đứng yên); khi KÉO chúng hơi lộ ra
      // phía sau như đuôi — xem trailTo().
      if (depth > 0) trailViews.add(Pair(bubble, depth))
      // Cùng một cột: bong bóng càng sâu càng nằm cao hơn một nấc `peek` và nhỏ hơn 10% → chỉ lộ cung mép trên.
      bubble.translationY = (extra - peek * depth).toFloat()
      val s = 1f - 0.04f * depth
      bubble.scaleX = s
      bubble.scaleY = s
      // Bóng đổ vừa phải (≈3dp) để nằm gọn trong phần lề chừa sẵn của cửa sổ, không bị cắt thành khung chữ nhật.
      bubble.elevation = dp(2).toFloat() + (index + 1) * dp(1).toFloat()
      host.addView(
        bubble,
        FrameLayout.LayoutParams(bubbleSize, bubbleSize),
      )
    }

    // Vòng sáng hồng nhấp nháy phía sau bong bóng trước nhất (thu hút chú ý): nở ra ~10dp rồi mờ dần, lặp mỗi 2,4 giây.
    val glow = View(this)
    glow.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.parseColor("#DF248B"))
    }
    glow.translationY = extra.toFloat()
    host.addView(glow, 0, FrameLayout.LayoutParams(bubbleSize, bubbleSize))
    val spread = (bubbleSize + dp(20)).toFloat() / bubbleSize
    glowAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 2400
      repeatCount = ValueAnimator.INFINITE
      interpolator = LinearInterpolator()
      addUpdateListener {
        val t = it.animatedValue as Float
        val s = 1f + (spread - 1f) * t
        glow.scaleX = s
        glow.scaleY = s
        glow.alpha = 0.6f * (1f - t)
      }
      start()
    }

    val active = convs.lastOrNull()
    if (active != null) {
      bubbleGroupId = active.groupId
      bubbleTitle = active.title
      bubbleLetter = active.letter
      bubbleAvatarUrl = active.avatarUrl
    }
  }

  private fun buildMiniBubble(conv: ConvBubble, size: Int, dim: Boolean = false): FrameLayout {
    // Đầu chat KHÔNG viền: chỉ ảnh đại diện tròn (nền chuyển màu hồng → tím khi chưa có ảnh) và bóng đổ nổi lên.
    // dim = true cho các bong bóng nằm dưới: phủ một lớp tối nhẹ để phân biệt với bong bóng trước nhất khi lộ ra lúc kéo.
    val outer = FrameLayout(this)
    outer.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setOval(0, 0, view.width, view.height)
      }
    }

    val clipHost = FrameLayout(this)
    val clipLp = FrameLayout.LayoutParams(size, size)
    clipLp.gravity = Gravity.CENTER
    clipHost.layoutParams = clipLp
    clipHost.clipToOutline = true
    clipHost.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setOval(0, 0, view.width, view.height)
      }
    }
    val hostBg = GradientDrawable(
      GradientDrawable.Orientation.TL_BR,
      intArrayOf(0xFFFF416C.toInt(), 0xFF8A2387.toInt()),
    )
    hostBg.shape = GradientDrawable.OVAL
    clipHost.background = hostBg

    val letter = TextView(this)
    letter.gravity = Gravity.CENTER
    letter.setTextColor(Color.WHITE)
    letter.setTypeface(letter.typeface, Typeface.BOLD)
    letter.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    letter.letterSpacing = 0.04f
    // Chữ cái theo cách lấy chung (chữ đầu họ + chữ đầu tên).
    letter.text = OverlayChatTheme.initials(conv.lastSender.ifBlank { conv.title.ifBlank { conv.letter } })
    letter.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )

    val avatar = ImageView(this)
    avatar.scaleType = ImageView.ScaleType.CENTER_CROP
    avatar.visibility = View.GONE
    avatar.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )

    clipHost.addView(letter)
    clipHost.addView(avatar)
    if (dim) {
      val shade = View(this)
      shade.setBackgroundColor(Color.argb(70, 0, 0, 0))
      clipHost.addView(shade, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }
    outer.addView(clipHost)
    loadAvatarInto(conv.avatarUrl, avatar, letter, clipHost, conv.title, conv.letter)
    return outer
  }

  private fun showConvPicker() {
    hideConvPicker()
    if (!Settings.canDrawOverlays(this)) return
    val wm = windowManager ?: return
    val lp = layoutParams ?: return
    val dm = resources.displayMetrics
    val convs = convStack.values.toList().asReversed()

    val root = FrameLayout(this)

    val scrim = View(this)
    scrim.setBackgroundColor(Color.argb(90, 0, 0, 0))
    scrim.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
    scrim.setOnClickListener { hideConvPicker() }
    root.addView(scrim)

    val menu = LinearLayout(this)
    menu.orientation = LinearLayout.VERTICAL
    val menuBg = GradientDrawable()
    menuBg.cornerRadius = dp(14).toFloat()
    menuBg.setColor(Color.parseColor("#F8FAFC"))
    menuBg.setStroke(dp(1), Color.parseColor("#336C5CE7"))
    menu.background = menuBg
    menu.elevation = dp(10).toFloat()
    menu.setPadding(dp(6), dp(6), dp(6), dp(6))

    val titleTv = TextView(this)
    titleTv.text = "Chọn cuộc trò chuyện"
    titleTv.setTextColor(Color.parseColor("#64748B"))
    titleTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    titleTv.setPadding(dp(10), dp(6), dp(10), dp(4))
    menu.addView(titleTv)

    for (conv in convs) {
      val row = LinearLayout(this)
      row.orientation = LinearLayout.HORIZONTAL
      row.gravity = Gravity.CENTER_VERTICAL
      row.setPadding(dp(8), dp(8), dp(8), dp(8))
      row.isClickable = true
      row.background = GradientDrawable().apply {
        cornerRadius = dp(10).toFloat()
        setColor(Color.WHITE)
      }
      val mini = buildMiniBubble(conv, dp(40))
      mini.isClickable = false
      mini.isFocusable = false
      row.addView(mini, LinearLayout.LayoutParams(dp(40), dp(40)))
      val textCol = LinearLayout(this)
      textCol.orientation = LinearLayout.VERTICAL
      textCol.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
      val nameTv = TextView(this)
      val displayName = conv.lastSender.ifBlank { conv.title }.ifBlank { "Chat" }
      nameTv.text = displayName
      nameTv.setTextColor(Color.parseColor("#0F172A"))
      nameTv.setTypeface(nameTv.typeface, Typeface.BOLD)
      nameTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      nameTv.maxLines = 1
      textCol.addView(nameTv)
      if (conv.title.isNotBlank() && conv.lastSender.isNotBlank() && conv.title != conv.lastSender) {
        textCol.addView(TextView(this).apply {
          text = conv.title
          setTextColor(Color.parseColor("#64748B"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          maxLines = 1
        })
      }
      if (conv.lastPreview.isNotBlank()) {
        textCol.addView(TextView(this).apply {
          text = conv.lastPreview.take(60)
          setTextColor(Color.parseColor("#94A3B8"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          maxLines = 1
        })
      }
      row.addView(textCol)
      row.setOnClickListener {
        selectConversation(conv.groupId)
        hideConvPicker()
        openPendingChat()
      }
      val rowLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      )
      rowLp.bottomMargin = dp(6)
      menu.addView(row, rowLp)
    }

    val menuW = dp(260)
    val menuLp = FrameLayout.LayoutParams(
      menuW,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.TOP or Gravity.START,
    )
    menuLp.topMargin = lp.y + lp.height + dp(8)
    menuLp.leftMargin = (lp.x + lp.width - menuW).coerceIn(dp(8), dm.widthPixels - menuW - dp(8))
    root.addView(menu, menuLp)

    val pickerParams = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    )
    pickerParams.gravity = Gravity.TOP or Gravity.START
    wm.addView(root, pickerParams)
    convPickerRoot = root
  }

  private fun hideConvPicker() {
    convPickerRoot?.let {
      try {
        windowManager?.removeView(it)
      } catch (_: Exception) { }
    }
    convPickerRoot = null
  }

  private fun selectConversation(groupId: String) {
    val conv = convStack[groupId] ?: return
    bubbleGroupId = conv.groupId
    bubbleTitle = conv.title
    bubbleLetter = conv.letter
    bubbleAvatarUrl = conv.avatarUrl
  }

  /**
   * Khi kéo bong bóng, các cuộc trò chuyện nằm dưới hơi lộ ra phía SAU hướng kéo (như đuôi): lệch ngược chiều di chuyển, càng
   * sâu càng lệch xa, tối đa 6dp mỗi lớp (nằm gọn trong lề cửa sổ). Ngừng kéo là tự thu về.
   */
  private fun trailTo(vx: Float, vy: Float) {
    // vx, vy: vận tốc kéo (px/ms). Tính theo vận tốc (không theo từng nhịp cảm ứng) để mức lộ ra ổn định ở mọi tốc độ cập nhật.
    if (trailViews.isEmpty()) return
    val cap = dp(13).toFloat() // 2 lớp × 13dp = 26dp ≤ lề cửa sổ (bubbleMargin), không bị cắt
    for ((v, depth) in trailViews) {
      val limit = cap * depth
      val tx = (-vx * 150f * depth).coerceIn(-limit, limit)
      val ty = (-vy * 150f * depth).coerceIn(-limit, limit)
      v.animate().cancel()
      v.translationX += (tx - v.translationX) * 0.5f
      v.translationY += (ty - v.translationY) * 0.5f
    }
    handler.removeCallbacks(trailRelaxRunnable)
    handler.postDelayed(trailRelaxRunnable, 140)
  }

  private fun trailBack() {
    handler.removeCallbacks(trailRelaxRunnable)
    for ((v, _) in trailViews) {
      v.animate()
        .translationX(0f)
        .translationY(0f)
        .setDuration(240)
        .setInterpolator(OvershootInterpolator(2f))
        .start()
    }
  }

  private fun attachDrag(root: FrameLayout, params: WindowManager.LayoutParams) {
    var downX = 0f
    var downY = 0f
    var lastX = 0f
    var lastY = 0f
    var lastT = 0L
    var startX = 0
    var startY = 0
    var moved = false
    root.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          lastX = event.rawX
          lastY = event.rawY
          lastT = event.eventTime
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
          val dt = (event.eventTime - lastT).coerceAtLeast(1L).toFloat()
          if (moved) {
            showDismissTarget()
            updateDismissTarget(params)
            trailTo((event.rawX - lastX) / dt, (event.rawY - lastY) / dt)
          }
          lastX = event.rawX
          lastY = event.rawY
          lastT = event.eventTime
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          trailBack()
          val droppedOnX = event.actionMasked == MotionEvent.ACTION_UP && moved && dismissOver
          hideDismissTarget()
          if (!moved) {
            root.performClick()
          } else if (droppedOnX) {
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

  // ---- Ô tròn X để tắt bong bóng: chỉ khi THẢ bong bóng vào ô này mới tắt (kéo đi đâu khác chỉ là dời chỗ) ----
  private var dismissTarget: FrameLayout? = null
  private var dismissOver = false

  private fun dismissTargetSize(): Int = dp(64)

  /** Tâm ô X (tọa độ màn hình): giữa chiều ngang, cách đáy ~110dp (trên thanh điều hướng). */
  private fun dismissTargetCenter(): Pair<Float, Float> {
    val dm = resources.displayMetrics
    return Pair(dm.widthPixels / 2f, dm.heightPixels - dp(110).toFloat())
  }

  private fun showDismissTarget() {
    if (dismissTarget != null) return
    val wm = windowManager ?: return
    val size = dismissTargetSize()
    val box = FrameLayout(this)
    box.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.argb(190, 20, 24, 36))
      setStroke(dp(2), Color.argb(230, 255, 255, 255))
    }
    box.elevation = dp(6).toFloat()
    val x = TextView(this)
    x.text = "✕"
    x.gravity = Gravity.CENTER
    x.setTextColor(Color.WHITE)
    x.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
    x.setTypeface(x.typeface, Typeface.BOLD)
    box.addView(x, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    val (cx, cy) = dismissTargetCenter()
    val lp = WindowManager.LayoutParams(
      size,
      size,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    lp.gravity = Gravity.TOP or Gravity.START
    lp.x = (cx - size / 2f).toInt()
    lp.y = (cy - size / 2f).toInt()
    box.alpha = 0f
    box.scaleX = 0.6f
    box.scaleY = 0.6f
    try {
      wm.addView(box, lp)
    } catch (_: Exception) {
      return
    }
    dismissTarget = box
    dismissOver = false
    box.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(180).setInterpolator(OvershootInterpolator(1.6f)).start()
  }

  /** Cập nhật trạng thái «đang ở trên ô X»: phóng to ô, đổi màu đỏ; trả về true nếu đang ở trên. */
  private fun updateDismissTarget(params: WindowManager.LayoutParams): Boolean {
    val box = dismissTarget ?: return false
    val m = bubbleMargin()
    val bx = params.x + m + dp(58) / 2f
    val by = params.y + m + stackExtraPx + dp(58) / 2f
    val (cx, cy) = dismissTargetCenter()
    val dist = hypot((bx - cx).toDouble(), (by - cy).toDouble())
    val over = dist <= dp(64)
    if (over != dismissOver) {
      dismissOver = over
      (box.background as? GradientDrawable)?.setColor(if (over) Color.argb(235, 239, 68, 68) else Color.argb(190, 20, 24, 36))
      box.animate().cancel()
      box.animate().scaleX(if (over) 1.3f else 1f).scaleY(if (over) 1.3f else 1f).setDuration(120).start()
    }
    return over
  }

  private fun hideDismissTarget() {
    val box = dismissTarget ?: return
    dismissTarget = null
    dismissOver = false
    box.animate().cancel()
    box.animate().alpha(0f).scaleX(0.6f).scaleY(0.6f).setDuration(140).withEndAction {
      try {
        windowManager?.removeView(box)
      } catch (_: Exception) { }
    }.start()
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
    // Cửa sổ đã có lề bubbleMargin() mỗi bên → dựa sát mép màn hình để bong bóng cách mép ≈ bubbleMargin().
    params.x = if (params.x + bubbleSize / 2 < mid) 0 else dm.widthPixels - bubbleSize
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
    hideConvPicker()
    badgeCount = 0
    saveBadgeToPrefs()
    updateBadge()
    removePeek()
    closeChatPanel()
    showNativeChatPanel()
  }

  /** Dải «đầu chat» trong khung: cuộc đang mở đứng đầu, kế đó các cuộc gần nhất (tối đa 4). */
  private fun chatHeads(): List<OverlayChatPanel.Head> {
    // Khung đang mở đoạn nào thì đoạn đó đứng đầu (kể cả khi bong bóng đã chuyển sang cuộc mới nhất do có tin đến).
    val activeGid = openPanelGroupId().ifBlank { bubbleGroupId }
    val active = convStack[activeGid]
    val others = convStack.values.filter { it.groupId != activeGid }.reversed()
    return (listOfNotNull(active) + others).take(4).map {
      OverlayChatPanel.Head(
        it.groupId,
        it.title.ifBlank { it.lastSender.ifBlank { "Chat" } },
        it.avatarUrl.ifBlank { null },
      )
    }
  }

  /** groupId của đoạn chat đang mở trong khung (rỗng nếu khung chưa mở). */
  private fun openPanelGroupId(): String {
    val p = chatPanel ?: return ""
    return if (p.isAlive()) p.currentGroupId() else ""
  }

  /** Chiều cao dải đầu chat phía trên khung chat (gồm thanh trạng thái). */
  private fun chatHeadsReserve(): Int = statusBarHeight() + dp(76)

  /** Panel overlay native — không mở MainActivity, chat nổi trên app khác. */
  private fun showNativeChatPanel() {
    val wm = windowManager ?: return
    val topReserve = chatHeadsReserve()
    bubbleRoot?.visibility = View.GONE
    chatPanel = OverlayChatPanel(
      this,
      wm,
      onClosed = {
        chatPanel = null
        restoreBubbleAnimated()
      },
      onExpand = { gid, title -> openBubbleChatInApp(gid, title) },
      onStartCall = { gid, title, media -> openOutboundCallInApp(gid, title, media) },
      originProvider = { bubbleCenter() },
      onSelectHead = { gid, name ->
        // Chọn một đoạn chat khác (từ dải đầu chat hoặc trang «Đoạn chat»): chuyển cuộc đang mở, khung tự tải lại tin.
        // Đoạn chat chưa từng hiện bong bóng thì thêm vào chồng trước.
        if (convStack[gid] == null) {
          upsertConversation(gid, name, name.firstOrNull()?.uppercaseChar()?.toString() ?: "?", "", "", "", false)
        }
        selectConversation(gid)
        chatPanel?.show(bubbleGroupId, bubbleTitle, topReserve, chatHeads())
      },
    )
    chatPanel?.show(bubbleGroupId, bubbleTitle, topReserve, chatHeads())
  }

  /** Tâm bong bóng thật (đã trừ lề cửa sổ) theo toạ độ màn hình — gốc của hiệu ứng bung/thu khung chat. */
  private fun bubbleCenter(): Pair<Float, Float>? {
    val lp = layoutParams ?: return null
    val m = bubbleMargin()
    return Pair(lp.x + m + dp(58) / 2f, lp.y + m + stackExtraPx + dp(58) / 2f)
  }

  /** Bong bóng hiện lại sau khi khung chat thu về: phóng nhẹ từ nhỏ lên, có độ nảy. */
  private fun restoreBubbleAnimated() {
    val root = bubbleRoot ?: return
    root.animate().cancel()
    root.visibility = View.VISIBLE
    root.alpha = 0f
    root.scaleX = 0.4f
    root.scaleY = 0.4f
    entranceUntilMs = System.currentTimeMillis() + 340
    root.animate()
      .alpha(1f)
      .scaleX(1f)
      .scaleY(1f)
      .setDuration(300)
      .setInterpolator(OvershootInterpolator(2.2f))
      .withEndAction {
        root.alpha = 1f
        root.scaleX = 1f
        root.scaleY = 1f
      }
      .start()
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

  private fun stashPendingOutboundCall(groupId: String, title: String, media: String) {
    try {
      val obj = org.json.JSONObject()
      obj.put("groupId", groupId)
      obj.put("title", title.ifBlank { "Chat" })
      obj.put("media", if (media == "video") "video" else "audio")
      obj.put("ts", System.currentTimeMillis())
      prefs().edit().putString(PREF_PENDING_OUTBOUND_CALL, obj.toString()).apply()
    } catch (_: Exception) { }
  }

  private fun openOutboundCallInApp(groupId: String, title: String, media: String) {
    if (groupId.isBlank()) return
    closeChatPanel()
    stashPendingOutboundCall(groupId, title, media)
    FloatingBubbleBridge.emitStartCall(groupId, title, media)
    val intent = Intent(this, MainActivity::class.java).apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
          or Intent.FLAG_ACTIVITY_SINGLE_TOP
          or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
          or Intent.FLAG_ACTIVITY_NO_ANIMATION,
      )
      putExtra("outbound_call", true)
      putExtra("group_id", groupId)
      putExtra("title", title)
      putExtra("call_media", media)
    }
    startActivity(intent)
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

    val pal = OverlayChatTheme.palette(this)
    val title = if (sender.isNotBlank()) sender else bubbleTitle
    val pad = peekShadowPad()
    val bubbleOnRight = lp.x + lp.width / 2 >= dm.widthPixels / 2

    // Vỏ ngoài chừa lề để bóng đổ của thẻ không bị cắt ở mép cửa sổ overlay.
    val shell = FrameLayout(this)
    shell.id = R.id.sx_bubble_peek
    shell.clipChildren = false
    shell.clipToPadding = false
    shell.setPadding(pad, pad, pad, pad)

    // Thẻ thông báo: nền trắng bo lớn (22dp), bóng đổ mềm, không viền. Từ trái sang phải: avatar tròn màu cam có chữ cái →
    // (tên đậm + giờ · nội dung xám tối đa 2 dòng) → chấm đỏ «chưa đọc». Rộng vừa nội dung, nằm NGANG HÀNG bong bóng.
    val maxCardW = (dm.widthPixels - dp(58) - dp(12) - dp(28)).coerceAtMost(dp(320))
    val colMax = (maxCardW - dp(122)).coerceAtLeast(dp(120))

    val card = LinearLayout(this)
    card.orientation = LinearLayout.HORIZONTAL
    card.gravity = Gravity.CENTER_VERTICAL
    card.minimumWidth = dp(220)
    card.setPadding(dp(14), dp(12), dp(14), dp(12))
    card.elevation = dp(8).toFloat()
    card.background = GradientDrawable().apply {
      setColor(pal.bgElevated)
      cornerRadius = dp(22).toFloat()
    }

    // Avatar thẻ xem trước: ảnh người gửi nếu có, không thì chữ cái trên nền cam.
    val avatar = OverlayAvatarView(this)
      .style(Color.parseColor("#F97316"), Color.parseColor("#F97316"), 14f)
      .setAvatar(bubbleAvatarUrl, title)

    val nameTv = TextView(this)
    nameTv.setTextColor(pal.text)
    nameTv.setTypeface(nameTv.typeface, Typeface.BOLD)
    nameTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    nameTv.maxLines = 1
    nameTv.maxWidth = (colMax - dp(48)).coerceAtLeast(dp(72))
    nameTv.ellipsize = android.text.TextUtils.TruncateAt.END
    nameTv.text = title

    val timeTv = TextView(this)
    timeTv.setTextColor(pal.textFaint)
    timeTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    timeTv.text = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())

    val nameRow = LinearLayout(this)
    nameRow.orientation = LinearLayout.HORIZONTAL
    nameRow.gravity = Gravity.CENTER_VERTICAL
    nameRow.addView(nameTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    // Khoảng đệm co giãn đẩy giờ về sát mép phải của cột nội dung (tối thiểu 10dp khi thẻ ôm sát chữ).
    nameRow.addView(View(this), LinearLayout.LayoutParams(dp(10), 1, 1f))
    nameRow.addView(timeTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    val msgTv = TextView(this)
    msgTv.setTextColor(pal.textMuted)
    msgTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
    msgTv.setLineSpacing(0f, 1.08f)
    msgTv.maxLines = 2
    msgTv.maxWidth = colMax
    msgTv.ellipsize = android.text.TextUtils.TruncateAt.END
    msgTv.text = message.take(160)

    val col = LinearLayout(this)
    col.orientation = LinearLayout.VERTICAL
    col.addView(nameRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    col.addView(
      msgTv,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(2) },
    )

    // Chấm «chưa đọc»: tròn đỏ có chấm trắng nhỏ ở giữa.
    val dot = FrameLayout(this)
    dot.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.parseColor("#F43F5E"))
    }
    val dotCore = View(this)
    dotCore.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.WHITE)
    }
    dot.addView(
      dotCore,
      FrameLayout.LayoutParams(dp(4), dp(4)).apply { gravity = Gravity.CENTER },
    )

    card.addView(avatar, LinearLayout.LayoutParams(dp(44), dp(44)))
    card.addView(
      col,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        marginStart = dp(12)
        marginEnd = dp(12)
      },
    )
    card.addView(dot, LinearLayout.LayoutParams(dp(14), dp(14)))
    shell.addView(
      card,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT),
    )

    // Mũi nhọn nhỏ ở GIỮA cạnh hướng về bong bóng (hình thoi xoay 45°, cùng màu thẻ, bỏ bóng riêng để khỏi in lên thẻ).
    val tail = View(this)
    tail.setBackgroundColor(pal.bgElevated)
    tail.rotation = 45f
    tail.elevation = dp(9).toFloat()
    tail.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setEmpty()
      }
    }
    shell.addView(
      tail,
      FrameLayout.LayoutParams(dp(14), dp(14)).apply {
        // FrameLayout canh theo mép TRONG phần đệm (chính là mép thẻ) → lề âm 7dp để mũi nhọn nhô ra đúng nửa ngoài thẻ.
        if (bubbleOnRight) {
          gravity = Gravity.END or Gravity.CENTER_VERTICAL
          marginEnd = -dp(7)
        } else {
          gravity = Gravity.START or Gravity.CENTER_VERTICAL
          marginStart = -dp(7)
        }
      },
    )

    shell.setOnClickListener { openPendingChat() }

    // Đo trước để biết kích thước thẻ → đặt cửa sổ vừa khít và canh NGANG HÀNG với bong bóng.
    shell.measure(
      View.MeasureSpec.makeMeasureSpec(maxCardW + pad * 2, View.MeasureSpec.AT_MOST),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )
    peekW = shell.measuredWidth
    peekH = shell.measuredHeight
    val pos = peekPosition(lp, bubbleOnRight, dm.widthPixels, dm.heightPixels)
    peekToLeft = bubbleOnRight

    val peekParams = WindowManager.LayoutParams(
      peekW,
      peekH,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    peekParams.gravity = Gravity.TOP or Gravity.START
    peekParams.x = pos[0]
    peekParams.y = pos[1]
    wm.addView(shell, peekParams)
    peekRoot = shell

    // Hiện lên (floatPop): từ nhỏ 85% + nhích 14dp từ phía bong bóng ra, mờ dần vào, nảy nhẹ ở cuối (280ms).
    val fromBubble = if (bubbleOnRight) 1f else -1f
    shell.alpha = 0f
    shell.translationX = fromBubble * dp(14)
    shell.scaleX = 0.85f
    shell.scaleY = 0.85f
    shell.post {
      // Phóng ra từ cạnh thẻ gần bong bóng (đúng chỗ mũi nhọn).
      shell.pivotX = if (bubbleOnRight) (shell.width - pad).toFloat() else pad.toFloat()
      shell.pivotY = shell.height / 2f
      shell.animate()
        .alpha(1f)
        .translationX(0f)
        .scaleX(1f)
        .scaleY(1f)
        .setDuration(280)
        .setInterpolator(OvershootInterpolator(1.4f))
        .start()
    }

    peekHideRunnable?.let { handler.removeCallbacks(it) }
    peekHideRunnable = Runnable { hidePeekAnimated() }
    handler.postDelayed(peekHideRunnable!!, 5000)
  }

  /** Lề quanh thẻ (trong cửa sổ xem trước) để bóng đổ không bị cắt ở mép cửa sổ. */
  private fun peekShadowPad(): Int = dp(18)

  /** Lề đều quanh bong bóng trong cửa sổ overlay — chỗ cho vòng sáng nhấp nháy (~10dp) và bóng đổ không bị cắt. */
  private fun bubbleMargin(): Int = dp(28)

  /**
   * Vị trí cửa sổ xem trước: thẻ nằm NGANG HÀNG với bong bóng — canh giữa theo chiều dọc với tâm bong bóng, bên TRÁI bong bóng
   * khi bong bóng ở nửa phải màn hình (và ngược lại), cách 12dp (chừa chỗ cho mũi nhọn). Tính theo mép bong bóng THẬT (đã trừ
   * lề cửa sổ). Trả về [x, y].
   */
  private fun peekPosition(lp: WindowManager.LayoutParams, bubbleOnRight: Boolean, screenW: Int, screenH: Int): IntArray {
    val pad = peekShadowPad()
    val m = bubbleMargin()
    val gap = dp(12)
    val bubbleLeft = lp.x + m
    val bubbleRight = lp.x + lp.width - m
    val bubbleCenterY = lp.y + m + stackExtraPx + dp(58) / 2
    // Phần lề bóng đổ (pad) trong suốt nên được phép tràn ra ngoài mép màn hình; chỉ phần thẻ thật mới phải nằm trong màn hình.
    val x = (if (bubbleOnRight) bubbleLeft - gap + pad - peekW else bubbleRight + gap - pad)
      .coerceIn(-pad, (screenW - peekW + pad).coerceAtLeast(-pad))
    val y = (bubbleCenterY - peekH / 2)
      .coerceIn(dp(32) - pad, (screenH - peekH - dp(32) + pad).coerceAtLeast(dp(32) - pad))
    return intArrayOf(x, y)
  }

  /** Biến mất êm: mờ + nhích về phía bong bóng rồi mới gỡ khỏi màn hình. */
  private fun hidePeekAnimated() {
    val shell = peekRoot ?: return removePeek()
    shell.animate()
      .alpha(0f)
      .translationX((if (peekToLeft) 1f else -1f) * dp(10))
      .setDuration(200)
      .withEndAction { if (peekRoot === shell) removePeek() }
      .start()
  }

  private fun updatePeekPosition() {
    val peek = peekRoot ?: return
    val lp = layoutParams ?: return
    val dm = resources.displayMetrics
    val bubbleOnRight = lp.x + lp.width / 2 >= dm.widthPixels / 2
    val peekLp = peek.layoutParams as? WindowManager.LayoutParams ?: return
    val pos = peekPosition(lp, bubbleOnRight, dm.widthPixels, dm.heightPixels)
    peekLp.x = pos[0]
    peekLp.y = pos[1]
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

  private fun loadAvatarInto(
    url: String,
    imageView: ImageView,
    letter: TextView,
    host: FrameLayout,
    title: String,
    letterText: String,
  ) {
    if (url.isBlank()) {
      imageView.setImageDrawable(null)
      imageView.visibility = View.GONE
      letter.visibility = View.VISIBLE
      host.visibility = View.VISIBLE
      // Giữ nền chuyển màu hồng → tím của thiết kế (không còn đổi màu theo tên).
      return
    }
    // Dùng bộ nhớ đệm chung (RAM + đĩa, giải mã thu nhỏ): lần đầu tải một lần, các lần sau có ảnh ngay.
    OverlayAvatarCache.load(this, url) { bmp ->
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
    // Huy hiệu chỉ có nghĩa khi có bong bóng để gắn vào; chồng trống thì không vẽ bong bóng nào (xem rebuildStackUi) → ẩn luôn huy hiệu.
    if (badgeCount <= 0 || (convStack.isEmpty() && bubbleGroupId.isBlank())) {
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
    glowAnimator?.cancel()
    glowAnimator = null
    handler.removeCallbacks(trailRelaxRunnable)
    trailViews.clear()
    dismissTarget?.let {
      try {
        windowManager?.removeView(it)
      } catch (_: Exception) { }
    }
    dismissTarget = null
    closeChatPanel()
    removePeek()
    hideConvPicker()
    bubbleRoot?.let {
      try {
        windowManager?.removeView(it)
      } catch (_: Exception) { }
    }
    bubbleRoot = null
    stackHost = null
    badgeView = null
    layoutParams = null
    stackExtraPx = 0
    convStack.clear()
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
    const val PREF_PENDING_OUTBOUND_CALL = "pending_outbound_call_json"
    const val PREF_PENDING_GROUP = "pending_group_id"
    const val PREF_PENDING_TITLE = "pending_group_title"
    const val PREF_BUBBLE_DISMISSED = "bubble_dismissed"
    const val PREF_BADGE_COUNT = "badge_count"
    private const val CHANNEL_ID = "sx_bubble_overlay"
    private const val NOTIF_ID = 8801

    const val ACTION_START = "vn.tubeppro.sxmobile.overlay.START"
    const val ACTION_STOP = "vn.tubeppro.sxmobile.overlay.STOP"
    const val ACTION_SET_BADGE = "vn.tubeppro.sxmobile.overlay.SET_BADGE"
    const val ACTION_SHOW_BUBBLE = "vn.tubeppro.sxmobile.overlay.SHOW_BUBBLE"
    const val ACTION_SHOW_PEEK = "vn.tubeppro.sxmobile.overlay.SHOW_PEEK"
    const val ACTION_SHOW_CALL_OVERLAY = "vn.tubeppro.sxmobile.overlay.SHOW_CALL_OVERLAY"
    const val ACTION_HIDE_CALL_OVERLAY = "vn.tubeppro.sxmobile.overlay.HIDE_CALL_OVERLAY"
    const val ACTION_OPEN_CHAT_PANEL = "vn.tubeppro.sxmobile.overlay.OPEN_CHAT_PANEL"
    const val ACTION_CLOSE_CHAT_PANEL = "vn.tubeppro.sxmobile.overlay.CLOSE_CHAT_PANEL"
    const val ACTION_SEED_MESSAGES = "vn.tubeppro.sxmobile.overlay.SEED_MESSAGES"
    const val ACTION_APPEND_MESSAGE = "vn.tubeppro.sxmobile.overlay.APPEND_MESSAGE"

    const val EXTRA_BADGE = "badge"
    const val EXTRA_GROUP_ID = "group_id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_LETTER = "letter"
    const val EXTRA_AVATAR_URL = "avatar_url"
    const val EXTRA_SENDER = "sender"
    const val EXTRA_MESSAGE = "message"
    const val EXTRA_MESSAGE_ID = "message_id"
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
