package vn.tubeppro.sxmobile.overlay

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Panel chat overlay — trả lời, cảm xúc, gửi file/ảnh/video/chụp/quay.
 */
class OverlayChatPanel(
  private val context: Context,
  private val windowManager: WindowManager,
  private val onClosed: () -> Unit,
  private val onExpand: (groupId: String, title: String) -> Unit = { _, _ -> },
  private val onStartCall: (groupId: String, title: String, media: String) -> Unit = { _, _, _ -> },
  private val onSelectHead: (groupId: String, title: String) -> Unit = { _, _ -> },
  /** Máy chủ đã nhận «đã đọc» của đoạn này — nơi gọi dọn huy hiệu / báo cho app. Luôn chạy trên luồng chính. */
  private val onGroupRead: (groupId: String) -> Unit = { },
  /** Tâm bong bóng (toạ độ màn hình) — khung chat bung ra từ đó và thu về đó. null = không hiệu ứng. */
  private val originProvider: () -> Pair<Float, Float>? = { null },
) {
  /** Một cuộc trò chuyện hiện ở dải «đầu chat» phía trên khung (cuộc đang mở đứng đầu). */
  data class Head(val groupId: String, val title: String, val avatarUrl: String? = null)

  private var heads: List<Head> = emptyList()
  private var headsStrip: LinearLayout? = null
  private val handler = Handler(Looper.getMainLooper())
  private var panelRoot: FrameLayout? = null
  private var columnRoot: LinearLayout? = null
  private var messagesWrap: LinearLayout? = null
  private var scrollView: ScrollView? = null
  private var inputView: EditText? = null
  private var sendButton: View? = null
  private var replyBar: LinearLayout? = null
  private var pendingStrip: HorizontalScrollView? = null
  private var pendingRow: LinearLayout? = null
  private var replyToId: String? = null
  private var replyToSender: String? = null
  private var replyToText: String? = null
  private val pendingFiles = ArrayList<BubbleChatApi.PendingFile>()
  private var sending = false
  private var keyboardListener: ViewTreeObserver.OnGlobalLayoutListener? = null
  private var statusView: TextView? = null
  private var titleView: TextView? = null
  private var subtitleView: TextView? = null
  private var avatarView: OverlayAvatarView? = null
  /** Ảnh đại diện của đoạn chat đang mở (từ máy chủ: người đối diện nếu chat 1-1, ảnh nhóm nếu là nhóm). */
  private var metaAvatarUrl: String? = null
  /** Ảnh đại diện của từng người gửi đã thấy trong đoạn chat (khoá = userId hoặc tên) — để tin chèn cục bộ vẫn có ảnh. */
  private val senderAvatars = HashMap<String, String>()
  private var composerWrap: LinearLayout? = null
  private var popupLayer: FrameLayout? = null
  private var scrimView: View? = null
  private var panelParams: WindowManager.LayoutParams? = null
  private var groupId = ""
  private var title = ""
  private var isDirect = true
  private var isGroupChat = false
  private val messages = ArrayList<BubbleChatApi.ChatMessage>()
  private var basePanelHeight = 0
  private var panelTopReserve = 0
  private var keyboardLiftPx = 0
  private var keyboardPollRunnable: Runnable? = null
  private var pickerBackupParams: WindowManager.LayoutParams? = null
  private var suspendedForPicker = false
  private var suspendedForCompose = false
  private var loadSeq = 0
  private var reloadRunnable: Runnable? = null
  private var collapsing = false
  /** Thời điểm (uptimeMillis) hiệu ứng bung dự kiến xong — kết quả tải chỉ được VẼ sau mốc này. 0 = không có hiệu ứng. */
  private var animationEndsAt = 0L
  private var showAtMs = 0L
  private var lastBuildMs = 0L

  private companion object {
    const val EXPAND_MS = 320L

    /** Bản sao đoạn chat đã tải (theo groupId, tối đa 6) để mở lại là có tin + avatar ngay, rồi làm mới ở nền. */
    class CachedConv(
      val title: String,
      val messages: List<BubbleChatApi.ChatMessage>,
      val metaAvatarUrl: String?,
      val isDirect: Boolean,
      val senderAvatars: Map<String, String>,
    )

    val convCache = object : LinkedHashMap<String, CachedConv>(8, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CachedConv>?): Boolean = size > 6
    }
  }

  private val quickReactions = arrayOf("👍", "❤️", "😂", "😮", "😢", "🙏")

  /** Panel còn tồn tại (kể cả đang ẩn tạm cho compose/picker). */
  fun isAlive(): Boolean = panelRoot != null

  /** Panel đang gắn WindowManager và nhìn thấy được. */
  fun isVisibleOnScreen(): Boolean = isAlive() && !suspendedForPicker && !suspendedForCompose

  /** @deprecated dùng isVisibleOnScreen — giữ cho Service cũ nếu cần. */
  fun isShowing(): Boolean = isVisibleOnScreen()

  fun show(groupId: String, title: String, topReservePx: Int = 0, heads: List<Head> = emptyList()) {
    if (groupId.isBlank()) return
    if (this.groupId != groupId) {
      // Đổi sang cuộc trò chuyện khác: xóa tin cũ để khỏi nháy nội dung của cuộc trước.
      messages.clear()
      messagesWrap?.removeAllViews()
      metaAvatarUrl = null
      senderAvatars.clear()
    }
    this.groupId = groupId
    this.title = title.ifBlank { "Chat" }
    this.heads = heads
    if (panelRoot != null) {
      applyPanelTop(topReservePx)
      applyHeader()
      rebuildHeads()
      animationEndsAt = 0L
      showAtMs = android.os.SystemClock.uptimeMillis()
      val usedCache = applyCachedConversation(groupId)
      loadConversationAsync(usedCache)
      // Chuyển sang đoạn khác (đầu chat / trang «Đoạn chat»): đoạn vừa mở cũng phải được đánh dấu đã đọc.
      markCurrentRead(force = true)
      BubbleMediaBridge.registerPanel(this)
      BubbleComposeBridge.registerPanel(this)
      ensurePanelAttached(force = true)
      return
    }
    showAtMs = android.os.SystemClock.uptimeMillis()
    // Tải sẵn ảnh đại diện (đầu chat + của đoạn này) để giải mã chạy SONG SONG với việc dựng khung.
    for (h in heads) OverlayAvatarCache.prefetch(context, h.avatarUrl)
    convCache[groupId]?.let { c ->
      OverlayAvatarCache.prefetch(context, c.metaAvatarUrl)
      for (u in c.senderAvatars.values.distinct().take(8)) OverlayAvatarCache.prefetch(context, u)
    }
    val buildStart = android.os.SystemClock.uptimeMillis()
    buildPanel(topReservePx)
    lastBuildMs = android.os.SystemClock.uptimeMillis() - buildStart
    // Bản sao đã tải lần trước (nếu có): vẽ ngay 20 tin cuối để khung mở ra đã có tin + avatar, rồi làm mới ở nền.
    val usedCache = applyCachedConversation(groupId)
    val animated = playExpand()
    // Việc TẢI bắt đầu ngay (không gây giật); chỉ việc VẼ ~60 hàng tin mới phải đợi bung xong.
    animationEndsAt = if (animated) android.os.SystemClock.uptimeMillis() + 120 + EXPAND_MS else 0L
    loadConversationAsync(usedCache)
    // markRead chạy ở luồng nền (trước đây gọi thẳng trên luồng chính → Android chặn mạng, lỗi bị nuốt, máy chủ không bao giờ nhận).
    markCurrentRead(force = true)
    BubbleMediaBridge.registerPanel(this)
    BubbleComposeBridge.registerPanel(this)
  }

  /** Cập nhật dải đầu chat (có người nhắn mới ở đoạn khác) mà không tải lại tin của đoạn đang mở. */
  fun updateHeads(newHeads: List<Head>) {
    heads = newHeads
    if (panelRoot != null && isVisibleOnScreen()) rebuildHeads()
  }

  /** Ẩn panel tạm (không removeView) để picker không bị che. */
  fun prepareForExternalPicker() {
    if (suspendedForPicker || suspendedForCompose) return
    hidePopups()
    dismissComposerFocus()
    panelRoot?.visibility = View.GONE
    suspendedForPicker = true
  }

  fun suspendForExternalPicker() = prepareForExternalPicker()

  fun resumeAfterExternalPicker(onReady: (() -> Unit)? = null) {
    val wasSuspended = suspendedForPicker
    suspendedForPicker = false
    if (!wasSuspended) {
      ensurePanelAttached()
      onReady?.invoke()
      return
    }
    if (suspendedForCompose || BubbleComposeBridge.isComposeOpen()) return
    restorePanelAfterPicker(onReady)
  }

  fun onPickerFilesDelivered() {
    handler.post {
      refreshPendingStrip()
      updateSendButton()
      scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
    }
  }

  private fun restorePanelAfterPicker(onReady: (() -> Unit)? = null) {
    fun attempt(runCallback: Boolean) {
      if (suspendedForPicker || suspendedForCompose) return
      pickerBackupParams = null
      panelRoot?.visibility = View.VISIBLE
      ensurePanelAttached(force = true)
      applyPanelTop(panelTopReserve)
      applyHeader()
      refreshPendingStrip()
      updateSendButton()
      scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
      if (runCallback) onReady?.invoke()
    }
    attempt(false)
    handler.postDelayed({ attempt(true) }, 80)
  }

  /** Ẩn overlay khi mở Activity soạn tin (bàn phím adjustResize). */
  fun suspendForCompose() {
    if (suspendedForCompose || suspendedForPicker) return
    hidePopups()
    val root = panelRoot ?: return
    try {
      windowManager.removeView(root)
      suspendedForCompose = true
    } catch (_: Exception) { }
  }

  fun resumeAfterCompose(refresh: Boolean) {
    val wasSuspended = suspendedForCompose
    suspendedForCompose = false
    if (!wasSuspended) return
    if (!suspendedForPicker) {
      ensurePanelAttached(force = true)
      if (refresh) {
        loadConversationAsync()
      } else if (messages.isNotEmpty()) {
        renderMessages()
      }
      scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
    }
  }

  /** Gắn lại panel nếu bị orphan sau picker/compose. */
  private fun ensurePanelAttached(force: Boolean = false) {
    val root = panelRoot ?: return
    val params = panelParams ?: return
    if (suspendedForPicker || suspendedForCompose) return
    if (!force && root.isAttachedToWindow) return
    try {
      if (root.isAttachedToWindow) {
        windowManager.updateViewLayout(root, params)
      } else {
        windowManager.addView(root, params)
      }
    } catch (_: Exception) {
      try { windowManager.addView(root, params) } catch (_: Exception) { }
    }
  }

  private var morphAnimator: android.animation.ValueAnimator? = null

  /** Các lớp nội dung của khung (mọi thứ trừ lớp nền mờ) — cùng co/giãn về tâm bong bóng. */
  private fun contentViews(root: FrameLayout): List<View> =
    (0 until root.childCount).map { root.getChildAt(it) }.filter { it !== scrimView }

  /**
   * Bung/thu giữa khung chat và bong bóng. Nội dung phóng/thu quanh tâm bong bóng, còn lớp nền mờ KHÔNG co theo mà chỉ mờ
   * dần/đậm dần — nếu co cả lớp nền thì phần màn hình nền lộ ra sáng bật lên từng mảng, nhìn như bị chớp.
   * Một bộ hẹn giờ duy nhất điều khiển mọi lớp nên chúng luôn khớp nhau.
   */
  private fun runMorph(root: FrameLayout, origin: Pair<Float, Float>, expand: Boolean, durationMs: Long, onEnd: () -> Unit) {
    morphAnimator?.cancel()
    val kids = contentViews(root)
    val scrim = scrimView
    kids.forEach {
      it.pivotX = origin.first - it.left
      it.pivotY = origin.second - it.top
      it.setLayerType(View.LAYER_TYPE_HARDWARE, null)
    }
    val shape = if (expand) android.view.animation.PathInterpolator(0.2f, 0f, 0f, 1f)
    else android.view.animation.PathInterpolator(0.4f, 0f, 0.8f, 0.4f)
    val anim = android.animation.ValueAnimator.ofFloat(0f, 1f)
    anim.duration = durationMs
    anim.interpolator = android.view.animation.LinearInterpolator()
    anim.addUpdateListener { va ->
      val t = va.animatedFraction
      val p = shape.getInterpolation(t)
      val open = if (expand) p else 1f - p
      val sc = 0.06f + 0.94f * open
      // Mở: nội dung hiện nhanh ở nửa đầu. Thu: nội dung mờ ở nửa sau để không biến mất đột ngột.
      val a = if (expand) (t / 0.45f).coerceIn(0f, 1f) else 1f - ((t - 0.35f) / 0.65f).coerceIn(0f, 1f)
      for (v in kids) {
        v.scaleX = sc
        v.scaleY = sc
        v.alpha = a
      }
      scrim?.alpha = if (expand) (t / 0.7f).coerceIn(0f, 1f) else 1f - (t / 0.85f).coerceIn(0f, 1f)
    }
    anim.addListener(object : android.animation.AnimatorListenerAdapter() {
      private var cancelled = false
      override fun onAnimationCancel(animation: android.animation.Animator) { cancelled = true }
      override fun onAnimationEnd(animation: android.animation.Animator) {
        if (morphAnimator === animation) morphAnimator = null
        if (cancelled) return
        if (expand) {
          for (v in kids) {
            v.scaleX = 1f
            v.scaleY = 1f
            v.alpha = 1f
            v.setLayerType(View.LAYER_TYPE_NONE, null)
          }
          scrim?.alpha = 1f
        }
        onEnd()
      }
    })
    morphAnimator = anim
    anim.start()
  }

  /** Bung ra từ bong bóng (như Messenger). Trả về false nếu không có hiệu ứng (không biết vị trí bong bóng). */
  private fun playExpand(): Boolean {
    val root = panelRoot ?: return false
    val origin = originProvider() ?: return false
    // Trạng thái đầu: trong suốt hoàn toàn, để khung hình đầu (dựng + đo + vẽ khung chat — rất nặng) vẽ xong mà không thấy gì.
    contentViews(root).forEach {
      it.alpha = 0f
      it.scaleX = 0.06f
      it.scaleY = 0.06f
    }
    scrimView?.alpha = 0f
    // Chỉ chạy hiệu ứng sau khi khung hình đầu đã vẽ xong, nếu không hiệu ứng bị nuốt mất vài chục mili giây đầu và nhảy cóc.
    root.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        root.viewTreeObserver.removeOnPreDrawListener(this)
        root.post {
          if (panelRoot !== root) return@post
          runMorph(root, origin, expand = true, durationMs = EXPAND_MS) { }
        }
        return true
      }
    })
    return true
  }

  /** Thu lại thành bong bóng: khung co về tâm bong bóng rồi mới gỡ; bong bóng hiện lại ở `onClosed`. */
  fun collapse() {
    val root = panelRoot ?: return
    if (collapsing) return
    // Đang bung dở thì bỏ qua lệnh thu (tránh nhảy trạng thái giữa chừng).
    if (morphAnimator?.isRunning == true) return
    val origin = originProvider()
    if (origin == null || suspendedForPicker || suspendedForCompose) {
      hide()
      return
    }
    collapsing = true
    hidePopups()
    dismissComposerFocus()
    hideKeyboard()
    runMorph(root, origin, expand = false, durationMs = 280) { hide() }
  }

  fun hide() {
    morphAnimator?.cancel()
    morphAnimator = null
    collapsing = false
    hidePopups()
    hideKeyboard()
    BubbleComposeBridge.dismissComposeIfOpen()
    BubbleMediaBridge.registerPanel(null)
    BubbleComposeBridge.registerPanel(null)
    keyboardListener?.let { listener ->
      panelRoot?.viewTreeObserver?.removeOnGlobalLayoutListener(listener)
    }
    keyboardListener = null
    stopKeyboardPolling()
    pickerBackupParams = null
    panelRoot?.let {
      try { windowManager.removeView(it) } catch (_: Exception) { }
    }
    inboxRoot = null
    inboxListWrap = null
    inboxTray = null
    inboxOpen = false
    inboxRows = emptyList()
    panelRoot = null
    headsStrip = null
    columnRoot = null
    messagesWrap = null
    scrollView = null
    inputView = null
    sendButton = null
    replyBar = null
    pendingStrip = null
    pendingRow = null
    statusView = null
    composerWrap = null
    popupLayer = null
    scrimView = null
    replyToId = null
    replyToSender = null
    replyToText = null
    pendingFiles.clear()
    sending = false
    suspendedForPicker = false
    suspendedForCompose = false
    messages.clear()
    onClosed()
  }

  fun currentGroupId(): String = groupId

  private var lastMarkReadAt = 0L
  private var lastMarkReadGroup = ""
  private var trailingMarkRead: Runnable? = null

  /**
   * Báo máy chủ «đã đọc» đoạn đang mở (luồng nền). Thành công thì: dòng của đoạn này ở trang «Đoạn chat» hết đậm/hết số,
   * và onGroupRead để Service dọn huy hiệu + app chính cập nhật số chưa đọc.
   * [force] = false thì giãn ≥ 2 giây giữa hai lần cho cùng một đoạn (tin đến dồn dập).
   */
  private fun markCurrentRead(force: Boolean) {
    val gid = groupId
    if (gid.isBlank() || panelRoot == null) return
    val now = android.os.SystemClock.uptimeMillis()
    if (!force && gid == lastMarkReadGroup && now - lastMarkReadAt < 2_000L) {
      // Giãn nhịp nhưng không bỏ rơi tin đến trong khoảng đó: hẹn một lần cuối ngay sau khi hết giãn.
      trailingMarkRead?.let { handler.removeCallbacks(it) }
      val r = Runnable { if (this.groupId == gid) markCurrentRead(force = true) }
      trailingMarkRead = r
      handler.postDelayed(r, 2_000L - (now - lastMarkReadAt) + 50L)
      return
    }
    lastMarkReadGroup = gid
    lastMarkReadAt = now
    BubbleChatApi.markRead(context, gid) { ok ->
      if (!ok) return@markRead
      handler.post {
        inboxRows = inboxRows.map { if (it.id == gid) it.copy(unread = 0) else it }
        if (inboxOpen) renderInboxList()
        onGroupRead(gid)
      }
    }
  }

  fun reloadMessages() {
    reloadRunnable?.let { handler.removeCallbacks(it) }
    reloadRunnable = Runnable { loadConversationAsync() }
    handler.postDelayed(reloadRunnable!!, 320)
  }

  fun seedMessages(json: String) {
    if (!isAlive()) return
    val myId = myUserId()
    val parsed = BubbleChatApi.parseMessagesFromSeed(json, myId)
    if (parsed.isEmpty()) return
    handler.post {
      messages.clear()
      messages.addAll(parsed)
      isGroupChat = !isDirect && parsed.map { it.userId }.distinct().size > 1
      if (isVisibleOnScreen()) renderMessages()
    }
  }

  fun appendIncoming(sender: String, text: String, messageId: String? = null, avatarUrl: String? = null) {
    if (!isAlive()) return
    handler.post {
      val body = normalizeMsgText(text)
      if (body.isBlank()) return@post
      val candidate = BubbleChatApi.ChatMessage(
        id = messageId?.takeIf { it.isNotBlank() } ?: "local-${System.currentTimeMillis()}",
        userId = "",
        sender = sender.ifBlank { "Tin nhắn" },
        text = body,
        isMine = false,
        avatarUrl = avatarUrl?.takeIf { it.isNotBlank() },
      )
      rememberAvatars(listOf(candidate))
      if (messages.any { isNearDuplicate(it, candidate) }) return@post
      messages.add(candidate)
      if (messages.size > 80) messages.removeAt(0)
      // Có tin rồi thì ẩn dòng «Chưa có tin nhắn» / «Đang tải…».
      statusView?.visibility = View.GONE
      if (isVisibleOnScreen()) {
        renderMessages()
        // Đang nhìn thấy khung của đúng đoạn này → tin vừa đến coi như đã đọc.
        markCurrentRead(force = false)
      }
    }
  }

  private fun normalizeMsgText(text: String): String {
    return BubbleChatApi.cleanDisplayText(text).replace(Regex("\\s+"), " ").trim()
  }

  private fun attachmentSignature(msg: BubbleChatApi.ChatMessage): String {
    return msg.allAttachments().joinToString("|") { it.url }
  }

  private fun isNearDuplicate(a: BubbleChatApi.ChatMessage, b: BubbleChatApi.ChatMessage): Boolean {
    if (a.id.isNotBlank() && a.id == b.id) return true
    if (attachmentSignature(a) != attachmentSignature(b)) return false
    if (normalizeMsgText(a.text) != normalizeMsgText(b.text)) return false
    if (a.isMine != b.isMine) return false
    if (a.isMine) {
      if (a.createdAtMs > 0L && b.createdAtMs > 0L) {
        return kotlin.math.abs(a.createdAtMs - b.createdAtMs) < 120_000L
      }
      return true
    }
    if (a.sender.trim() != b.sender.trim()) return false
    if (a.createdAtMs > 0L && b.createdAtMs > 0L) {
      return kotlin.math.abs(a.createdAtMs - b.createdAtMs) < 60_000L
    }
    return true
  }

  private fun buildPanel(topReservePx: Int) {
    val c = colors()
    val dm = context.resources.displayMetrics
    val panelW = dm.widthPixels
    val topReserve = resolveTopReserve(topReservePx)
    val panelH = (dm.heightPixels - topReserve).coerceAtLeast((dm.heightPixels * 0.55f).toInt())

    val root = FrameLayout(context)

    val scrim = View(context).apply {
      setBackgroundColor(Color.argb(102, 15, 23, 42))
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      setOnClickListener { collapse() }
    }
    scrimView = scrim
    root.addView(scrim)

    // Dải «đầu chat» phía trên khung (các cuộc trò chuyện đang mở + nút Đoạn chat / đóng).
    panelTopReserve = topReserve
    root.addView(buildHeadsStrip(c, topReserve))
    root.addView(
      View(context).apply {
        background = GradientDrawable().apply {
          setColor(c.bgElevated)
          cornerRadii = floatArrayOf(dp(7).toFloat(), dp(7).toFloat(), dp(7).toFloat(), dp(7).toFloat(), 0f, 0f, 0f, 0f)
        }
        elevation = dp(18).toFloat()
        // Giữ độ cao để vẽ trên khung nhưng bỏ bóng đổ (bóng làm mấu bị nhòe).
        outlineProvider = object : android.view.ViewOutlineProvider() {
          override fun getOutline(view: View, outline: android.graphics.Outline) {
            outline.setEmpty()
          }
        }
        // Tâm đầu thứ nhất: lề trái 16dp + nửa bề rộng 26dp.
        layoutParams = FrameLayout.LayoutParams(dp(14), dp(6), Gravity.TOP or Gravity.START).also {
          it.leftMargin = dp(16) + dp(26) - dp(7)
          it.topMargin = topReserve - dp(6)
        }
      },
    )

    // Khung chat: nền trắng bo trên 32dp, không viền.
    val sheetBg = GradientDrawable().apply {
      setColor(c.bgElevated)
      cornerRadii = floatArrayOf(
        dp(32).toFloat(), dp(32).toFloat(),
        dp(32).toFloat(), dp(32).toFloat(),
        0f, 0f, 0f, 0f,
      )
    }

    val column = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = sheetBg
      elevation = dp(16).toFloat()
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        panelH,
        Gravity.BOTTOM,
      )
    }
    columnRoot = column

    // Tay nắm kéo (trang trí) ở giữa mép trên khung.
    column.addView(
      View(context).apply {
        background = OverlayChatTheme.roundedRect(c.border, 2, ::dp)
        layoutParams = LinearLayout.LayoutParams(dp(40), dp(4)).also {
          it.gravity = Gravity.CENTER_HORIZONTAL
          it.topMargin = dp(10)
          it.bottomMargin = dp(4)
        }
      },
    )
    column.addView(buildHeader(c))
    column.addView(buildMessagesArea(c))
    column.addView(buildComposer(c))

    val popup = FrameLayout(context).apply {
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      visibility = View.GONE
      elevation = dp(24).toFloat()
      isClickable = true
    }
    popupLayer = popup
    column.addView(popup)

    root.addView(column)

    panelRoot = root
    root.isFocusable = true
    root.isFocusableInTouchMode = true

    val params = WindowManager.LayoutParams(
      panelW,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      android.graphics.PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING

    panelTopReserve = topReserve
    basePanelHeight = panelH
    windowManager.addView(root, params)
    panelParams = params
    installKeyboardWatcher(root)
  }

  // ---- Trang «Đoạn chat» (mở khi chạm biểu tượng bong bóng chat ở dải đầu chat) ----
  private var inboxRoot: FrameLayout? = null
  private var inboxOpen = false
  private var inboxRows: List<BubbleChatApi.GroupRow> = emptyList()
  private var inboxListWrap: LinearLayout? = null
  private var inboxTray: LinearLayout? = null
  private var inboxSeq = 0
  private var inboxQuery = ""

  private val inboxPalette = arrayOf(
    intArrayOf(0xFFEC4899.toInt(), 0xFFF43F5E.toInt()),
    intArrayOf(0xFF1D4ED8.toInt(), 0xFF4F46E5.toInt()),
    intArrayOf(0xFF059669.toInt(), 0xFF14B8A6.toInt()),
    intArrayOf(0xFFD97706.toInt(), 0xFFF97316.toInt()),
    intArrayOf(0xFF9333EA.toInt(), 0xFFD946EF.toInt()),
    intArrayOf(0xFF0891B2.toInt(), 0xFF2563EB.toInt()),
  )

  private fun toggleInbox() {
    if (inboxOpen) hideInbox() else showInbox()
  }

  fun hideInbox() {
    val root = panelRoot
    inboxRoot?.let { root?.removeView(it) }
    inboxRoot = null
    inboxListWrap = null
    inboxTray = null
    inboxQuery = ""
    if (inboxOpen) {
      inboxOpen = false
      rebuildHeads()
    }
  }

  private fun showInbox() {
    val root = panelRoot ?: return
    hidePopups()
    dismissComposerFocus()
    val c = colors()
    inboxOpen = true
    inboxQuery = ""

    val sheet = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(c.bgElevated)
        cornerRadii = floatArrayOf(
          dp(32).toFloat(), dp(32).toFloat(), dp(32).toFloat(), dp(32).toFloat(), 0f, 0f, 0f, 0f,
        )
      }
      elevation = dp(20).toFloat()
      isClickable = true
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        basePanelHeight,
        Gravity.BOTTOM,
      )
    }
    inboxRoot = FrameLayout(context).apply {
      // Thứ tự vẽ theo độ cao giữa các view anh em trong root: khung chat (column) cao 16dp nên lớp này phải cao hơn.
      elevation = dp(20).toFloat()
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      addView(sheet)
    }
    root.addView(inboxRoot)

    // Tay nắm
    sheet.addView(
      View(context).apply {
        background = OverlayChatTheme.roundedRect(c.border, 2, ::dp)
        layoutParams = LinearLayout.LayoutParams(dp(40), dp(4)).also {
          it.gravity = Gravity.CENTER_HORIZONTAL
          it.topMargin = dp(10)
          it.bottomMargin = dp(4)
        }
      },
    )

    // Tiêu đề «Đoạn chat» + nút máy ảnh (chụp ảnh gửi vào cuộc trò chuyện đang mở)
    val head = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(16), dp(6), dp(16), dp(6))
    }
    head.addView(
      TextView(context).apply {
        text = "Đoạn chat"
        setTextColor(c.text)
        setTypeface(typeface, Typeface.BOLD)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
      },
    )
    head.addView(
      ComposerIcon(context, ComposerIcon.CAMERA, c.text, dp(20)).apply {
        background = OverlayChatTheme.circleBg(c.iconBtnBg, ::dp)
        layoutParams = LinearLayout.LayoutParams(dp(36), dp(36))
        setOnClickListener {
          hideInbox()
          dismissComposerFocus()
          BubbleMediaBridge.pick(context, BubbleMediaBridge.MODE_CAMERA, suspendPanel = true) { files ->
            if (files.isNotEmpty()) {
              pendingFiles.addAll(files)
              refreshPendingStrip()
            }
          }
        }
      },
    )
    sheet.addView(head)

    // Ô tìm kiếm
    val search = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = OverlayChatTheme.roundedRect(c.iconBtnBg, 22, ::dp)
      setPadding(dp(14), 0, dp(14), 0)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(40),
      ).also {
        it.marginStart = dp(16)
        it.marginEnd = dp(16)
        it.topMargin = dp(4)
        it.bottomMargin = dp(6)
      }
    }
    search.addView(
      ComposerIcon(context, ComposerIcon.SEARCH, c.textFaint, dp(16)).apply {
        layoutParams = LinearLayout.LayoutParams(dp(20), dp(20)).also { it.marginEnd = dp(8) }
      },
    )
    search.addView(
      EditText(context).apply {
        hint = "Tìm kiếm đoạn chat..."
        setHintTextColor(c.textFaint)
        setTextColor(c.text)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        background = null
        maxLines = 1
        inputType = InputType.TYPE_CLASS_TEXT
        imeOptions = EditorInfo.IME_ACTION_SEARCH
        setPadding(0, 0, 0, 0)
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f)
        isFocusable = true
        isFocusableInTouchMode = true
        addTextChangedListener(object : android.text.TextWatcher {
          override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
          override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
            inboxQuery = s?.toString().orEmpty()
            renderInboxList()
          }
          override fun afterTextChanged(s: android.text.Editable?) {}
        })
        setOnClickListener {
          requestFocus()
          showKeyboard()
        }
      },
    )
    sheet.addView(search)

    // Dải liên hệ gần đây (ảnh đại diện + tên rút gọn)
    val trayScroll = HorizontalScrollView(context).apply {
      isHorizontalScrollBarEnabled = false
    }
    inboxTray = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(16), dp(4), dp(16), dp(8))
    }
    trayScroll.addView(inboxTray)
    sheet.addView(trayScroll)
    sheet.addView(
      View(context).apply {
        setBackgroundColor(c.bubbleInBorder)
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
      },
    )

    // Danh sách đoạn chat
    val scroll = ScrollView(context).apply {
      isVerticalScrollBarEnabled = false
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
    }
    inboxListWrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), dp(6), dp(8), dp(16))
    }
    scroll.addView(inboxListWrap)
    sheet.addView(scroll)

    rebuildHeads()
    renderInboxList()
    val seq = ++inboxSeq
    Thread {
      val rows = BubbleChatApi.fetchGroups(context)
      handler.post {
        if (seq != inboxSeq || !inboxOpen) return@post
        inboxRows = rows
        renderInboxList()
      }
    }.start()
  }

  private fun inboxTime(ms: Long): String {
    if (ms <= 0L) return ""
    val now = java.util.Calendar.getInstance()
    val t = java.util.Calendar.getInstance().apply { timeInMillis = ms }
    fun sameDay(a: java.util.Calendar, b: java.util.Calendar) =
      a.get(java.util.Calendar.YEAR) == b.get(java.util.Calendar.YEAR) &&
        a.get(java.util.Calendar.DAY_OF_YEAR) == b.get(java.util.Calendar.DAY_OF_YEAR)
    if (sameDay(now, t)) return formatTime(ms)
    val y = java.util.Calendar.getInstance().apply { add(java.util.Calendar.DAY_OF_YEAR, -1) }
    if (sameDay(y, t)) return "Hôm qua"
    val days = (now.timeInMillis - ms) / 86_400_000L
    if (days < 7) {
      return when (t.get(java.util.Calendar.DAY_OF_WEEK)) {
        java.util.Calendar.MONDAY -> "T2"
        java.util.Calendar.TUESDAY -> "T3"
        java.util.Calendar.WEDNESDAY -> "T4"
        java.util.Calendar.THURSDAY -> "T5"
        java.util.Calendar.FRIDAY -> "T6"
        java.util.Calendar.SATURDAY -> "T7"
        else -> "CN"
      }
    }
    return SimpleDateFormat("dd/MM", Locale.getDefault()).format(Date(ms))
  }

  private fun inboxAvatar(name: String, url: String?, sizeDp: Int, textSp: Float): OverlayAvatarView {
    val pal = inboxPalette[kotlin.math.abs(name.hashCode()) % inboxPalette.size]
    return OverlayAvatarView(context).style(pal[0], pal[1], textSp).setAvatar(url, name).apply {
      layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
    }
  }

  private fun pickFromInbox(g: BubbleChatApi.GroupRow) {
    hideInbox()
    if (g.id == groupId) return
    // Mở đoạn nào là đọc đoạn đó: bỏ dấu chưa đọc ở bản sao danh sách ngay (show() sẽ báo máy chủ).
    inboxRows = inboxRows.map { if (it.id == g.id) it.copy(unread = 0) else it }
    onSelectHead(g.id, g.name)
  }

  private fun renderInboxList() {
    val wrap = inboxListWrap ?: return
    val tray = inboxTray ?: return
    val c = colors()
    wrap.removeAllViews()
    tray.removeAllViews()
    val q = inboxQuery.trim().lowercase()
    val rows = if (q.isEmpty()) inboxRows else inboxRows.filter {
      it.name.lowercase().contains(q) || it.preview.lowercase().contains(q)
    }
    if (inboxRows.isEmpty()) {
      wrap.addView(
        TextView(context).apply {
          text = "Đang tải đoạn chat…"
          gravity = Gravity.CENTER
          setTextColor(c.textMuted)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
          setPadding(0, dp(24), 0, dp(24))
        },
      )
      return
    }
    // Dải liên hệ gần đây: tối đa 8 người, ẩn khi đang tìm kiếm.
    if (q.isEmpty()) {
      for (g in inboxRows.take(8)) {
        val col = LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER_HORIZONTAL
          layoutParams = LinearLayout.LayoutParams(dp(64), LinearLayout.LayoutParams.WRAP_CONTENT)
          setOnClickListener { pickFromInbox(g) }
        }
        col.addView(inboxAvatar(g.name, g.avatarUrl, 48, 13f))
        col.addView(
          TextView(context).apply {
            text = g.name
            setTextColor(c.textMuted)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            gravity = Gravity.CENTER
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(dp(2), dp(4), dp(2), 0)
          },
        )
        tray.addView(col)
      }
    }
    if (rows.isEmpty()) {
      wrap.addView(
        TextView(context).apply {
          text = "Không tìm thấy đoạn chat nào"
          gravity = Gravity.CENTER
          setTextColor(c.textMuted)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
          setPadding(0, dp(24), 0, dp(24))
        },
      )
      return
    }
    for (g in rows) {
      // Đoạn đang mở trong khung là đoạn đang đọc: không đánh dấu chưa đọc dù máy chủ đếm trễ một nhịp.
      val unread = g.unread > 0 && g.id != groupId
      val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(10), dp(10), dp(10), dp(10))
        if (unread) background = OverlayChatTheme.roundedRect(c.accentSoft, 16, ::dp)
        setOnClickListener { pickFromInbox(g) }
      }
      row.addView(inboxAvatar(g.name, g.avatarUrl, 48, 14f))
      val mid = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
          it.marginStart = dp(12)
          it.marginEnd = dp(8)
        }
      }
      val top = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
      }
      top.addView(
        TextView(context).apply {
          text = g.name
          setTextColor(c.text)
          setTypeface(typeface, if (unread) Typeface.BOLD else Typeface.NORMAL)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
          maxLines = 1
          ellipsize = android.text.TextUtils.TruncateAt.END
          layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        },
      )
      top.addView(
        TextView(context).apply {
          text = inboxTime(g.lastAtMs)
          setTextColor(if (unread) c.accent else c.textFaint)
          setTypeface(typeface, if (unread) Typeface.BOLD else Typeface.NORMAL)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
          setPadding(dp(8), 0, 0, 0)
        },
      )
      mid.addView(top)
      mid.addView(
        TextView(context).apply {
          text = g.preview.ifBlank { "Chưa có tin nhắn" }
          setTextColor(if (unread) c.text else c.textMuted)
          setTypeface(typeface, if (unread) Typeface.BOLD else Typeface.NORMAL)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
          maxLines = 1
          ellipsize = android.text.TextUtils.TruncateAt.END
          setPadding(0, dp(2), 0, 0)
        },
      )
      row.addView(mid)
      if (unread) {
        if (g.unread > 1) {
          row.addView(
            TextView(context).apply {
              text = if (g.unread > 99) "99+" else g.unread.toString()
              gravity = Gravity.CENTER
              setTextColor(Color.WHITE)
              setTypeface(typeface, Typeface.BOLD)
              setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
              minWidth = dp(20)
              setPadding(dp(6), dp(1), dp(6), dp(1))
              background = OverlayChatTheme.roundedRect(c.accent, 10, ::dp)
            },
          )
        } else {
          row.addView(
            View(context).apply {
              background = OverlayChatTheme.circleBg(c.accent, ::dp)
              layoutParams = LinearLayout.LayoutParams(dp(10), dp(10))
            },
          )
        }
      }
      wrap.addView(row)
    }
  }

  // ---- Dải «đầu chat» phía trên khung ----
  private val headPalette = arrayOf(
    intArrayOf(0xFF2563EB.toInt(), 0xFF4F46E5.toInt()),
    intArrayOf(0xFF10B981.toInt(), 0xFF0D9488.toInt()),
    intArrayOf(0xFFF59E0B.toInt(), 0xFFF97316.toInt()),
    intArrayOf(0xFFEC4899.toInt(), 0xFFE11D48.toInt()),
  )

  private fun buildHeadsStrip(c: OverlayChatTheme.Palette, topReserve: Int): View {
    val strip = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      clipChildren = false
      clipToPadding = false
      setPadding(dp(16), statusBarHeight() + dp(4), dp(12), dp(10))
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        topReserve,
        Gravity.TOP,
      )
    }
    headsStrip = strip
    fillHeads(strip, c)
    return strip
  }

  private fun rebuildHeads() {
    val strip = headsStrip ?: return
    fillHeads(strip, colors())
  }

  private fun gradCircle(c1: Int, c2: Int): GradientDrawable =
    GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(c1, c2)).apply { shape = GradientDrawable.OVAL }

  private fun fillHeads(strip: LinearLayout, c: OverlayChatTheme.Palette) {
    strip.removeAllViews()
    val list = if (heads.isEmpty()) listOf(Head(groupId, title)) else heads
    val group = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      clipChildren = false
      // Không co giãn: các đầu chat và icon «Đoạn chat» nối liền nhau, cách đều 10dp.
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    }
    var other = 0
    for (h in list.take(4)) {
      val active = h.groupId == groupId
      val letters = OverlayChatTheme.initials(h.title)
      if (active) {
        // Đầu đang mở: viền chuyển sắc xanh, nền avatar hồng → tím; to hơn một chút nhưng CÙNG đường giữa với các đầu khác.
        val ring = FrameLayout(context).apply {
          background = GradientDrawable(
            GradientDrawable.Orientation.BL_TR,
            intArrayOf(0xFF2563EB.toInt(), 0xFF0084FF.toInt(), 0xFF38BDF8.toInt()),
          ).apply { shape = GradientDrawable.OVAL }
          elevation = dp(6).toFloat()
          layoutParams = LinearLayout.LayoutParams(dp(52), dp(52)).also { it.marginEnd = dp(10) }
          setPadding(dp(2), dp(2), dp(2), dp(2))
        }
        ring.addView(
          OverlayAvatarView(context)
            .style(0xFFFF416C.toInt(), 0xFF8A2387.toInt(), 14f, 2f, Color.WHITE)
            .setAvatar(h.avatarUrl ?: metaAvatarUrl, h.title),
          FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT),
        )
        group.addView(ring)
      } else {
        val pal = headPalette[other % headPalette.size]
        other += 1
        group.addView(
          OverlayAvatarView(context).style(pal[0], pal[1], 12f, 2f, Color.WHITE).setAvatar(h.avatarUrl, h.title).apply {
            elevation = dp(4).toFloat()
            layoutParams = LinearLayout.LayoutParams(dp(46), dp(46)).also { it.marginEnd = dp(10) }
            setOnClickListener {
              hideInbox()
              onSelectHead(h.groupId, h.title)
            }
          },
        )
      }
    }
    strip.addView(group)

    // Nút «Đoạn chat» (icon bong bóng chat): mở/đóng trang danh sách; đang mở thì viền xanh bao quanh. Cạnh đó là nút đóng.
    strip.addView(
      ComposerIcon(context, ComposerIcon.CHAT, 0xFF2563EB.toInt(), dp(22)).apply {
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(Color.argb(240, 255, 255, 255))
          if (inboxOpen) setStroke(dp(3), 0xFF38BDF8.toInt())
        }
        elevation = dp(4).toFloat()
        layoutParams = LinearLayout.LayoutParams(dp(46), dp(46))
        // Chạm khi trang «Đoạn chat» đang mở → thu cả khung về bong bóng; chưa mở thì mở trang «Đoạn chat».
        setOnClickListener { if (inboxOpen) collapse() else toggleInbox() }
      },
    )
    // Không còn nút X: đóng khung bằng cách chạm vào vùng mờ phía sau (scrim) hoặc phím Quay lại.
  }

  private fun buildComposer(c: OverlayChatTheme.Palette): View {
    val wrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(c.bgElevated)
    }
    composerWrap = wrap

    wrap.addView(View(context).apply {
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
      setBackgroundColor(c.border)
    })

    val reply = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(8), dp(8), dp(8))
      setBackgroundColor(c.inputBg)
      visibility = View.GONE
    }
    replyBar = reply
    reply.addView(TextView(context).apply {
      id = View.generateViewId()
      tag = "reply_label"
      setTextColor(c.accent)
      setTypeface(typeface, Typeface.BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    })
    reply.addView(TextView(context).apply {
      id = View.generateViewId()
      tag = "reply_text"
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      maxLines = 2
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
        it.marginStart = dp(8)
      }
    })
    reply.addView(TextView(context).apply {
      text = "✕"
      setTextColor(c.textFaint)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setPadding(dp(8), dp(4), dp(4), dp(4))
      setOnClickListener { clearReplyTo() }
    })
    wrap.addView(reply)

    val pendingScroll = HorizontalScrollView(context).apply {
      isHorizontalScrollBarEnabled = false
      visibility = View.GONE
    }
    pendingStrip = pendingScroll
    pendingRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(12), dp(6), dp(12), dp(4))
    }
    pendingScroll.addView(pendingRow)
    wrap.addView(pendingScroll)

    // Thanh nhập tin theo thiết kế: «+» nền xanh nhạt · nút ảnh · ô nhập bo tròn (có nút cảm xúc) · nút gửi chuyển màu xanh.
    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM
      setPadding(dp(12), dp(12), dp(12), dp(12))
    }
    val btn = dp(32)

    // «+» → mở bảng đính kèm (ảnh, video, tệp, chụp, quay).
    bar.addView(
      ComposerIcon(context, ComposerIcon.PLUS, c.accent, dp(16)).apply {
        background = OverlayChatTheme.circleBg(c.accentSoft, ::dp)
        layoutParams = LinearLayout.LayoutParams(btn, btn).also { it.bottomMargin = dp(2) }
        setOnClickListener { showAttachSheet() }
      },
    )

    // Nút ảnh → chọn thẳng từ thư viện ảnh.
    bar.addView(
      ComposerIcon(context, ComposerIcon.IMAGE, c.accent, dp(20)).apply {
        layoutParams = LinearLayout.LayoutParams(btn, btn).also {
          it.marginStart = dp(8)
          it.bottomMargin = dp(2)
        }
        setOnClickListener {
          hidePopups()
          dismissComposerFocus()
          BubbleMediaBridge.pick(context, BubbleMediaBridge.MODE_GALLERY, suspendPanel = true) { files ->
            if (files.isNotEmpty()) {
              pendingFiles.addAll(files)
              refreshPendingStrip()
            }
          }
        }
      },
    )

    val inputWrap = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM
      background = OverlayChatTheme.roundedRect(c.iconBtnBg, 20, ::dp)
      setPadding(dp(14), 0, dp(8), 0)
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
        it.marginStart = dp(8)
        it.marginEnd = dp(8)
      }
      minimumHeight = dp(36)
    }

    inputView = EditText(context).apply {
      hint = "Nhập tin nhắn..."
      setHintTextColor(c.textFaint)
      setTextColor(c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      maxLines = 4
      background = null
      isFocusable = true
      isFocusableInTouchMode = true
      isClickable = true
      setPadding(0, dp(9), 0, dp(9))
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
      inputType = InputType.TYPE_CLASS_TEXT or
        InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or
        InputType.TYPE_TEXT_FLAG_MULTI_LINE
      imeOptions = EditorInfo.IME_ACTION_SEND
      setOnEditorActionListener { _, actionId, _ ->
        if (actionId == EditorInfo.IME_ACTION_SEND) {
          sendDraft()
          true
        } else false
      }
      addTextChangedListener(object : android.text.TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
          updateSendButton()
        }
        override fun afterTextChanged(s: android.text.Editable?) {}
      })
      setOnClickListener {
        requestFocus()
        showKeyboard()
      }
      setOnFocusChangeListener { _, hasFocus ->
        if (hasFocus && !sending) {
          setSoftInputVisible(true)
          startKeyboardPolling()
          refreshKeyboardLift()
        } else if (!hasFocus) {
          stopKeyboardPolling()
          setSoftInputVisible(false)
          handler.postDelayed({
            if (inputView?.hasFocus() != true) {
              keyboardLiftPx = 0
              applyKeyboardLift()
              forceHideKeyboard()
            }
          }, 180)
        }
      }
    }
    inputWrap.addView(inputView)

    // Biểu tượng cảm xúc: mở bàn phím để chọn emoji (chưa có bảng emoji riêng).
    inputWrap.addView(
      ComposerIcon(context, ComposerIcon.EMOJI, c.textFaint, dp(16)).apply {
        layoutParams = LinearLayout.LayoutParams(dp(28), dp(36))
        setOnClickListener {
          inputView?.requestFocus()
          showKeyboard()
        }
      },
    )
    bar.addView(inputWrap)

    // Nút gửi: tròn 32dp, chuyển sắc xanh #0084FF → #2563EB, mũi tên máy bay giấy trắng.
    sendButton = ComposerIcon(context, ComposerIcon.SEND, Color.WHITE, dp(16)).apply {
      layoutParams = LinearLayout.LayoutParams(btn, btn).also { it.bottomMargin = dp(2) }
      elevation = dp(3).toFloat()
      setOnClickListener { sendDraft() }
    }
    bar.addView(sendButton)

    wrap.addView(bar)
    updateSendButton()
    return wrap
  }

  private fun buildHeader(c: OverlayChatTheme.Palette): View {
    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(16), dp(8), dp(16), dp(10))
      setBackgroundColor(c.bgElevated)
    }
    // Avatar tròn 40dp nền chuyển sắc hồng → tím, viền trắng.
    avatarView = OverlayAvatarView(context).style(0xFFFF416C.toInt(), 0xFF8A2387.toInt(), 14f, 2f, c.bgElevated).apply {
      layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
    }
    val body = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
        it.marginStart = dp(12)
        it.marginEnd = dp(8)
      }
    }
    titleView = TextView(context).apply {
      setTextColor(c.text)
      setTypeface(typeface, Typeface.BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f)
      maxLines = 1
      ellipsize = android.text.TextUtils.TruncateAt.END
    }
    subtitleView = TextView(context).apply {
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      maxLines = 1
      setPadding(0, dp(2), 0, 0)
    }
    body.addView(titleView)
    body.addView(subtitleView)

    // Ba nút tròn 32dp nền xám nhạt có viền: gọi thoại · gọi video · thông tin (mở cuộc trò chuyện trong app).
    fun headerBtn(kind: Int, onClick: () -> Unit): View {
      return ComposerIcon(context, kind, c.accent, dp(16)).apply {
        background = OverlayChatTheme.circleBg(c.iconBtnBg, ::dp).also { it.setStroke(dp(1), c.border) }
        layoutParams = LinearLayout.LayoutParams(dp(32), dp(32)).also { it.marginStart = dp(6) }
        setOnClickListener { onClick() }
      }
    }
    val callAudio = headerBtn(ComposerIcon.PHONE) {
      val gid = groupId
      val t = title
      if (gid.isNotBlank()) onStartCall(gid, t, "audio")
    }
    val callVideo = headerBtn(ComposerIcon.VIDEO) {
      val gid = groupId
      val t = title
      if (gid.isNotBlank()) onStartCall(gid, t, "video")
    }
    val info = headerBtn(ComposerIcon.INFO) {
      val gid = groupId
      val t = title
      hide()
      if (gid.isNotBlank()) onExpand(gid, t)
    }
    bar.addView(avatarView)
    bar.addView(body)
    bar.addView(callAudio)
    bar.addView(callVideo)
    bar.addView(info)
    return LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      addView(bar)
      addView(View(context).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
        setBackgroundColor(c.bubbleInBorder)
      })
    }
  }

  private fun buildMessagesArea(c: OverlayChatTheme.Palette): View {
    val outer = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(c.bg)
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
    }
    statusView = TextView(context).apply {
      gravity = Gravity.CENTER
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      setPadding(dp(12), dp(8), dp(12), dp(8))
      text = "Đang tải tin nhắn…"
    }
    scrollView = ScrollView(context).apply {
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
      isVerticalScrollBarEnabled = false
    }
    messagesWrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(8), dp(16), dp(12))
    }
    scrollView?.addView(messagesWrap, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
    ))
    outer.addView(statusView)
    outer.addView(scrollView)
    return outer
  }

  private fun setReplyTo(msg: BubbleChatApi.ChatMessage?) {
    if (msg == null) return
    replyToId = msg.id.ifBlank { null }
    replyToSender = msg.sender.ifBlank { null }
    replyToText = msg.text.ifBlank { "…" }
    val c = colors()
    replyBar?.visibility = View.VISIBLE
    (replyBar?.findViewWithTag("reply_label") as? TextView)?.text =
      if (!replyToSender.isNullOrBlank()) "Trả lời $replyToSender" else "Trả lời"
    (replyBar?.findViewWithTag("reply_text") as? TextView)?.text = replyToText
    inputView?.post {
      inputView?.requestFocus()
      showKeyboard()
    }
  }

  private fun clearReplyTo() {
    replyToId = null
    replyToSender = null
    replyToText = null
    replyBar?.visibility = View.GONE
  }

  private fun showAttachSheet() {
    hidePopups()
    dismissComposerFocus()
    val popup = popupLayer ?: return
    val c = colors()
    popup.removeAllViews()
    popup.visibility = View.VISIBLE

    val dim = View(context).apply {
      setBackgroundColor(Color.argb(50, 0, 0, 0))
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      setOnClickListener { hidePopups() }
    }
    popup.addView(dim)

    val sheet = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = OverlayChatTheme.roundedRect(c.bgElevated, 16, ::dp, c.border)
      setPadding(dp(12), dp(12), dp(12), dp(16))
      elevation = dp(8).toFloat()
    }
    fun addOpt(label: String, mode: String) {
      sheet.addView(TextView(context).apply {
        text = label
        setTextColor(c.text)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setPadding(dp(14), dp(14), dp(14), dp(14))
        setOnClickListener {
          hidePopups()
          BubbleMediaBridge.pick(context, mode, suspendPanel = true) { files ->
            if (files.isNotEmpty()) {
              pendingFiles.addAll(files)
              refreshPendingStrip()
            }
          }
        }
      })
    }
    addOpt("🖼 Thư viện ảnh (nhiều)", BubbleMediaBridge.MODE_GALLERY)
    addOpt("🎬 Thư viện video", BubbleMediaBridge.MODE_VIDEO)
    addOpt("📎 Tệp tin", BubbleMediaBridge.MODE_FILE)
    addOpt("📷 Chụp ảnh", BubbleMediaBridge.MODE_CAMERA)
    addOpt("🎥 Quay video", BubbleMediaBridge.MODE_RECORD)

    val composerH = composerWrap?.height?.takeIf { it > 0 } ?: dp(92)
    val lp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.BOTTOM,
    )
    lp.bottomMargin = composerH + dp(6)
    lp.marginStart = dp(10)
    lp.marginEnd = dp(10)
    popup.addView(sheet, lp)
    popup.bringToFront()
  }

  private fun refreshPendingStrip() {
    val row = pendingRow ?: return
    val c = colors()
    row.removeAllViews()
    if (pendingFiles.isEmpty()) {
      pendingStrip?.visibility = View.GONE
      updateSendButton()
      return
    }
    pendingStrip?.visibility = View.VISIBLE
    pendingFiles.forEachIndexed { idx, f ->
      if (f.isImage()) {
        val frame = FrameLayout(context).apply {
          layoutParams = LinearLayout.LayoutParams(dp(76), dp(76)).also { it.marginEnd = dp(8) }
          background = OverlayChatTheme.roundedRect(c.inputBg, 10, ::dp, c.border)
        }
        frame.addView(ImageView(context).apply {
          scaleType = ImageView.ScaleType.CENTER_CROP
          layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
          )
          try {
            val bmp = BitmapFactory.decodeFile(f.cachePath)
            if (bmp != null) setImageBitmap(bmp)
          } catch (_: Exception) { }
        })
        frame.addView(TextView(context).apply {
          text = "✕"
          gravity = Gravity.CENTER
          setTextColor(Color.WHITE)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
          setBackgroundColor(Color.argb(160, 0, 0, 0))
          layoutParams = FrameLayout.LayoutParams(dp(22), dp(22), Gravity.TOP or Gravity.END)
          setOnClickListener {
            if (idx < pendingFiles.size) {
              pendingFiles.removeAt(idx)
              refreshPendingStrip()
            }
          }
        })
        row.addView(frame)
      } else {
        row.addView(TextView(context).apply {
          text = "📎 ${f.name.take(16)}"
          setTextColor(c.text)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          setPadding(dp(10), dp(6), dp(10), dp(6))
          background = OverlayChatTheme.roundedRect(c.inputBg, 8, ::dp, c.border)
          layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
          ).also { it.marginEnd = dp(8) }
          setOnClickListener {
            if (idx < pendingFiles.size) {
              pendingFiles.removeAt(idx)
              refreshPendingStrip()
            }
          }
        })
      }
    }
    updateSendButton()
  }

  private fun updateSendButton() {
    val c = colors()
    val canSend = !sending && (
      pendingFiles.isNotEmpty() || inputView?.text?.toString()?.trim()?.isNotEmpty() == true
      )
    sendButton?.apply {
      // Luôn là nút tròn chuyển sắc xanh; chưa có gì để gửi thì mờ đi.
      alpha = if (canSend) 1f else 0.45f
      isEnabled = canSend
      background = GradientDrawable(
        GradientDrawable.Orientation.BL_TR,
        intArrayOf(0xFF0084FF.toInt(), 0xFF2563EB.toInt()),
      ).apply { shape = GradientDrawable.OVAL }
    }
  }

  private fun sendDraft() {
    if (sending || groupId.isBlank()) return
    val text = inputView?.text?.toString()?.trim().orEmpty()
    val files = pendingFiles.toList()
    if (text.isBlank() && files.isEmpty()) return

    sending = true
    updateSendButton()
    dismissComposerFocus()

    val gid = groupId
    val rid = replyToId
    Thread {
      val ok = if (files.isNotEmpty()) {
        BubbleChatApi.uploadWithFiles(context, gid, files, text.ifBlank { null }, rid)
      } else {
        BubbleChatApi.sendMessage(context, gid, text, rid)
      }
      handler.post {
        sending = false
        if (ok && gid == groupId) {
          inputView?.text = null
          pendingFiles.clear()
          refreshPendingStrip()
          clearReplyTo()
          updateSendButton()
          dismissComposerFocus()
          reloadMessages()
        } else {
          updateSendButton()
          inputView?.error = "Gửi thất bại"
        }
      }
    }.start()
  }

  /** Đóng bàn phím và bỏ focus ô nhập sau khi gửi xong. */
  private fun dismissComposerFocus() {
    stopKeyboardPolling()
    keyboardLiftPx = 0
    applyKeyboardLift()
    setSoftInputVisible(false)
    forceHideKeyboard()
    inputView?.clearFocus()
    panelRoot?.requestFocus()
    handler.postDelayed({ forceHideKeyboard() }, 60)
    handler.postDelayed({ forceHideKeyboard() }, 180)
  }

  private fun setSoftInputVisible(visible: Boolean) {
    val params = panelParams ?: return
    val root = panelRoot ?: return
    params.softInputMode = if (visible) {
      WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE or
        WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
    } else {
      WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN or
        WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
    }
    try {
      windowManager.updateViewLayout(root, params)
    } catch (_: Exception) { }
  }

  private fun forceHideKeyboard() {
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    inputView?.windowToken?.let { imm?.hideSoftInputFromWindow(it, 0) }
    panelRoot?.windowToken?.let { imm?.hideSoftInputFromWindow(it, 0) }
    try {
      imm?.hideSoftInputFromWindow(null, 0)
    } catch (_: Exception) { }
  }

  private fun showKeyboard() {
    val input = inputView ?: return
    input.requestFocus()
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    imm?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
    startKeyboardPolling()
    handler.postDelayed({ refreshKeyboardLift() }, 80)
    handler.postDelayed({ refreshKeyboardLift() }, 220)
    handler.postDelayed({ refreshKeyboardLift() }, 450)
  }

  private fun hideKeyboard() {
    dismissComposerFocus()
  }

  private fun startKeyboardPolling() {
    if (keyboardPollRunnable != null) return
    keyboardPollRunnable = object : Runnable {
      override fun run() {
        if (inputView?.hasFocus() == true) {
          refreshKeyboardLift()
          handler.postDelayed(this, 120)
        } else {
          keyboardPollRunnable = null
        }
      }
    }
    handler.post(keyboardPollRunnable!!)
  }

  private fun stopKeyboardPolling() {
    keyboardPollRunnable?.let { handler.removeCallbacks(it) }
    keyboardPollRunnable = null
  }

  /** Ước lượng chiều cao bàn phím — overlay không luôn nhận WindowInsets. */
  private fun refreshKeyboardLift() {
    val input = inputView ?: return
    if (!input.hasFocus()) return
    val dm = context.resources.displayMetrics
    val screenH = dm.heightPixels
    val rect = Rect()
    panelRoot?.getWindowVisibleDisplayFrame(rect)
    val visibleBottom = if (rect.bottom > 0) rect.bottom else screenH
    val frameKb = (screenH - visibleBottom).coerceAtLeast(0)

    val loc = IntArray(2)
    input.getLocationOnScreen(loc)
    val inputBottom = loc[1] + input.height + dp(16)
    val overlap = (inputBottom - visibleBottom).coerceAtLeast(0)

    val estimated = when {
      frameKb > screenH * 0.12 -> frameKb
      overlap > dp(8) -> overlap + dp(72)
      else -> (screenH * 0.36f).toInt()
    }
    keyboardLiftPx = estimated.coerceIn(0, (screenH * 0.55f).toInt())
    applyKeyboardLift()
    scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
  }

  /** Đẩy sheet chat lên trên bàn phím. */
  private fun applyKeyboardLift() {
    val column = columnRoot ?: return
    if (suspendedForPicker || suspendedForCompose) return
    val lp = column.layoutParams as? FrameLayout.LayoutParams ?: return

    val dm = context.resources.displayMetrics
    val screenH = dm.heightPixels
    val lift = keyboardLiftPx.coerceAtLeast(0)
    val composerMin = dp(120)
    val availH = (screenH - lift - panelTopReserve).coerceAtLeast(composerMin + dp(80))
    val targetH = basePanelHeight.coerceAtMost(availH)
    if (lp.height == targetH && lp.bottomMargin == lift) return
    lp.height = targetH
    lp.gravity = Gravity.BOTTOM
    lp.bottomMargin = lift
    column.layoutParams = lp
    composerWrap?.post { composerWrap?.requestLayout() }
    scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
  }

  private fun installKeyboardWatcher(root: FrameLayout) {
    keyboardListener = ViewTreeObserver.OnGlobalLayoutListener {
      if (suspendedForPicker || suspendedForCompose) return@OnGlobalLayoutListener
      if (inputView?.hasFocus() == true) refreshKeyboardLift()
    }
    root.viewTreeObserver.addOnGlobalLayoutListener(keyboardListener)
  }

  private fun hidePopups() {
    popupLayer?.visibility = View.GONE
    popupLayer?.removeAllViews()
  }

  private fun showMessageActions(msg: BubbleChatApi.ChatMessage, anchor: View) {
    hidePopups()
    val popup = popupLayer ?: return
    val c = colors()
    popup.removeAllViews()
    popup.visibility = View.VISIBLE
    popup.setOnClickListener { hidePopups() }

    val card = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = OverlayChatTheme.roundedRect(c.bgElevated, 12, ::dp, c.border)
      setPadding(dp(8), dp(8), dp(8), dp(8))
      elevation = dp(8).toFloat()
    }

    card.addView(actionBtn(c, "↩ Trả lời") {
      hidePopups()
      setReplyTo(msg)
    })

    val reactRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(dp(4), dp(6), dp(4), dp(4))
    }
    for (em in quickReactions) {
      reactRow.addView(TextView(context).apply {
        text = em
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        setPadding(dp(8), dp(4), dp(8), dp(4))
        setOnClickListener {
          hidePopups()
          applyReaction(msg, em)
        }
      })
    }
    card.addView(reactRow)

    val loc = IntArray(2)
    val popupLoc = IntArray(2)
    anchor.getLocationOnScreen(loc)
    popup.getLocationOnScreen(popupLoc)
    val lp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
    )
    lp.gravity = Gravity.TOP or Gravity.START
    lp.topMargin = (loc[1] - popupLoc[1] - dp(80)).coerceAtLeast(dp(12))
    lp.marginStart = (loc[0] - popupLoc[0]).coerceAtLeast(dp(12))
    popup.addView(card, lp)
  }

  private fun actionBtn(c: OverlayChatTheme.Palette, label: String, onClick: () -> Unit): TextView {
    return TextView(context).apply {
      text = label
      setTextColor(c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(dp(12), dp(10), dp(12), dp(10))
      setOnClickListener { onClick() }
    }
  }

  private fun applyReaction(msg: BubbleChatApi.ChatMessage, emoji: String) {
    if (msg.id.isBlank() || groupId.isBlank()) return
    val gid = groupId
    val mid = msg.id
    Thread {
      val updated = BubbleChatApi.toggleReaction(context, gid, mid, emoji)
      handler.post {
        if (updated != null && gid == groupId) {
          val idx = messages.indexOfFirst { it.id == mid }
          if (idx >= 0) {
            messages[idx] = messages[idx].copy(reactions = updated)
            renderMessages()
          }
        }
      }
    }.start()
  }

  private fun renderMessages() {
    val wrap = messagesWrap ?: return
    val c = colors()
    val maxBubbleW = (panelRoot?.width?.takeIf { it > 0 } ?: context.resources.displayMetrics.widthPixels) * 0.70f
    wrap.removeAllViews()
    var lastSenderKey: String? = null
    var lastDay = ""
    for (msg in messages) {
      val day = if (msg.createdAtMs > 0L) SimpleDateFormat("yyyyMMdd", Locale.getDefault()).format(Date(msg.createdAtMs)) else ""
      if (day.isNotEmpty() && day != lastDay) {
        wrap.addView(buildDatePill(msg.createdAtMs, c))
        lastDay = day
        lastSenderKey = null
      }
      val senderKey = senderKey(msg)
      // Tin đến luôn có avatar nhỏ bên trái (như thiết kế); tên người gửi chỉ hiện trong nhóm.
      val showSenderName = shouldShowMessageAvatars() && !msg.isMine && senderKey != lastSenderKey
      wrap.addView(buildMessageRow(msg, c, maxBubbleW.toInt(), !msg.isMine, showSenderName))
      if (!msg.isMine) lastSenderKey = senderKey else lastSenderKey = null
    }
    scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
  }

  /** Nhãn ngày giữa khung: «Hôm nay 09:45», «Hôm qua 21:10» hoặc «dd/MM/yyyy HH:mm». */
  private fun buildDatePill(ms: Long, c: OverlayChatTheme.Palette): View {
    val cal = java.util.Calendar.getInstance()
    val today = SimpleDateFormat("yyyyMMdd", Locale.getDefault()).format(cal.time)
    cal.add(java.util.Calendar.DAY_OF_YEAR, -1)
    val yesterday = SimpleDateFormat("yyyyMMdd", Locale.getDefault()).format(cal.time)
    val key = SimpleDateFormat("yyyyMMdd", Locale.getDefault()).format(Date(ms))
    val label = when (key) {
      today -> "Hôm nay"
      yesterday -> "Hôm qua"
      else -> SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date(ms))
    } + " " + formatTime(ms)
    return LinearLayout(context).apply {
      gravity = Gravity.CENTER
      setPadding(0, dp(2), 0, dp(10))
      addView(
        TextView(context).apply {
          text = label
          setTextColor(c.textMuted)
          setTypeface(typeface, Typeface.BOLD)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          setPadding(dp(12), dp(4), dp(12), dp(4))
          background = OverlayChatTheme.roundedRect(c.bgElevated, 14, ::dp, c.bubbleInBorder)
        },
      )
    }
  }

  private fun buildMessageRow(
    msg: BubbleChatApi.ChatMessage,
    c: OverlayChatTheme.Palette,
    maxBubbleW: Int,
    showAvatar: Boolean,
    showSenderName: Boolean,
  ): View {
    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM or (if (msg.isMine) Gravity.END else Gravity.START)
      setPadding(0, 0, 0, dp(12))
      // Đủ cao để chứa avatar (28dp + lề đáy 16dp) kể cả khi tin chỉ có một dòng không giờ — nếu thấp hơn, avatar bị cắt phần trên.
      if (!msg.isMine) minimumHeight = dp(28 + 16 + 12)
    }
    if (!msg.isMine) {
      // Avatar tròn 28dp: ảnh thật nếu có, không thì chữ cái trên nền chuyển sắc hồng → tím; nằm sát đáy bóng tin.
      row.addView(
        OverlayAvatarView(context)
          .style(0xFFFF416C.toInt(), 0xFF8A2387.toInt(), 10f)
          .setAvatar(avatarFor(msg), msg.sender)
          .apply {
            layoutParams = LinearLayout.LayoutParams(dp(28), dp(28)).also {
              it.marginEnd = dp(8)
              it.bottomMargin = dp(16)
            }
          },
      )
    }

    val col = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = if (msg.isMine) Gravity.END else Gravity.START
    }

    if (showSenderName && msg.sender.isNotBlank()) {
      col.addView(TextView(context).apply {
        text = msg.sender
        setTextColor(OverlayChatTheme.senderColor(msg.userId, msg.sender))
        setTypeface(typeface, Typeface.BOLD)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setPadding(if (msg.isMine) 0 else dp(2), 0, 0, dp(4))
      })
    }

    val bubbleCol = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = OverlayChatTheme.bubbleBackground(msg.isMine, c, ::dp)
      setPadding(dp(14), dp(10), dp(14), dp(10))
    }

    if (!msg.replyPreview.isNullOrBlank()) {
      val quote = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, 0, 0, dp(6))
      }
      quote.addView(View(context).apply {
        layoutParams = LinearLayout.LayoutParams(dp(3), LinearLayout.LayoutParams.MATCH_PARENT)
        setBackgroundColor(if (msg.isMine) Color.argb(180, 255, 255, 255) else c.accent)
      })
      val qBody = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
          it.marginStart = dp(8)
        }
      }
      if (!msg.replySender.isNullOrBlank()) {
        qBody.addView(TextView(context).apply {
          text = msg.replySender
          setTextColor(if (msg.isMine) Color.WHITE else c.accent)
          setTypeface(typeface, Typeface.BOLD)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        })
      }
      qBody.addView(TextView(context).apply {
        text = msg.replyPreview
        setTextColor(if (msg.isMine) Color.argb(210, 255, 255, 255) else c.textMuted)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        maxLines = 2
      })
      quote.addView(qBody)
      bubbleCol.addView(quote)
    }

    appendMediaToBubble(bubbleCol, msg, c, maxBubbleW)

    val caption = mediaCaption(msg)
    if (caption.isNotBlank()) {
      bubbleCol.addView(textView(caption, msg.isMine, c, maxBubbleW))
    }

    bubbleCol.setOnLongClickListener {
      showMessageActions(msg, bubbleCol)
      true
    }
    bubbleCol.setOnClickListener { setReplyTo(msg) }

    col.addView(bubbleCol)

    // Giờ gửi nằm DƯỚI bóng tin (nhỏ, xám) như thiết kế.
    if (msg.createdAtMs > 0L) {
      col.addView(TextView(context).apply {
        text = formatTime(msg.createdAtMs)
        setTextColor(c.textFaint)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
        setPadding(dp(4), dp(3), dp(4), 0)
      })
    }

    if (msg.reactions.isNotEmpty()) {
      val rRow = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, dp(2), 0, 0)
      }
      for (r in msg.reactions) {
        rRow.addView(TextView(context).apply {
          text = if (r.count > 1) "${r.emoji} ${r.count}" else r.emoji
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
          setPadding(dp(6), dp(2), dp(6), dp(2))
          background = OverlayChatTheme.roundedRect(
            if (r.mine) c.accentSoft else c.inputBg,
            10,
            ::dp,
            if (r.mine) c.accent else c.border,
          )
          layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
          ).also { it.marginEnd = dp(4) }
          setOnClickListener { applyReaction(msg, r.emoji) }
        })
      }
      col.addView(rRow)
    }

    row.addView(col)
    return row
  }

  private fun senderKey(msg: BubbleChatApi.ChatMessage): String {
    return msg.userId.ifBlank { msg.sender }.trim().ifBlank { msg.sender }
  }

  /** Hiện avatar/tên khi có ≥2 người tham gia chat (kể cả mình). */
  private fun shouldShowMessageAvatars(): Boolean {
    if (isDirect) return false
    val senders = messages.map { senderKey(it) }.distinct()
    return senders.size >= 2
  }

  private fun isPlaceholderMediaText(text: String): Boolean {
    val t = text.trim()
    if (t.isBlank() || t.equals("null", ignoreCase = true)) return true
    return t.startsWith("📷") || t.startsWith("🎬") || t.startsWith("📎") ||
      t.startsWith("🖼") || t.contains("Hình ảnh", true) || t.contains("Video", true) ||
      t.contains("đính kèm", true) || t.contains("Tệp", true)
  }

  /** Chỉ hiện caption khi tin có đính kèm và content không phải placeholder. */
  private fun mediaCaption(msg: BubbleChatApi.ChatMessage): String {
    if (msg.allAttachments().isEmpty()) return ""
    val text = msg.text.trim()
    if (text.isBlank() || isPlaceholderMediaText(text)) return ""
    return text
  }

  private fun appendMediaToBubble(
    bubbleCol: LinearLayout,
    msg: BubbleChatApi.ChatMessage,
    c: OverlayChatTheme.Palette,
    maxBubbleW: Int,
  ) {
    val atts = msg.allAttachments()
    if (atts.isEmpty()) {
      if (msg.text.isNotBlank()) {
        bubbleCol.addView(textView(msg.text, msg.isMine, c, maxBubbleW))
      }
      return
    }
    for ((idx, att) in atts.withIndex()) {
      appendSingleAttachment(bubbleCol, att, msg, c, maxBubbleW, idx < atts.lastIndex)
    }
  }

  private fun appendSingleAttachment(
    bubbleCol: LinearLayout,
    att: BubbleChatApi.MediaAttachment,
    msg: BubbleChatApi.ChatMessage,
    c: OverlayChatTheme.Palette,
    maxBubbleW: Int,
    addGap: Boolean,
  ) {
    val url = att.url
    if (url.isBlank()) return
    val mime = att.mime?.lowercase().orEmpty()
    val name = att.name?.lowercase().orEmpty()
    val isImage = mime.startsWith("image/") ||
      Regex("\\.(jpe?g|png|gif|webp|bmp|heic|avif)(\\?|$)", RegexOption.IGNORE_CASE)
        .containsMatchIn(url) ||
      Regex("\\.(jpe?g|png|gif|webp|bmp|heic|avif)(\\?|$)", RegexOption.IGNORE_CASE)
        .containsMatchIn(name)
    val isVideo = mime.startsWith("video/") ||
      Regex("\\.(mp4|mov|webm|mkv|avi)(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(url) ||
      Regex("\\.(mp4|mov|webm|mkv|avi)(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(name)

    when {
      isImage -> {
        val img = ImageView(context).apply {
          adjustViewBounds = true
          maxWidth = maxBubbleW
          minimumHeight = dp(120)
          scaleType = ImageView.ScaleType.CENTER_CROP
          layoutParams = LinearLayout.LayoutParams(maxBubbleW, dp(180)).also {
            if (addGap) it.bottomMargin = dp(4)
          }
        }
        bubbleCol.addView(img)
        loadImageAsync(url, img)
      }
      isVideo -> {
        val frame = FrameLayout(context).apply {
          background = OverlayChatTheme.roundedRect(c.inputBg, 10, ::dp, c.border)
          layoutParams = LinearLayout.LayoutParams(maxBubbleW, dp(160)).also {
            if (addGap) it.bottomMargin = dp(4)
          }
        }
        val thumb = ImageView(context).apply {
          scaleType = ImageView.ScaleType.CENTER_CROP
          layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
          )
        }
        frame.addView(thumb)
        frame.addView(TextView(context).apply {
          text = "▶"
          gravity = Gravity.CENTER
          setTextColor(Color.WHITE)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
          setShadowLayer(6f, 0f, 2f, Color.argb(180, 0, 0, 0))
          layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
          )
        })
        frame.addView(TextView(context).apply {
          text = att.name?.take(28) ?: msg.attachmentName?.take(28) ?: "Video"
          setTextColor(Color.WHITE)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          setPadding(dp(8), 0, dp(8), dp(6))
          layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM,
          )
        })
        bubbleCol.addView(frame)
        loadImageAsync(url, thumb)
      }
      else -> {
        val fileName = att.name?.take(40) ?: msg.attachmentName?.take(40) ?: "Tệp đính kèm"
        val kind = when {
          mime.contains("pdf") || name.endsWith(".pdf") -> "Tài liệu PDF"
          mime.contains("word") || name.endsWith(".doc") || name.endsWith(".docx") -> "Tài liệu Word"
          mime.contains("sheet") || mime.contains("excel") || name.endsWith(".xls") || name.endsWith(".xlsx") -> "Bảng tính"
          else -> "Tệp đính kèm"
        }
        // Thẻ tệp: ô biểu tượng đỏ hồng 40dp + tên đậm + loại tệp + nút «Xem».
        val card = LinearLayout(context).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(dp(10), dp(10), dp(10), dp(10))
          background = if (msg.isMine) {
            OverlayChatTheme.roundedRect(Color.argb(46, 255, 255, 255), 12, ::dp)
          } else {
            OverlayChatTheme.roundedRect(c.bg, 12, ::dp, c.border)
          }
          layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
          ).also {
            if (addGap) it.bottomMargin = dp(6)
          }
        }
        card.addView(
          ComposerIcon(context, ComposerIcon.FILE, Color.WHITE, dp(20)).apply {
            background = GradientDrawable(
              GradientDrawable.Orientation.BL_TR,
              intArrayOf(0xFFF43F5E.toInt(), 0xFFE11D48.toInt()),
            ).apply { cornerRadius = dp(12).toFloat() }
            layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
          },
        )
        val info = LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
            it.marginStart = dp(10)
            it.marginEnd = dp(10)
          }
        }
        info.addView(TextView(context).apply {
          text = fileName
          setTextColor(if (msg.isMine) Color.WHITE else c.text)
          setTypeface(typeface, Typeface.BOLD)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
          maxLines = 1
          ellipsize = android.text.TextUtils.TruncateAt.END
        })
        info.addView(TextView(context).apply {
          text = kind
          setTextColor(if (msg.isMine) Color.argb(200, 255, 255, 255) else c.textMuted)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
          setPadding(0, dp(1), 0, 0)
        })
        card.addView(info)
        card.addView(TextView(context).apply {
          text = "Xem"
          gravity = Gravity.CENTER
          setTextColor(c.accent)
          setTypeface(typeface, Typeface.BOLD)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
          setPadding(dp(12), dp(5), dp(12), dp(5))
          background = OverlayChatTheme.roundedRect(c.bgElevated, 8, ::dp, c.bubbleInBorder)
          setOnClickListener {
            try {
              val i = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(absoluteMediaUrl(url)))
              i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
              context.startActivity(i)
            } catch (_: Exception) { }
          }
        })
        bubbleCol.addView(card)
      }
    }
  }

  private fun textView(text: String, mine: Boolean, c: OverlayChatTheme.Palette, maxW: Int): TextView {
    return TextView(context).apply {
      this.text = text
      setTextColor(if (mine) Color.WHITE else c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      setLineSpacing(0f, 1.08f)
      maxWidth = maxW
    }
  }

  private fun loadImageAsync(url: String, target: ImageView) {
    val full = absoluteMediaUrl(url)
    Thread {
      try {
        val conn = URL(full).openConnection() as java.net.HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        authHeader()?.let { conn.setRequestProperty("Authorization", it) }
        val code = conn.responseCode
        if (code !in 200..299) return@Thread
        val bmp = conn.inputStream.use { BitmapFactory.decodeStream(it) }
        handler.post {
          if (bmp != null) target.setImageBitmap(bmp)
        }
      } catch (_: Exception) { }
    }.start()
  }

  private fun authHeader(): String? {
    val token = context.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .getString("auth_token", null)?.trim().orEmpty()
    return if (token.isBlank()) null else "Bearer $token"
  }

  private fun absoluteMediaUrl(raw: String): String {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
    val origin = context.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .getString("api_origin", null)?.trim()?.trimEnd('/') ?: return raw
    return "$origin/${raw.trimStart('/')}"
  }

  private fun applyPanelTop(topReservePx: Int) {
    val column = columnRoot ?: return
    val dm = context.resources.displayMetrics
    panelTopReserve = resolveTopReserve(topReservePx)
    val panelH = (dm.heightPixels - panelTopReserve).coerceAtLeast((dm.heightPixels * 0.55f).toInt())
    basePanelHeight = panelH
    keyboardLiftPx = 0
    val lp = column.layoutParams as? FrameLayout.LayoutParams ?: return
    lp.height = panelH
    lp.bottomMargin = 0
    lp.gravity = Gravity.BOTTOM
    column.layoutParams = lp
  }

  private fun dedupeMessages(rows: List<BubbleChatApi.ChatMessage>): List<BubbleChatApi.ChatMessage> {
    val out = ArrayList<BubbleChatApi.ChatMessage>(rows.size)
    for (m in rows) {
      if (out.any { isNearDuplicate(it, m) }) continue
      out.add(m)
    }
    return out.filterNot { local ->
      local.id.startsWith("local-") &&
        out.any { !it.id.startsWith("local-") && isNearDuplicate(local, it) }
    }
  }

  /** Dựng ngay bản sao đoạn chat đã tải lần trước (20 tin cuối). Trả về true nếu có bản sao. */
  private fun applyCachedConversation(gid: String): Boolean {
    val c = convCache[gid] ?: return false
    messages.clear()
    messages.addAll(c.messages.takeLast(20))
    if (!c.metaAvatarUrl.isNullOrBlank()) metaAvatarUrl = c.metaAvatarUrl
    isDirect = c.isDirect
    isGroupChat = !c.isDirect
    senderAvatars.putAll(c.senderAvatars)
    if (c.title.isNotBlank()) title = c.title
    statusView?.visibility = View.GONE
    applyHeader()
    renderMessages()
    return true
  }

  private fun loadConversationAsync(usedCache: Boolean = false) {
    val seq = ++loadSeq
    val gid = groupId
    val hadMessages = messages.isNotEmpty()
    val t0 = android.os.SystemClock.uptimeMillis()
    if (!hadMessages) {
      statusView?.visibility = View.VISIBLE
      statusView?.text = "Đang tải tin nhắn…"
    }
    Thread {
      // Hai yêu cầu độc lập → chạy SONG SONG (trước đây nối tiếp nên chờ gấp đôi).
      val metaBox = arrayOfNulls<BubbleChatApi.GroupMeta>(1)
      val metaMsBox = LongArray(1)
      val metaThread = Thread {
        val m0 = android.os.SystemClock.uptimeMillis()
        metaBox[0] = BubbleChatApi.fetchGroupMeta(context, gid)
        metaMsBox[0] = android.os.SystemClock.uptimeMillis() - m0
      }
      metaThread.start()
      val r0 = android.os.SystemClock.uptimeMillis()
      val rows = BubbleChatApi.fetchMessages(context, gid)
      val rowsMs = android.os.SystemClock.uptimeMillis() - r0
      try { metaThread.join() } catch (_: InterruptedException) { }
      val meta = metaBox[0]
      val fetchedMs = android.os.SystemClock.uptimeMillis() - t0
      val apply = Runnable {
        try {
        if (seq != loadSeq || gid != groupId || panelRoot == null) {
          android.util.Log.d("SxPanel", "bỏ qua kết quả tải: seq=$seq/$loadSeq, cùng nhóm=${gid == groupId}, khung còn=${panelRoot != null}")
          return@Runnable
        }
        if (meta != null) {
          title = meta.name.ifBlank { title }
          isDirect = meta.isDirect
          isGroupChat = !meta.isDirect
          if (!meta.avatarUrl.isNullOrBlank()) metaAvatarUrl = meta.avatarUrl
        }
        rememberAvatars(rows)
        applyHeader()
        // Tải lỗi/trống mà đang có tin hiển thị thì giữ nguyên, đừng xoá sạch khung chỉ vì một lần tải hụt.
        if (rows.isEmpty() && hadMessages) {
          android.util.Log.d("SxPanel", "tải trống nhưng đang có ${messages.size} tin → giữ nguyên (nhóm ${gid.take(8)})")
          return@Runnable
        }
        if (rows.isEmpty()) {
          statusView?.visibility = View.VISIBLE
          statusView?.text = "Chưa có tin nhắn"
        } else {
          statusView?.visibility = View.GONE
        }
        val fresh = dedupeMessages(rows)
        // Không đổi so với đang hiển thị thì khỏi dựng lại (đỡ nháy và đỡ tốn).
        val unchanged = messages.size == fresh.size && messages.indices.all { messages[it].id == fresh[it].id }
        var renderMs = 0L
        if (!unchanged) {
          messages.clear()
          messages.addAll(fresh)
          val r1 = android.os.SystemClock.uptimeMillis()
          renderMessages()
          renderMs = android.os.SystemClock.uptimeMillis() - r1
        }
        convCache[gid] = CachedConv(title, fresh.takeLast(60), metaAvatarUrl, isDirect, HashMap(senderAvatars))
        // Log tốc độ mở khung (mức Debug, bật khi cần đo). Không ghi nội dung tin.
        android.util.Log.d(
          "SxPanel",
          "mở khung ${gid.take(8)}: dựng khung ${lastBuildMs}ms; tải nhóm ${metaMsBox[0]}ms, tải tin ${rowsMs}ms (xong sau ${fetchedMs}ms); dựng tin ${renderMs}ms; xong ${android.os.SystemClock.uptimeMillis() - showAtMs}ms kể từ lúc mở (cache=$usedCache, đổi=${!unchanged}, tin=${fresh.size})",
        )
        } catch (t: Throwable) {
          // Ghi rõ lỗi (loại, thông điệp, vài dòng đầu dấu vết) thay vì để bước vẽ chết lặng.
          android.util.Log.e("SxPanel", "bước vẽ LỖI: ${t.javaClass.simpleName}: ${t.message} @ ${t.stackTrace.take(5).joinToString(" <- ")}")
        }
      }
      val wait = animationEndsAt - android.os.SystemClock.uptimeMillis()
      if (wait > 0) handler.postDelayed(apply, wait) else handler.post(apply)
    }.start()
  }

  private fun senderAvatarKey(msg: BubbleChatApi.ChatMessage): String =
    msg.userId.ifBlank { msg.sender }

  private fun rememberAvatars(list: List<BubbleChatApi.ChatMessage>) {
    for (m in list) {
      val u = m.avatarUrl?.takeIf { it.isNotBlank() } ?: continue
      senderAvatars[senderAvatarKey(m)] = u
    }
  }

  /** Ảnh đại diện của một tin: của chính tin → đã thấy trước đó → (chat 1-1) ảnh người đối diện. */
  private fun avatarFor(msg: BubbleChatApi.ChatMessage): String? =
    msg.avatarUrl?.takeIf { it.isNotBlank() }
      ?: senderAvatars[senderAvatarKey(msg)]
      ?: (if (isDirect) headAvatarUrl() else null)

  /** Ảnh của đoạn chat đang mở: ưu tiên dữ liệu máy chủ, nếu chưa có thì lấy từ dải đầu chat. */
  private fun headAvatarUrl(): String? =
    metaAvatarUrl?.takeIf { it.isNotBlank() }
      ?: heads.firstOrNull { it.groupId == groupId }?.avatarUrl?.takeIf { it.isNotBlank() }

  private fun applyHeader() {
    val c = colors()
    titleView?.text = title
    subtitleView?.text = if (isDirect) "Trực tiếp" else "Nhóm chat · realtime"
    avatarView?.setAvatar(headAvatarUrl(), title)
  }

  private fun resolveTopReserve(topReservePx: Int): Int {
    val dm = context.resources.displayMetrics
    val minStrip = statusBarHeight() + dp(58) + dp(10)
    val fromBubble = if (topReservePx > 0) topReservePx else minStrip
    return fromBubble.coerceIn(minStrip, (dm.heightPixels * 0.22f).toInt())
  }

  private fun statusBarHeight(): Int {
    val resId = context.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resId > 0) context.resources.getDimensionPixelSize(resId) else dp(24)
  }

  private fun formatTime(ms: Long): String {
    return try {
      DateFormat.getTimeFormat(context).format(Date(ms))
    } catch (_: Exception) {
      SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(ms))
    }
  }

  private fun colors() = OverlayChatTheme.palette(context)

  private fun myUserId(): String =
    context.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .getString("user_id", null)?.trim().orEmpty()

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
      context.resources.displayMetrics,
    ).toInt()
  }
}

