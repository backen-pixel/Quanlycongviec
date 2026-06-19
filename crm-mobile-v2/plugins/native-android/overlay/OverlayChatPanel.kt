package vn.tubeppro.crmobilev2.overlay

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowManager
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
) {
  private val handler = Handler(Looper.getMainLooper())
  private var panelRoot: FrameLayout? = null
  private var columnRoot: LinearLayout? = null
  private var messagesWrap: LinearLayout? = null
  private var scrollView: ScrollView? = null
  private var inputView: EditText? = null
  private var statusView: TextView? = null
  private var titleView: TextView? = null
  private var subtitleView: TextView? = null
  private var avatarView: TextView? = null
  private var composerWrap: LinearLayout? = null
  private var replyBar: LinearLayout? = null
  private var replyLabel: TextView? = null
  private var replyText: TextView? = null
  private var pendingStrip: HorizontalScrollView? = null
  private var pendingRow: LinearLayout? = null
  private var emojiPanel: LinearLayout? = null
  private var popupLayer: FrameLayout? = null
  private var sheetFrame: FrameLayout? = null
  private var panelParams: WindowManager.LayoutParams? = null
  private var keyboardListener: ViewTreeObserver.OnGlobalLayoutListener? = null
  private var panelBaseHeight = 0
  private var keyboardLiftPx = 0
  private var topReservePxStored = 0
  private var groupId = ""
  private var title = ""
  private var isDirect = true
  private var isGroupChat = false
  private var replyTo: BubbleChatApi.ChatMessage? = null
  private var emojiOpen = false
  private val pendingFiles = ArrayList<BubbleChatApi.PendingFile>()
  private val messages = ArrayList<BubbleChatApi.ChatMessage>()

  private val quickReactions = arrayOf("👍", "❤️", "😂", "😮", "😢", "🙏")
  private val pickerEmojis = arrayOf(
    "😀", "😂", "😍", "😢", "😡", "👍", "👎", "❤️", "🔥", "🎉",
    "🙏", "👏", "😮", "🤔", "😎", "🥰", "😭", "💯", "✅", "❌",
  )

  fun isShowing(): Boolean = panelRoot != null

  fun show(groupId: String, title: String, topReservePx: Int = 0) {
    if (groupId.isBlank()) return
    this.groupId = groupId
    this.title = title.ifBlank { "Chat" }
    if (panelRoot != null) {
      applyPanelTop(topReservePx)
      applyHeader()
      loadConversationAsync()
      return
    }
    buildPanel(topReservePx)
    loadConversationAsync()
    BubbleChatApi.markRead(context, groupId)
  }

  fun hide() {
    hidePopups()
    hideKeyboard()
    detachKeyboardListener()
    panelRoot?.let {
      try { windowManager.removeView(it) } catch (_: Exception) { }
    }
    panelRoot = null
    columnRoot = null
    messagesWrap = null
    scrollView = null
    inputView = null
    statusView = null
    composerWrap = null
    replyBar = null
    pendingStrip = null
    pendingRow = null
    emojiPanel = null
    popupLayer = null
    sheetFrame = null
    keyboardLiftPx = 0
    BubbleMediaBridge.clearVisibilityHook()
    replyTo = null
    pendingFiles.clear()
    messages.clear()
    onClosed()
  }

  fun seedMessages(json: String) {
    if (!isShowing()) return
    val myId = myUserId()
    val parsed = BubbleChatApi.parseMessagesFromSeed(json, myId)
    if (parsed.isEmpty()) return
    handler.post {
      messages.clear()
      messages.addAll(parsed)
      isGroupChat = !isDirect && parsed.map { it.userId }.distinct().size > 1
      renderMessages()
    }
  }

  fun appendIncoming(sender: String, text: String) {
    if (!isShowing()) return
    handler.post {
      messages.add(
        BubbleChatApi.ChatMessage(
          id = "local-${System.currentTimeMillis()}",
          userId = "",
          sender = sender.ifBlank { "Tin nhắn" },
          text = text.ifBlank { "…" },
          isMine = false,
        ),
      )
      if (messages.size > 80) messages.removeAt(0)
      renderMessages()
    }
  }

  private fun buildPanel(topReservePx: Int) {
    val c = colors()
    val dm = context.resources.displayMetrics
    topReservePxStored = topReservePx
    val topReserve = resolveTopReserve(topReservePx)
    panelBaseHeight = (dm.heightPixels - topReserve).coerceAtLeast((dm.heightPixels * 0.55f).toInt())

    // Cửa sổ full màn hình — nhận inset bàn phím, sheet chat nằm ở đáy.
    val outer = FrameLayout(context).apply {
      isFocusable = true
      isFocusableInTouchMode = true
    }

    val sheetBg = OverlayChatTheme.roundedRect(c.bgElevated, 18, ::dp, c.border)
    sheetBg.cornerRadii = floatArrayOf(
      dp(18).toFloat(), dp(18).toFloat(),
      dp(18).toFloat(), dp(18).toFloat(),
      0f, 0f, 0f, 0f,
    )
    val sheet = FrameLayout(context).apply {
      background = sheetBg
      elevation = dp(16).toFloat()
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        panelBaseHeight,
        Gravity.BOTTOM,
      )
    }
    sheetFrame = sheet

    val column = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
    }
    columnRoot = column

    column.addView(buildHeader(c))
    column.addView(buildMessagesArea(c))
    column.addView(buildComposer(c))
    sheet.addView(column)

    val popup = FrameLayout(context).apply {
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      visibility = View.GONE
    }
    popupLayer = popup

    outer.addView(sheet)
    outer.addView(popup)

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM,
      android.graphics.PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.softInputMode =
      WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
        WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN

    windowManager.addView(outer, params)
    panelRoot = outer
    panelParams = params
    attachKeyboardHandler(outer)
    BubbleMediaBridge.registerVisibilityHook { visible ->
      handler.post { panelRoot?.visibility = if (visible) View.VISIBLE else View.GONE }
    }
    inputView?.setOnFocusChangeListener { _, hasFocus ->
      if (hasFocus) {
        setEmojiOpen(false)
        showKeyboard()
        scrollView?.postDelayed({ scrollView?.fullScroll(View.FOCUS_DOWN) }, 150)
      }
    }
    inputView?.setOnClickListener { showKeyboard() }
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
    replyLabel = TextView(context).apply {
      text = "Trả lời"
      setTextColor(c.accent)
      setTypeface(typeface, Typeface.BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    }
    replyText = TextView(context).apply {
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      maxLines = 2
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
        it.marginStart = dp(8)
      }
    }
    val replyClose = TextView(context).apply {
      text = "✕"
      setTextColor(c.textFaint)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setPadding(dp(8), dp(4), dp(4), dp(4))
      setOnClickListener { setReplyTo(null) }
    }
    reply.addView(replyLabel)
    reply.addView(replyText)
    reply.addView(replyClose)
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

    val emoji = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(c.bgElevated)
      setPadding(dp(8), dp(6), dp(8), dp(6))
      visibility = View.GONE
    }
    emojiPanel = emoji
    val emojiGrid = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    var row: LinearLayout? = null
    pickerEmojis.forEachIndexed { idx, em ->
      if (idx % 5 == 0) {
        row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        emojiGrid.addView(row)
      }
      row?.addView(TextView(context).apply {
        text = em
        gravity = Gravity.CENTER
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        layoutParams = LinearLayout.LayoutParams(0, dp(40), 1f)
        setOnClickListener { insertEmoji(em) }
      })
    }
    emoji.addView(emojiGrid)
    wrap.addView(emoji)

    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM
      setPadding(dp(12), dp(10), dp(12), dp(12))
    }

    val plus = TextView(context).apply {
      text = "+"
      gravity = Gravity.CENTER
      setTextColor(c.accent)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      setTypeface(typeface, Typeface.BOLD)
      background = OverlayChatTheme.plusButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).also { it.bottomMargin = dp(4) }
      setOnClickListener { showAttachSheet() }
    }

    val inputWrap = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM
      background = OverlayChatTheme.roundedRect(c.inputBg, 22, ::dp, c.border)
      setPadding(dp(16), 0, dp(4), 0)
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
        it.marginStart = dp(10)
        it.marginEnd = dp(10)
        it.bottomMargin = dp(4)
      }
      minimumHeight = dp(44)
    }

    inputView = EditText(context).apply {
      hint = "Nhắn tin..."
      setHintTextColor(c.textFaint)
      setTextColor(c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      maxLines = 4
      background = null
      setPadding(0, dp(11), 0, dp(11))
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }

    val emojiBtn = TextView(context).apply {
      text = "☺"
      gravity = Gravity.CENTER
      setTextColor(c.textFaint)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      layoutParams = LinearLayout.LayoutParams(dp(36), dp(44))
      setOnClickListener { setEmojiOpen(!emojiOpen) }
    }

    inputWrap.addView(inputView)
    inputWrap.addView(emojiBtn)

    val send = TextView(context).apply {
      text = "➤"
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      background = OverlayChatTheme.sendButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
      setOnClickListener { sendCurrentDraft() }
    }

    bar.addView(plus)
    bar.addView(inputWrap)
    bar.addView(send)
    wrap.addView(bar)
    return wrap
  }

  private fun buildHeader(c: OverlayChatTheme.Palette): View {
    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(8), dp(10), dp(8), dp(10))
      setBackgroundColor(c.bgElevated)
    }
    val back = TextView(context).apply {
      text = "←"
      gravity = Gravity.CENTER
      setTextColor(c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      background = OverlayChatTheme.iconButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(38), dp(38))
      setOnClickListener { hide() }
    }
    avatarView = TextView(context).apply {
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTypeface(typeface, Typeface.BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      layoutParams = LinearLayout.LayoutParams(dp(40), dp(40)).also { it.marginStart = dp(6) }
    }
    val body = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
        it.marginStart = dp(10)
        it.marginEnd = dp(8)
      }
    }
    titleView = TextView(context).apply {
      setTextColor(c.text)
      setTypeface(typeface, Typeface.BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      maxLines = 1
    }
    subtitleView = TextView(context).apply {
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setTypeface(typeface, Typeface.BOLD)
      maxLines = 1
    }
    body.addView(titleView)
    body.addView(subtitleView)
    val expand = TextView(context).apply {
      text = "⛶"
      gravity = Gravity.CENTER
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      background = OverlayChatTheme.iconButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(38), dp(38)).also { it.marginStart = dp(4) }
      setOnClickListener {
        val gid = groupId
        val t = title
        hide()
        if (gid.isNotBlank()) onExpand(gid, t)
      }
    }
    bar.addView(back)
    bar.addView(avatarView)
    bar.addView(body)
    bar.addView(expand)
    return LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      addView(bar)
      addView(View(context).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
        setBackgroundColor(c.border)
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
      setPadding(dp(12), dp(4), dp(12), dp(12))
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
    replyTo = msg
    val c = colors()
    if (msg == null) {
      replyBar?.visibility = View.GONE
      return
    }
    replyBar?.visibility = View.VISIBLE
    replyLabel?.text = "Trả lời ${msg.sender}"
    replyText?.text = msg.text
    inputView?.requestFocus()
    showKeyboard()
  }

  private fun setEmojiOpen(open: Boolean) {
    emojiOpen = open
    emojiPanel?.visibility = if (open) View.VISIBLE else View.GONE
    if (open) {
      hideKeyboard()
      val emojiLift = dp(200)
      sheetFrame?.translationY = -emojiLift.toFloat()
    } else if (keyboardLiftPx <= 0) {
      sheetFrame?.translationY = 0f
    } else {
      sheetFrame?.translationY = -keyboardLiftPx.toFloat()
    }
  }

  private fun insertEmoji(emoji: String) {
    val input = inputView ?: return
    val start = input.selectionStart.coerceAtLeast(0)
    val end = input.selectionEnd.coerceAtLeast(0)
    input.text.replace(start.coerceAtMost(end), end.coerceAtLeast(start), emoji)
    input.setSelection(start + emoji.length)
  }

  private fun showAttachSheet() {
    hideKeyboard()
    setEmojiOpen(false)
    hidePopups()
    val popup = popupLayer ?: return
    val c = colors()
    popup.removeAllViews()
    popup.visibility = View.VISIBLE
    popup.setOnClickListener { hidePopups() }

    val sheet = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = OverlayChatTheme.roundedRect(c.bgElevated, 16, ::dp, c.border)
      setPadding(dp(12), dp(12), dp(12), dp(16))
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM,
      ).also {
        it.bottomMargin = panelBaseHeight + keyboardLiftPx + dp(8)
      }
      setOnClickListener { /* chặn đóng khi bấm trong sheet */ }
    }

    fun addOpt(label: String, mode: String) {
      sheet.addView(TextView(context).apply {
        text = label
        setTextColor(c.text)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setPadding(dp(14), dp(14), dp(14), dp(14))
        setOnClickListener {
          hidePopups()
          BubbleMediaBridge.pick(context, mode) { files ->
            if (files.isNotEmpty()) {
              pendingFiles.addAll(files)
              refreshPendingStrip()
            }
          }
        }
      })
    }

    addOpt("🖼 Thư viện ảnh", BubbleMediaBridge.MODE_GALLERY)
    addOpt("🎬 Thư viện video", BubbleMediaBridge.MODE_VIDEO)
    addOpt("📎 Tệp tin", BubbleMediaBridge.MODE_FILE)
    addOpt("📷 Chụp ảnh", BubbleMediaBridge.MODE_CAMERA)
    addOpt("🎥 Quay video", BubbleMediaBridge.MODE_RECORD)
    popup.addView(sheet)
  }

  private fun hidePopups() {
    popupLayer?.visibility = View.GONE
    popupLayer?.removeAllViews()
  }

  private fun refreshPendingStrip() {
    val row = pendingRow ?: return
    val c = colors()
    row.removeAllViews()
    if (pendingFiles.isEmpty()) {
      pendingStrip?.visibility = View.GONE
      return
    }
    pendingStrip?.visibility = View.VISIBLE
    pendingFiles.forEachIndexed { idx, f ->
      val chip = TextView(context).apply {
        text = f.name.take(18)
        setTextColor(c.text)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setPadding(dp(10), dp(6), dp(10), dp(6))
        background = OverlayChatTheme.roundedRect(c.inputBg, 8, ::dp, c.border)
        layoutParams = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).also { it.marginEnd = dp(8) }
        setOnLongClickListener {
          pendingFiles.removeAt(idx)
          refreshPendingStrip()
          true
        }
      }
      row.addView(chip)
    }
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
    anchor.getLocationInWindow(loc)
    val lp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
    )
    lp.gravity = Gravity.TOP or Gravity.START
    lp.topMargin = (loc[1] - dp(80)).coerceAtLeast(dp(60))
    lp.marginStart = dp(20)
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
    val maxBubbleW = (panelRoot?.width?.takeIf { it > 0 } ?: context.resources.displayMetrics.widthPixels) * 0.78f
    wrap.removeAllViews()
    var lastSenderId: String? = null
    for (msg in messages) {
      val showAvatar = isGroupChat && !msg.isMine && msg.userId != lastSenderId
      val showSenderName = isGroupChat && !msg.isMine && msg.userId != lastSenderId
      wrap.addView(buildMessageRow(msg, c, maxBubbleW.toInt(), showAvatar, showSenderName))
      if (!msg.isMine) lastSenderId = msg.userId else lastSenderId = null
    }
    scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
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
      gravity = if (msg.isMine) Gravity.END else Gravity.START
      setPadding(0, 0, 0, dp(10))
    }
    if (showAvatar) {
      row.addView(TextView(context).apply {
        text = OverlayChatTheme.initials(msg.sender)
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        setTypeface(typeface, Typeface.BOLD)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        background = OverlayChatTheme.circleBg(OverlayChatTheme.avatarColor(msg.sender), ::dp)
        layoutParams = LinearLayout.LayoutParams(dp(34), dp(34)).also {
          it.marginEnd = dp(8)
          it.topMargin = dp(18)
        }
      })
    } else if (isGroupChat && !msg.isMine) {
      row.addView(View(context).apply {
        layoutParams = LinearLayout.LayoutParams(dp(42), 1)
      })
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

    val isImage = msg.messageType.contains("image", true) ||
      (msg.attachmentUrl != null && msg.text.contains("Hình ảnh"))
    if (isImage && !msg.attachmentUrl.isNullOrBlank()) {
      val img = ImageView(context).apply {
        adjustViewBounds = true
        maxWidth = maxBubbleW
        layoutParams = LinearLayout.LayoutParams(maxBubbleW, LinearLayout.LayoutParams.WRAP_CONTENT)
      }
      bubbleCol.addView(img)
      loadImageAsync(msg.attachmentUrl!!, img)
      if (msg.text.isNotBlank() && !msg.text.contains("Hình ảnh")) {
        bubbleCol.addView(textView(msg.text, msg.isMine, c, maxBubbleW))
      }
    } else {
      bubbleCol.addView(textView(msg.text, msg.isMine, c, maxBubbleW))
    }

    if (msg.createdAtMs > 0L) {
      bubbleCol.addView(TextView(context).apply {
        text = formatTime(msg.createdAtMs)
        setTextColor(if (msg.isMine) Color.argb(170, 255, 255, 255) else c.textFaint)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setPadding(0, dp(4), 0, 0)
      })
    }

    bubbleCol.setOnLongClickListener {
      showMessageActions(msg, bubbleCol)
      true
    }
    bubbleCol.setOnClickListener { setReplyTo(msg) }

    col.addView(bubbleCol)

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

  private fun textView(text: String, mine: Boolean, c: OverlayChatTheme.Palette, maxW: Int): TextView {
    return TextView(context).apply {
      this.text = text
      setTextColor(if (mine) Color.WHITE else c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      setLineSpacing(0f, 1.05f)
      maxWidth = maxW
    }
  }

  private fun loadImageAsync(url: String, target: ImageView) {
    val full = absoluteMediaUrl(url)
    Thread {
      try {
        val conn = URL(full).openConnection()
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        val bmp = conn.getInputStream().use { BitmapFactory.decodeStream(it) }
        handler.post {
          if (bmp != null) target.setImageBitmap(bmp)
        }
      } catch (_: Exception) { }
    }.start()
  }

  private fun absoluteMediaUrl(raw: String): String {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
    val origin = context.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .getString("api_origin", null)?.trim()?.trimEnd('/') ?: return raw
    return "$origin/${raw.trimStart('/')}"
  }

  private fun sendCurrentDraft() {
    val text = inputView?.text?.toString()?.trim().orEmpty()
    val files = pendingFiles.toList()
    if ((text.isBlank() && files.isEmpty()) || groupId.isBlank()) return

    val gid = groupId
    val replyId = replyTo?.id
    inputView?.setText("")
    setReplyTo(null)
    pendingFiles.clear()
    refreshPendingStrip()
    hideKeyboard()

    statusView?.visibility = View.VISIBLE
    statusView?.text = if (files.isNotEmpty()) "Đang gửi…" else ""

    Thread {
      val ok = if (files.isNotEmpty()) {
        BubbleChatApi.uploadWithFiles(context, gid, files, text, replyId)
      } else {
        BubbleChatApi.sendMessage(context, gid, text, replyId)
      }
      handler.post {
        if (!ok && gid == groupId) {
          statusView?.visibility = View.VISIBLE
          statusView?.text = "Gửi thất bại — thử lại"
        } else if (ok && gid == groupId) {
          statusView?.visibility = View.GONE
          loadConversationAsync()
        }
      }
    }.start()
  }

  private fun loadConversationAsync() {
    statusView?.visibility = View.VISIBLE
    statusView?.text = "Đang tải tin nhắn…"
    val gid = groupId
    Thread {
      val meta = BubbleChatApi.fetchGroupMeta(context, gid)
      val rows = BubbleChatApi.fetchMessages(context, gid)
      handler.post {
        if (gid != groupId || panelRoot == null) return@post
        if (meta != null) {
          title = meta.name.ifBlank { title }
          isDirect = meta.isDirect
          isGroupChat = !meta.isDirect
        }
        applyHeader()
        if (rows.isEmpty()) {
          statusView?.visibility = View.VISIBLE
          statusView?.text = "Chưa có tin nhắn"
        } else {
          statusView?.visibility = View.GONE
        }
        messages.clear()
        messages.addAll(rows)
        renderMessages()
      }
    }.start()
  }

  private fun applyHeader() {
    val c = colors()
    titleView?.text = title
    subtitleView?.text = if (isDirect) "Trực tiếp" else "Nhóm chat · realtime"
    avatarView?.apply {
      text = OverlayChatTheme.initials(title)
      background = OverlayChatTheme.circleBg(OverlayChatTheme.avatarColor(title), ::dp)
    }
  }

  private fun applyPanelTop(topReservePx: Int) {
    topReservePxStored = topReservePx
    val dm = context.resources.displayMetrics
    val topReserve = resolveTopReserve(topReservePx)
    panelBaseHeight = (dm.heightPixels - topReserve).coerceAtLeast((dm.heightPixels * 0.55f).toInt())
    val sheet = sheetFrame ?: return
    val lp = sheet.layoutParams as? FrameLayout.LayoutParams ?: return
    if (lp.height != panelBaseHeight) {
      lp.height = panelBaseHeight
      sheet.layoutParams = lp
    }
  }

  private fun resolveTopReserve(topReservePx: Int): Int {
    val dm = context.resources.displayMetrics
    val minStrip = statusBarHeight() + dp(58) + dp(10)
    val fromBubble = if (topReservePx > 0) topReservePx else minStrip
    return fromBubble.coerceIn(minStrip, (dm.heightPixels * 0.22f).toInt())
  }

  private fun attachKeyboardHandler(outer: FrameLayout) {
    detachKeyboardListener()
    var lastKeyboard = -1

    fun applyKeyboardOffset(keyboardH: Int) {
      val lift = keyboardH.coerceAtLeast(0)
      if (lift == lastKeyboard) return
      lastKeyboard = lift
      keyboardLiftPx = lift
      sheetFrame?.translationY = -lift.toFloat()
      if (lift > 0) {
        scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
      }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      outer.setOnApplyWindowInsetsListener { _, insets ->
        val ime = insets.getInsets(WindowInsets.Type.ime()).bottom
        val visible = insets.isVisible(WindowInsets.Type.ime())
        applyKeyboardOffset(if (visible) ime else 0)
        insets
      }
    }

    val listener = ViewTreeObserver.OnGlobalLayoutListener {
      val rect = Rect()
      outer.getWindowVisibleDisplayFrame(rect)
      val screenH = context.resources.displayMetrics.heightPixels
      val keyboardH = (screenH - rect.bottom).coerceAtLeast(0)
      if (keyboardH > dp(80)) {
        applyKeyboardOffset(keyboardH)
      } else if (lastKeyboard > 0) {
        applyKeyboardOffset(0)
      }
    }
    keyboardListener = listener
    outer.viewTreeObserver.addOnGlobalLayoutListener(listener)
  }

  private fun detachKeyboardListener() {
    val root = panelRoot
    val listener = keyboardListener
    if (root != null && listener != null) {
      root.viewTreeObserver.removeOnGlobalLayoutListener(listener)
    }
    keyboardListener = null
  }

  private fun showKeyboard() {
    val input = inputView ?: return
    input.requestFocus()
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    imm?.showSoftInput(input, InputMethodManager.SHOW_FORCED)
    panelRoot?.postDelayed({
      scrollView?.fullScroll(View.FOCUS_DOWN)
    }, 200)
  }

  private fun hideKeyboard() {
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    inputView?.let { imm?.hideSoftInputFromWindow(it.windowToken, 0) }
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
