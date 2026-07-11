package vn.tubeppro.vcmobile.overlay

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
 * Panel chat overlay — tr? l?i, c?m xúc, g?i file/?nh/video/ch?p/quay.
 */
class OverlayChatPanel(
  private val context: Context,
  private val windowManager: WindowManager,
  private val onClosed: () -> Unit,
  private val onExpand: (groupId: String, title: String) -> Unit = { _, _ -> },
  private val onStartCall: (groupId: String, title: String, media: String) -> Unit = { _, _, _ -> },
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

  private val quickReactions = arrayOf("??", "??", "??", "??", "??", "??")

  /** Panel còn t?n t?i (k? c? dang ?n t?m cho compose/picker). */
  fun isAlive(): Boolean = panelRoot != null

  /** Panel dang g?n WindowManager và nhìn th?y du?c. */
  fun isVisibleOnScreen(): Boolean = isAlive() && !suspendedForPicker && !suspendedForCompose

  /** @deprecated dùng isVisibleOnScreen — gi? cho Service cu n?u c?n. */
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

  /** ?n panel t?m (không removeView) d? picker không b? che. */
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

  /** ?n overlay khi m? Activity so?n tin (bàn phím adjustResize). */
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

  /** G?n l?i panel n?u b? orphan sau picker/compose. */
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
    stopKeyboardPolling()
    pickerBackupParams = null
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

  fun appendIncoming(sender: String, text: String, messageId: String? = null) {
    if (!isAlive()) return
    handler.post {
      val body = normalizeMsgText(text)
      if (body.isBlank()) return@post
      val candidate = BubbleChatApi.ChatMessage(
        id = messageId?.takeIf { it.isNotBlank() } ?: "local-${System.currentTimeMillis()}",
        userId = "",
        sender = sender.ifBlank { "Tin nh?n" },
        text = body,
        isMine = false,
      )
      if (messages.any { isNearDuplicate(it, candidate) }) return@post
      messages.add(candidate)
      if (messages.size > 80) messages.removeAt(0)
      if (isVisibleOnScreen()) renderMessages()
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
      setBackgroundColor(Color.argb(110, 0, 0, 0))
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      setOnClickListener { hide() }
    }
    scrimView = scrim
    root.addView(scrim)

    val sheetBg = OverlayChatTheme.roundedRect(c.bgElevated, 18, ::dp, c.border)
    sheetBg.cornerRadii = floatArrayOf(
      dp(18).toFloat(), dp(18).toFloat(),
      dp(18).toFloat(), dp(18).toFloat(),
      0f, 0f, 0f, 0f,
    )

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
      text = "?"
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
      hint = "Nh?n tin..."
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
    bar.addView(inputWrap)

    sendButton = TextView(context).apply {
      text = "?"
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
      text = "?"
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
    fun headerBtn(icon: String, onClick: () -> Unit): TextView {
      return TextView(context).apply {
        text = icon
        gravity = Gravity.CENTER
        setTextColor(c.textMuted)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
        background = OverlayChatTheme.iconButtonBg(c, ::dp)
        layoutParams = LinearLayout.LayoutParams(dp(38), dp(38)).also { it.marginStart = dp(4) }
        setOnClickListener { onClick() }
      }
    }
    val callAudio = headerBtn("??") {
      val gid = groupId
      val t = title
      if (gid.isNotBlank()) onStartCall(gid, t, "audio")
    }
    val callVideo = headerBtn("??") {
      val gid = groupId
      val t = title
      if (gid.isNotBlank()) onStartCall(gid, t, "video")
    }
    val expand = TextView(context).apply {
      text = "?"
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
    bar.addView(callAudio)
    bar.addView(callVideo)
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
      text = "Ðang t?i tin nh?n…"
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
      if (!replyToSender.isNullOrBlank()) "Tr? l?i $replyToSender" else "Tr? l?i"
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
    addOpt("?? Thu vi?n ?nh (nhi?u)", BubbleMediaBridge.MODE_GALLERY)
    addOpt("?? Thu vi?n video", BubbleMediaBridge.MODE_VIDEO)
    addOpt("?? T?p tin", BubbleMediaBridge.MODE_FILE)
    addOpt("?? Ch?p ?nh", BubbleMediaBridge.MODE_CAMERA)
    addOpt("?? Quay video", BubbleMediaBridge.MODE_RECORD)

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
          text = "?"
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
          text = "?? ${f.name.take(16)}"
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
          inputView?.error = "G?i th?t b?i"
        }
      }
    }.start()
  }

  /** Ðóng bàn phím và b? focus ô nh?p sau khi g?i xong. */
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

  /** U?c lu?ng chi?u cao bàn phím — overlay không luôn nh?n WindowInsets. */
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

  /** Ð?y sheet chat lên trên bàn phím. */
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

    card.addView(actionBtn(c, "? Tr? l?i") {
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
    val maxBubbleW = (panelRoot?.width?.takeIf { it > 0 } ?: context.resources.displayMetrics.widthPixels) * 0.78f
    wrap.removeAllViews()
    var lastSenderKey: String? = null
    for (msg in messages) {
      val senderKey = senderKey(msg)
      val showAvatar = shouldShowMessageAvatars() && !msg.isMine && senderKey != lastSenderKey
      val showSenderName = shouldShowMessageAvatars() && !msg.isMine && senderKey != lastSenderKey
      wrap.addView(buildMessageRow(msg, c, maxBubbleW.toInt(), showAvatar, showSenderName))
      if (!msg.isMine) lastSenderKey = senderKey else lastSenderKey = null
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
    } else if (shouldShowMessageAvatars() && !msg.isMine) {
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

    appendMediaToBubble(bubbleCol, msg, c, maxBubbleW)

    val caption = mediaCaption(msg)
    if (caption.isNotBlank()) {
      bubbleCol.addView(textView(caption, msg.isMine, c, maxBubbleW))
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

  private fun senderKey(msg: BubbleChatApi.ChatMessage): String {
    return msg.userId.ifBlank { msg.sender }.trim().ifBlank { msg.sender }
  }

  /** Hi?n avatar/tên khi có =2 ngu?i tham gia chat (k? c? mình). */
  private fun shouldShowMessageAvatars(): Boolean {
    if (isDirect) return false
    val senders = messages.map { senderKey(it) }.distinct()
    return senders.size >= 2
  }

  private fun isPlaceholderMediaText(text: String): Boolean {
    val t = text.trim()
    if (t.isBlank() || t.equals("null", ignoreCase = true)) return true
    return t.startsWith("??") || t.startsWith("??") || t.startsWith("??") ||
      t.startsWith("??") || t.contains("Hình ?nh", true) || t.contains("Video", true) ||
      t.contains("dính kèm", true) || t.contains("T?p", true)
  }

  /** Ch? hi?n caption khi tin có dính kèm và content không ph?i placeholder. */
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
          text = "?"
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
        val name = att.name?.take(40) ?: msg.attachmentName?.take(40) ?: "T?p dính kèm"
        bubbleCol.addView(TextView(context).apply {
          text = "?? $name"
          setTextColor(if (msg.isMine) Color.WHITE else c.text)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
          setPadding(dp(4), dp(4), dp(4), dp(4))
          layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
          ).also {
            if (addGap) it.bottomMargin = dp(4)
          }
        })
      }
    }
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

  private fun loadConversationAsync() {
    val seq = ++loadSeq
    val gid = groupId
    val hadMessages = messages.isNotEmpty()
    if (!hadMessages) {
      statusView?.visibility = View.VISIBLE
      statusView?.text = "Ðang t?i tin nh?n…"
    }
    Thread {
      val meta = BubbleChatApi.fetchGroupMeta(context, gid)
      val rows = BubbleChatApi.fetchMessages(context, gid)
      handler.post {
        if (seq != loadSeq || gid != groupId || panelRoot == null) return@post
        if (meta != null) {
          title = meta.name.ifBlank { title }
          isDirect = meta.isDirect
          isGroupChat = !meta.isDirect
        }
        applyHeader()
        if (rows.isEmpty()) {
          statusView?.visibility = View.VISIBLE
          statusView?.text = "Chua có tin nh?n"
        } else {
          statusView?.visibility = View.GONE
        }
        messages.clear()
        messages.addAll(dedupeMessages(rows))
        renderMessages()
      }
    }.start()
  }

  private fun applyHeader() {
    val c = colors()
    titleView?.text = title
    subtitleView?.text = if (isDirect) "Tr?c ti?p" else "Nhóm chat · realtime"
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