/** Biểu tượng nét tròn (lưới 24×24) cho thanh nhập tin: «+», ảnh, cảm xúc, gửi. Vẽ bằng đường dẫn nên sắc nét ở mọi mật độ. */
internal class ComposerIcon(
  ctx: android.content.Context,
  private val kind: Int,
  private val tint: Int,
  private val iconPx: Int,
) : View(ctx) {
  private val stroke = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
    color = tint
    style = android.graphics.Paint.Style.STROKE
    strokeCap = android.graphics.Paint.Cap.ROUND
    strokeJoin = android.graphics.Paint.Join.ROUND
  }
  private val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
    color = tint
    style = android.graphics.Paint.Style.FILL
  }
  private val send: android.graphics.Path? =
    androidx.core.graphics.PathParser.createPathFromPathData("M2.01 21L23 12 2.01 3 2 10l15 2-15 2z")
  private val smile: android.graphics.Path? =
    androidx.core.graphics.PathParser.createPathFromPathData("M8 14c0 0 1.5 2 4 2s4-2 4-2")
  private val photoHill: android.graphics.Path? =
    androidx.core.graphics.PathParser.createPathFromPathData("M21 15L16 10L5 21")
  private val phone: android.graphics.Path? = androidx.core.graphics.PathParser.createPathFromPathData(
    "M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z",
  )
  private val videoTri: android.graphics.Path? =
    androidx.core.graphics.PathParser.createPathFromPathData("M15 10l5.5-3v10L15 14z")
  // Bong bóng chat của riêng app (cùng kiểu icon «Tin nhắn» trên thanh tab) — không dùng logo của hãng khác.
  private val chatBubble: android.graphics.Path? = androidx.core.graphics.PathParser.createPathFromPathData(
    "M12 3.2c-4.9 0-8.8 3.6-8.8 8.1 0 1.9.7 3.7 1.9 5L4.4 20.2a.6.6 0 0 0 .8.7l3.7-1.7c1 .4 2 .6 3.1.6 4.9 0 8.8-3.6 8.8-8.1S16.9 3.2 12 3.2Z",
  )
  private val dotCut = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
    color = android.graphics.Color.WHITE
    style = android.graphics.Paint.Style.FILL
  }
  private val cameraBody: android.graphics.Path? = androidx.core.graphics.PathParser.createPathFromPathData(
    "M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  )
  private val filePage: android.graphics.Path? = androidx.core.graphics.PathParser.createPathFromPathData(
    "M14 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8z M14 3v5h5",
  )

  init {
    isClickable = true
  }

  override fun onDraw(canvas: android.graphics.Canvas) {
    val s = iconPx / 24f
    canvas.save()
    canvas.translate((width - iconPx) / 2f, (height - iconPx) / 2f)
    canvas.scale(s, s)
    when (kind) {
      PLUS -> {
        stroke.strokeWidth = 2.5f
        canvas.drawLine(12f, 5f, 12f, 19f, stroke)
        canvas.drawLine(5f, 12f, 19f, 12f, stroke)
      }
      IMAGE -> {
        stroke.strokeWidth = 2f
        canvas.drawRoundRect(3f, 3f, 21f, 21f, 2f, 2f, stroke)
        canvas.drawCircle(8.5f, 8.5f, 1.5f, stroke)
        photoHill?.let { canvas.drawPath(it, stroke) }
      }
      PHONE -> {
        stroke.strokeWidth = 1.8f
        phone?.let { canvas.drawPath(it, stroke) }
      }
      VIDEO -> {
        stroke.strokeWidth = 1.8f
        canvas.drawRoundRect(3f, 6f, 15f, 18f, 2.5f, 2.5f, stroke)
        videoTri?.let { canvas.drawPath(it, stroke) }
      }
      INFO -> {
        stroke.strokeWidth = 2f
        canvas.drawCircle(12f, 12f, 9f, stroke)
        canvas.drawLine(12f, 11f, 12f, 16f, stroke)
        canvas.drawCircle(12f, 8f, 1.1f, fill)
      }
      CLOSE -> {
        stroke.strokeWidth = 2.6f
        canvas.drawLine(6f, 6f, 18f, 18f, stroke)
        canvas.drawLine(18f, 6f, 6f, 18f, stroke)
      }
      CHAT -> {
        chatBubble?.let { canvas.drawPath(it, fill) }
        canvas.drawCircle(8.3f, 11.5f, 1.15f, dotCut)
        canvas.drawCircle(12f, 11.5f, 1.15f, dotCut)
        canvas.drawCircle(15.7f, 11.5f, 1.15f, dotCut)
      }
      CAMERA -> {
        stroke.strokeWidth = 1.9f
        cameraBody?.let { canvas.drawPath(it, stroke) }
        canvas.drawCircle(12f, 13f, 3.5f, stroke)
      }
      SEARCH -> {
        stroke.strokeWidth = 2f
        canvas.drawCircle(11f, 11f, 7f, stroke)
        canvas.drawLine(21f, 21f, 16.2f, 16.2f, stroke)
      }
      FILE -> {
        stroke.strokeWidth = 1.9f
        filePage?.let { canvas.drawPath(it, stroke) }
      }
      EMOJI -> {
        stroke.strokeWidth = 2f
        canvas.drawCircle(12f, 12f, 9f, stroke)
        smile?.let { canvas.drawPath(it, stroke) }
        canvas.drawCircle(9f, 9f, 1.1f, fill)
        canvas.drawCircle(15f, 9f, 1.1f, fill)
      }
      else -> {
        // Mũi tên «gửi» hơi lệch phải 1 đơn vị cho cân quang học (như ml-0.5 của thiết kế).
        canvas.translate(0.8f, 0f)
        send?.let { canvas.drawPath(it, fill) }
      }
    }
    canvas.restore()
  }

  companion object {
    const val PLUS = 0
    const val IMAGE = 1
    const val EMOJI = 2
    const val SEND = 3
    const val PHONE = 4
    const val VIDEO = 5
    const val INFO = 6
    const val CLOSE = 7
    const val CHAT = 8
    const val FILE = 9
    const val CAMERA = 10
    const val SEARCH = 11
  }
}
