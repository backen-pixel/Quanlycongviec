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
) {
  private val handler = Handler(Looper.getMainLooper())
  private var panelRoot: FrameLayout? = null
  private var columnRoot: LinearLayout? = null
  private var messagesWrap: LinearLayout? = null
  private var scrollView: ScrollView? = null
  private var inputView: EditText? = null
  private var sendButton: TextView? = null
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
  private var avatarView: TextView? = null
  private var composerWrap: LinearLayout? = null
  private var popupLayer: FrameLayout? = null
  private var panelParams: WindowManager.LayoutParams? = null
  private var groupId = ""
  private var title = ""
  private var isDirect = true
  private var isGroupChat = false
  private val messages = ArrayList<BubbleChatApi.ChatMessage>()
  private var basePanelHeight = 0
  private var panelTopReserve = 0
  private var keyboardLiftPx = 0
  private var suspendedForPicker = false
  private var suspendedForCompose = false

  private val quickReactions = arrayOf("👍", "❤️", "😂", "😮", "😢", "🙏")

  /** Panel còn tồn tại (kể cả đang ẩn tạm cho compose/picker). */
  fun isAlive(): Boolean = panelRoot != null

  /** Panel đang gắn WindowManager và nhìn thấy được. */
  fun isVisibleOnScreen(): Boolean = isAlive() && !suspendedForPicker && !suspendedForCompose

  /** @deprecated dùng isVisibleOnScreen — giữ cho Service cũ nếu cần. */
  fun isShowing(): Boolean = isVisibleOnScreen()

  fun show(groupId: String, title: String, topReservePx: Int = 0) {
    if (groupId.isBlank()) return
    this.groupId = groupId
    this.title = title.ifBlank { "Chat" }
    if (panelRoot != null) {
      applyPanelTop(topReservePx)
      applyHeader()
      loadConversationAsync()
      BubbleMediaBridge.registerPanel(this)
      BubbleComposeBridge.registerPanel(this)
      ensurePanelAttached(force = true)
      return
    }
    buildPanel(topReservePx)
    loadConversationAsync()
    BubbleChatApi.markRead(context, groupId)
    BubbleMediaBridge.registerPanel(this)
    BubbleComposeBridge.registerPanel(this)
  }

  /** Ẩn overlay hoàn toàn khi mở picker hệ thống (Google Photos, camera…). */
  fun prepareForExternalPicker() {
    if (suspendedForPicker || suspendedForCompose) return
    hidePopups()
    hideKeyboard()
    val root = panelRoot ?: return
    try {
      windowManager.removeView(root)
      suspendedForPicker = true
    } catch (_: Exception) { }
  }

  fun suspendForExternalPicker() = prepareForExternalPicker()

  fun resumeAfterExternalPicker() {
    val wasSuspended = suspendedForPicker
    suspendedForPicker = false
    if (!wasSuspended) {
      ensurePanelAttached()
      return
    }
    if (suspendedForCompose || BubbleComposeBridge.isComposeOpen()) return
    restorePanelAfterPicker()
  }

  private fun restorePanelAfterPicker() {
    fun attempt() {
      if (suspendedForPicker || suspendedForCompose) return
      panelRoot?.visibility = View.VISIBLE
      ensurePanelAttached(force = true)
      applyKeyboardLift()
      scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
    }
    attempt()
    handler.postDelayed({ attempt() }, 120)
    handler.postDelayed({ attempt() }, 350)
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

  fun hide() {
    hidePopups()
    hideKeyboard()
    BubbleComposeBridge.dismissComposeIfOpen()
    BubbleMediaBridge.registerPanel(null)
    BubbleComposeBridge.registerPanel(null)
    keyboardListener?.let { listener ->
      panelRoot?.viewTreeObserver?.removeOnGlobalLayoutListener(listener)
    }
    keyboardListener = null
    panelRoot?.let {
      try { windowManager.removeView(it) } catch (_: Exception) { }
    }
    panelRoot = null
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

  fun appendIncoming(sender: String, text: String) {
    if (!isAlive()) return
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
      if (isVisibleOnScreen()) renderMessages()
    }
  }

  private fun buildPanel(topReservePx: Int) {
    val c = colors()
    val dm = context.resources.displayMetrics
    val panelW = dm.widthPixels
    val topReserve = resolveTopReserve(topReservePx)
    val panelH = (dm.heightPixels - topReserve).coerceAtLeast((dm.heightPixels * 0.55f).toInt())

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
    columnRoot = column

    column.addView(buildHeader(c))
    column.addView(buildMessagesArea(c))
    column.addView(buildComposer(c))

    val popup = FrameLayout(context).apply {
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      visibility = View.GONE
    }
    popupLayer = popup

    root.addView(column)
    root.addView(popup)

    val params = WindowManager.LayoutParams(
      panelW,
      panelH,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      android.graphics.PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.BOTTOM
    // Không dùng ADJUST_RESIZE — tự đẩy panel lên bằng params.y (tránh panel bị co mất composer).
    params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING

    panelTopReserve = resolveTopReserve(topReservePx)
    basePanelHeight = panelH
    windowManager.addView(root, params)
    panelRoot = root
    panelParams = params
    installKeyboardWatcher(root)
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

    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM
      setPadding(dp(12), dp(10), dp(12), dp(12))
    }

    bar.addView(TextView(context).apply {
      text = "+"
      gravity = Gravity.CENTER
      setTextColor(c.accent)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      setTypeface(typeface, Typeface.BOLD)
      background = OverlayChatTheme.plusButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).also { it.bottomMargin = dp(4) }
      setOnClickListener { showAttachSheet() }
    })

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
      isFocusable = true
      isFocusableInTouchMode = true
      isClickable = true
      setPadding(0, dp(11), 0, dp(11))
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      )
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
        if (hasFocus) {
          if (keyboardLiftPx <= 0) {
            keyboardLiftPx = (context.resources.displayMetrics.heightPixels * 0.36f).toInt()
            applyKeyboardLift()
          }
        } else if (!inputView?.text.isNullOrEmpty()) {
          // giữ lift nếu vẫn có nội dung — tránh nhảy layout
        } else {
          handler.postDelayed({
            if (inputView?.hasFocus() != true) {
              keyboardLiftPx = 0
              applyKeyboardLift()
            }
          }, 120)
        }
      }
    }
    inputWrap.addView(inputView)
    bar.addView(inputWrap)

    sendButton = TextView(context).apply {
      text = "➤"
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      background = OverlayChatTheme.sendButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
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
    val popup = popupLayer ?: return
    val c = colors()
    popup.removeAllViews()
    popup.visibility = View.VISIBLE
    popup.setOnClickListener { hidePopups() }

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
    addOpt("🖼 Thư viện ảnh", BubbleMediaBridge.MODE_GALLERY)
    addOpt("🎬 Thư viện video", BubbleMediaBridge.MODE_VIDEO)
    addOpt("📎 Tệp tin", BubbleMediaBridge.MODE_FILE)
    addOpt("📷 Chụp ảnh", BubbleMediaBridge.MODE_CAMERA)
    addOpt("🎥 Quay video", BubbleMediaBridge.MODE_RECORD)

    val lp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.BOTTOM,
    )
    popup.addView(sheet, lp)
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
      val isImage = f.mime.startsWith("image/", ignoreCase = true)
      if (isImage) {
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
          try { setImageURI(f.uri) } catch (_: Exception) { }
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
      alpha = if (canSend) 1f else 0.45f
      isEnabled = canSend
      background = if (canSend) {
        OverlayChatTheme.sendButtonBg(c, ::dp)
      } else {
        OverlayChatTheme.roundedRect(c.inputBg, 24, ::dp, c.border)
      }
    }
  }

  private fun sendDraft() {
    if (sending || groupId.isBlank()) return
    val text = inputView?.text?.toString()?.trim().orEmpty()
    val files = pendingFiles.toList()
    if (text.isBlank() && files.isEmpty()) return

    sending = true
    updateSendButton()
    hideKeyboard()

    val gid = groupId
    val rid = replyToId
    Thread {
      val ok = if (files.isNotEmpty()) {
        BubbleChatApi.uploadWithFiles(context, gid, files, text, rid)
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
          loadConversationAsync()
        } else {
          updateSendButton()
          inputView?.error = "Gửi thất bại"
        }
      }
    }.start()
  }

  private fun showKeyboard() {
    val input = inputView ?: return
    input.requestFocus()
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    imm?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
  }

  private fun hideKeyboard() {
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    inputView?.let { imm?.hideSoftInputFromWindow(it.windowToken, 0) }
    keyboardLiftPx = 0
    applyKeyboardLift()
  }

  /** Đẩy panel lên trên bàn phím — giữ composer luôn nhìn thấy, không thu nhỏ overlay. */
  private fun applyKeyboardLift() {
    val root = panelRoot ?: return
    val params = panelParams ?: return
    if (suspendedForPicker || suspendedForCompose) return

    val dm = context.resources.displayMetrics
    val screenH = dm.heightPixels
    val lift = keyboardLiftPx.coerceAtLeast(0)
    val availH = (screenH - lift - panelTopReserve).coerceAtLeast(dp(240))
    val targetH = basePanelHeight.coerceAtMost(availH)
    val changed = params.y != lift || params.height != targetH
    if (!changed) return
    params.y = lift
    params.height = targetH
    try { windowManager.updateViewLayout(root, params) } catch (_: Exception) { }
    scrollView?.post { scrollView?.fullScroll(View.FOCUS_DOWN) }
  }

  private fun installKeyboardWatcher(root: FrameLayout) {
    val dm = context.resources.displayMetrics
    keyboardListener = ViewTreeObserver.OnGlobalLayoutListener {
      if (suspendedForPicker || suspendedForCompose) return@OnGlobalLayoutListener
      val rect = Rect()
      root.getWindowVisibleDisplayFrame(rect)
      val screenH = dm.heightPixels
      val keyboardH = (screenH - rect.bottom).coerceAtLeast(0)
      keyboardLiftPx = if (keyboardH > screenH * 0.12) keyboardH else 0
      applyKeyboardLift()
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

  private fun applyPanelTop(topReservePx: Int) {
    val root = panelRoot ?: return
    val params = panelParams ?: return
    val dm = context.resources.displayMetrics
    panelTopReserve = resolveTopReserve(topReservePx)
    val panelH = (dm.heightPixels - panelTopReserve).coerceAtLeast((dm.heightPixels * 0.55f).toInt())
    basePanelHeight = panelH
    keyboardLiftPx = 0
    params.y = 0
    params.height = panelH
    try { windowManager.updateViewLayout(root, params) } catch (_: Exception) { }
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
