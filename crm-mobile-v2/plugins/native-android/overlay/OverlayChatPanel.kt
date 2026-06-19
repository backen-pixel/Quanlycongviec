package vn.tubeppro.crmobilev2.overlay

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Panel chat overlay — layout/màu khớp ChatHeader + ChatMessageRow + ChatComposer trong app.
 */
class OverlayChatPanel(
  private val context: Context,
  private val windowManager: WindowManager,
  private val onClosed: () -> Unit,
) {
  private val handler = Handler(Looper.getMainLooper())
  private var panelRoot: FrameLayout? = null
  private var messagesWrap: LinearLayout? = null
  private var scrollView: ScrollView? = null
  private var inputView: EditText? = null
  private var statusView: TextView? = null
  private var titleView: TextView? = null
  private var subtitleView: TextView? = null
  private var avatarView: TextView? = null
  private var groupId = ""
  private var title = ""
  private var isDirect = true
  private var isGroupChat = false
  private val messages = ArrayList<BubbleChatApi.ChatMessage>()

  fun isShowing(): Boolean = panelRoot != null

  fun show(groupId: String, title: String) {
    if (groupId.isBlank()) return
    this.groupId = groupId
    this.title = title.ifBlank { "Chat" }
    if (panelRoot != null) {
      applyHeader()
      loadConversationAsync()
      return
    }
    buildPanel()
    loadConversationAsync()
    BubbleChatApi.markRead(context, groupId)
    FloatingBubbleBridge.emitPanelOpened(groupId)
  }

  fun hide() {
    hideKeyboard()
    panelRoot?.let {
      try {
        windowManager.removeView(it)
      } catch (_: Exception) { }
    }
    panelRoot = null
    messagesWrap = null
    scrollView = null
    inputView = null
    statusView = null
    titleView = null
    subtitleView = null
    avatarView = null
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

  private fun buildPanel() {
    val c = colors()
    val dm = context.resources.displayMetrics
    val panelW = dm.widthPixels
    val panelH = (dm.heightPixels * 0.82f).toInt()

    val root = FrameLayout(context)
    val sheetBg = OverlayChatTheme.roundedRect(c.bgElevated, 18, ::dp, c.border)
    sheetBg.cornerRadii = floatArrayOf(
      dp(18).toFloat(), dp(18).toFloat(),
      dp(18).toFloat(), dp(18).toFloat(),
      0f, 0f, 0f, 0f,
    )
    root.background = sheetBg
    root.elevation = dp(16).toFloat()
    root.isFocusable = true
    root.isFocusableInTouchMode = true

    val column = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
    }

    column.addView(buildHeader(c))
    column.addView(buildMessagesArea(c))
    column.addView(buildComposer(c))

    root.addView(column)

    val params = WindowManager.LayoutParams(
      panelW,
      panelH,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      android.graphics.PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.BOTTOM
    params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE

    windowManager.addView(root, params)
    panelRoot = root
  }

  private fun buildHeader(c: OverlayChatTheme.Palette): View {
    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(8), dp(10), dp(8), dp(10))
      setBackgroundColor(c.bgElevated)
    }

    val divider = View(context).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        1,
      )
    }
    divider.setBackgroundColor(c.border)

    val back = TextView(context).apply {
      text = "←"
      gravity = Gravity.CENTER
      setTextColor(c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      background = OverlayChatTheme.iconButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(38), dp(38))
      setOnClickListener { hide() }
    }

    val avatar = TextView(context).apply {
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTypeface(typeface, Typeface.BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      layoutParams = LinearLayout.LayoutParams(dp(40), dp(40)).also {
        it.marginStart = dp(6)
      }
    }
    avatarView = avatar

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

    bar.addView(back)
    bar.addView(avatar)
    bar.addView(body)

    val wrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      )
    }
    wrap.addView(bar)
    wrap.addView(divider)
    return wrap
  }

  private fun buildMessagesArea(c: OverlayChatTheme.Palette): View {
    val outer = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(c.bg)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        0,
        1f,
      )
    }

    val hint = TextView(context).apply {
      text = "Vuốt tin sang để trả lời · Nhấn giữ để tùy chọn"
      gravity = Gravity.CENTER
      setTextColor(c.textFaint)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setPadding(dp(12), dp(6), dp(12), dp(2))
    }

    statusView = TextView(context).apply {
      gravity = Gravity.CENTER
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      setPadding(dp(12), dp(8), dp(12), dp(8))
      text = "Đang tải tin nhắn…"
    }

    scrollView = ScrollView(context).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        0,
        1f,
      )
      isVerticalScrollBarEnabled = false
    }
    messagesWrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(4), dp(12), dp(12))
    }
    scrollView?.addView(
      messagesWrap,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
      ),
    )

    outer.addView(hint)
    outer.addView(statusView)
    outer.addView(scrollView)
    return outer
  }

  private fun buildComposer(c: OverlayChatTheme.Palette): View {
    val wrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(c.bgElevated)
    }
    val topLine = View(context).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        1,
      )
      setBackgroundColor(c.border)
    }
    wrap.addView(topLine)

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
      layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).also {
        it.bottomMargin = dp(4)
      }
      alpha = 0.45f
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

    val emoji = TextView(context).apply {
      text = "☺"
      gravity = Gravity.CENTER
      setTextColor(c.textFaint)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      layoutParams = LinearLayout.LayoutParams(dp(36), dp(44))
      alpha = 0.55f
    }

    inputWrap.addView(inputView)
    inputWrap.addView(emoji)

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

  private fun applyHeader() {
    val c = colors()
    titleView?.text = title
    subtitleView?.text = if (isDirect) "Trực tiếp" else "Nhóm chat · realtime"
    avatarView?.apply {
      text = OverlayChatTheme.initials(title)
      background = OverlayChatTheme.circleBg(OverlayChatTheme.avatarColor(title), ::dp)
    }
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
      if (!msg.isMine) lastSenderId = msg.userId
      else lastSenderId = null
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
      val av = TextView(context).apply {
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
      }
      row.addView(av)
    } else if (isGroupChat && !msg.isMine) {
      row.addView(View(context).apply {
        layoutParams = LinearLayout.LayoutParams(dp(42), 1)
      })
    }

    val col = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = if (msg.isMine) Gravity.END else Gravity.START
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      )
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
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      )
    }

    bubbleCol.addView(TextView(context).apply {
      text = msg.text
      setTextColor(if (msg.isMine) Color.WHITE else c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      setLineSpacing(0f, 1.05f)
      maxWidth = maxBubbleW
    })

    if (msg.createdAtMs > 0L) {
      bubbleCol.addView(TextView(context).apply {
        text = formatTime(msg.createdAtMs)
        setTextColor(if (msg.isMine) Color.argb(170, 255, 255, 255) else c.textFaint)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setPadding(0, dp(4), 0, 0)
      })
    }

    col.addView(bubbleCol)
    row.addView(col)
    return row
  }

  private fun sendCurrentDraft() {
    val text = inputView?.text?.toString()?.trim().orEmpty()
    if (text.isBlank() || groupId.isBlank()) return
    inputView?.setText("")
    hideKeyboard()
    val gid = groupId
    messages.add(
      BubbleChatApi.ChatMessage(
        id = "pending-${System.currentTimeMillis()}",
        userId = myUserId(),
        sender = "Bạn",
        text = text,
        isMine = true,
        createdAtMs = System.currentTimeMillis(),
      ),
    )
    statusView?.visibility = View.GONE
    renderMessages()
    Thread {
      val ok = BubbleChatApi.sendMessage(context, gid, text)
      handler.post {
        if (!ok && gid == groupId) {
          statusView?.visibility = View.VISIBLE
          statusView?.text = "Gửi thất bại — thử lại"
        } else if (ok && gid == groupId) {
          loadConversationAsync()
        }
      }
    }.start()
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

  private fun hideKeyboard() {
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    inputView?.let { imm?.hideSoftInputFromWindow(it.windowToken, 0) }
  }

  private fun overlayType(): Int {
    return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
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
