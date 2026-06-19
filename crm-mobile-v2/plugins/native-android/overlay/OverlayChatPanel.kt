package vn.tubeppro.crmobilev2.overlay

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
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
import kotlin.math.min

/**
 * Panel chat nổi trên app khác — không mở MainActivity.
 */
class OverlayChatPanel(
  private val context: Context,
  private val windowManager: WindowManager,
  private val onClosed: () -> Unit,
) {
  private val handler = Handler(Looper.getMainLooper())
  private var panelRoot: FrameLayout? = null
  private var panelParams: WindowManager.LayoutParams? = null
  private var messagesWrap: LinearLayout? = null
  private var scrollView: ScrollView? = null
  private var inputView: EditText? = null
  private var statusView: TextView? = null
  private var groupId = ""
  private var title = ""
  private val messages = ArrayList<BubbleChatApi.ChatMessage>()

  fun isShowing(): Boolean = panelRoot != null

  fun show(groupId: String, title: String) {
    if (groupId.isBlank()) return
    this.groupId = groupId
    this.title = title.ifBlank { "Chat" }
    if (panelRoot != null) {
      refreshHeader()
      loadMessagesAsync()
      return
    }
    buildPanel()
    loadMessagesAsync()
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
    panelParams = null
    messagesWrap = null
    scrollView = null
    inputView = null
    statusView = null
    messages.clear()
    onClosed()
  }

  fun seedMessages(json: String) {
    if (!isShowing()) return
    val myId = context.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .getString("user_id", null)?.trim().orEmpty()
    val parsed = BubbleChatApi.parseMessagesFromSeed(json, myId)
    if (parsed.isEmpty()) return
    handler.post {
      messages.clear()
      messages.addAll(parsed)
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
    val dm = context.resources.displayMetrics
    val panelW = min((dm.widthPixels * 0.92f).toInt(), dp(360))
    val panelH = (dm.heightPixels * 0.58f).toInt().coerceAtLeast(dp(320))

    val root = FrameLayout(context)
    val cardBg = GradientDrawable()
    cardBg.cornerRadius = dp(16).toFloat()
    cardBg.setColor(Color.WHITE)
    cardBg.setStroke(dp(1), Color.parseColor("#226C5CE7"))
    root.background = cardBg
    root.elevation = dp(12).toFloat()
    root.isFocusable = true
    root.isFocusableInTouchMode = true

    val column = LinearLayout(context)
    column.orientation = LinearLayout.VERTICAL
    column.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )

    column.addView(buildHeader())
    column.addView(buildMessagesArea())
    column.addView(buildComposer())

    root.addView(column)

    val params = WindowManager.LayoutParams(
      panelW,
      panelH,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      android.graphics.PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.CENTER
    params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE

    windowManager.addView(root, params)
    panelRoot = root
    panelParams = params
  }

  private fun buildHeader(): View {
    val bar = LinearLayout(context)
    bar.orientation = LinearLayout.HORIZONTAL
    bar.gravity = Gravity.CENTER_VERTICAL
    bar.setPadding(dp(12), dp(10), dp(8), dp(8))
    bar.setBackgroundColor(Color.parseColor("#6C5CE7"))

    val titleTv = TextView(context)
    titleTv.setTextColor(Color.WHITE)
    titleTv.setTypeface(titleTv.typeface, Typeface.BOLD)
    titleTv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    titleTv.maxLines = 1
    titleTv.text = title
    titleTv.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)

    val close = TextView(context)
    close.text = "✕"
    close.setTextColor(Color.WHITE)
    close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
    close.setPadding(dp(10), dp(4), dp(10), dp(4))
    close.setOnClickListener { hide() }

    bar.addView(titleTv)
    bar.addView(close)
    return bar
  }

  private fun buildMessagesArea(): View {
    val wrap = LinearLayout(context)
    wrap.orientation = LinearLayout.VERTICAL
    wrap.layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      0,
      1f,
    )

    statusView = TextView(context).apply {
      setTextColor(Color.parseColor("#64748B"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setPadding(dp(12), dp(6), dp(12), dp(4))
      text = "Đang tải…"
    }
    wrap.addView(statusView)

    scrollView = ScrollView(context).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        0,
        1f,
      )
      isVerticalScrollBarEnabled = true
    }
    messagesWrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(10), dp(4), dp(10), dp(8))
    }
    scrollView?.addView(
      messagesWrap,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
      ),
    )
    wrap.addView(scrollView)
    return wrap
  }

  private fun buildComposer(): View {
    val row = LinearLayout(context)
    row.orientation = LinearLayout.HORIZONTAL
    row.gravity = Gravity.CENTER_VERTICAL
    row.setPadding(dp(8), dp(6), dp(8), dp(8))
    row.setBackgroundColor(Color.parseColor("#F8FAFC"))

    val input = EditText(context)
    input.hint = "Nhập tin nhắn…"
    input.setTextColor(Color.parseColor("#1E293B"))
    input.setHintTextColor(Color.parseColor("#94A3B8"))
    input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    input.maxLines = 3
    input.setPadding(dp(12), dp(10), dp(12), dp(10))
    val inputBg = GradientDrawable()
    inputBg.cornerRadius = dp(20).toFloat()
    inputBg.setColor(Color.WHITE)
    inputBg.setStroke(dp(1), Color.parseColor("#CBD5E1"))
    input.background = inputBg
    input.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    inputView = input

    val send = TextView(context)
    send.text = "Gửi"
    send.setTextColor(Color.WHITE)
    send.setTypeface(send.typeface, Typeface.BOLD)
    send.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    send.gravity = Gravity.CENTER
    val sendBg = GradientDrawable()
    sendBg.cornerRadius = dp(18).toFloat()
    sendBg.setColor(Color.parseColor("#6C5CE7"))
    send.background = sendBg
    send.setPadding(dp(14), dp(10), dp(14), dp(10))
    val sendLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    )
    sendLp.marginStart = dp(8)
    send.layoutParams = sendLp
    send.setOnClickListener { sendCurrentDraft() }

    row.addView(input)
    row.addView(send)
    return row
  }

  private fun refreshHeader() {
    panelRoot?.findViewWithTag<TextView>("panel_title")?.text = title
  }

  private fun loadMessagesAsync() {
    statusView?.text = "Đang tải…"
    val gid = groupId
    Thread {
      val rows = BubbleChatApi.fetchMessages(context, gid)
      handler.post {
        if (gid != groupId || panelRoot == null) return@post
        if (rows.isEmpty()) {
          statusView?.text = "Chưa có tin nhắn — gõ bên dưới để bắt đầu"
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
    wrap.removeAllViews()
    for (msg in messages) {
      wrap.addView(buildMessageRow(msg))
    }
    scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
  }

  private fun buildMessageRow(msg: BubbleChatApi.ChatMessage): View {
    val row = LinearLayout(context)
    row.orientation = LinearLayout.VERTICAL
    row.setPadding(dp(4), dp(3), dp(4), dp(3))
    row.gravity = if (msg.isMine) Gravity.END else Gravity.START

    if (!msg.isMine && msg.sender.isNotBlank()) {
      val name = TextView(context)
      name.text = msg.sender
      name.setTextColor(Color.parseColor("#64748B"))
      name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
      row.addView(name)
    }

    val bubble = TextView(context)
    bubble.text = msg.text
    bubble.setTextColor(if (msg.isMine) Color.WHITE else Color.parseColor("#1E293B"))
    bubble.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    bubble.setPadding(dp(10), dp(7), dp(10), dp(7))
    val bg = GradientDrawable()
    bg.cornerRadius = dp(14).toFloat()
    bg.setColor(if (msg.isMine) Color.parseColor("#6C5CE7") else Color.parseColor("#EEF2FF"))
    bubble.background = bg
    val lp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    )
    lp.gravity = if (msg.isMine) Gravity.END else Gravity.START
    bubble.layoutParams = lp
    row.addView(bubble)
    return row
  }

  private fun sendCurrentDraft() {
    val text = inputView?.text?.toString()?.trim().orEmpty()
    if (text.isBlank() || groupId.isBlank()) return
    inputView?.setText("")
    hideKeyboard()
    val gid = groupId
    val optimistic = BubbleChatApi.ChatMessage(
      id = "pending-${System.currentTimeMillis()}",
      userId = "",
      sender = "Bạn",
      text = text,
      isMine = true,
    )
    messages.add(optimistic)
    statusView?.visibility = View.GONE
    renderMessages()
    Thread {
      val ok = BubbleChatApi.sendMessage(context, gid, text)
      handler.post {
        if (!ok && gid == groupId) {
          statusView?.visibility = View.VISIBLE
          statusView?.text = "Gửi thất bại — thử lại"
        } else if (ok && gid == groupId) {
          loadMessagesAsync()
        }
      }
    }.start()
  }

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
