package vn.tubeppro.crmobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Khung chat NỔI vẽ bằng native View — mirror UI của MessengerGroupChatScreen.
 *
 * Bố cục dọc:
 *  - Hàng bubble nhỏ (chọn conversation đang stack)
 *  - Header (avatar + tên + nút thu/đóng)
 *  - Danh sách tin (bubble trái cho người khác, bubble phải xanh cho mình,
 *    date separator khi đổi ngày, ảnh/video preview, reaction badge)
 *  - Hàng quick reactions (6 emoji)
 *  - Input bar (media icons + EditText + nút gửi)
 *
 * Long-press 1 bubble tin → popup 6 emoji để react (toggle, optimistic).
 */
class ExpandedChatPanel(
  private val ctx: Context,
  private val service: OverlayBubbleService,
) {
  private var root: View? = null
  private var msgContainer: LinearLayout? = null
  private var msgScroll: ScrollView? = null
  private var headerAvatar: ImageView? = null
  private var headerTitle: TextView? = null
  private var bubbleRow: LinearLayout? = null
  private var input: EditText? = null
  private var currentKey: String? = null
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  private val quickEmojis = listOf("❤️", "👍", "😆", "😮", "😢", "🙏")

  // Palette giống MessengerGroupChatScreen (CHAT_BG, BUBBLE_ME, BUBBLE_OTHER)
  private val colorChatBg = Color.parseColor("#EAE6DF")
  private val colorBubbleMe = Color.parseColor("#005CE8")
  private val colorBubbleOther = Color.parseColor("#FFFFFF")
  private val colorTextMe = Color.WHITE
  private val colorTextOther = Color.parseColor("#111827")

  // Màu băm cho avatar người khác — copy từ JS (hashStringToColor)
  private val palette = intArrayOf(
    Color.parseColor("#EF4444"),
    Color.parseColor("#F97316"),
    Color.parseColor("#F59E0B"),
    Color.parseColor("#10B981"),
    Color.parseColor("#06B6D4"),
    Color.parseColor("#3B82F6"),
    Color.parseColor("#6366F1"),
    Color.parseColor("#8B5CF6"),
    Color.parseColor("#EC4899"),
    Color.parseColor("#14B8A6"),
  )

  fun isShowing(): Boolean = root != null
  fun currentKey(): String? = currentKey

  fun show(wm: WindowManager, key: String) {
    val entry = BubbleStackStore.load(ctx).find { it.key == key }
      ?: BubbleStackStore.load(ctx).lastOrNull()
      ?: return
    if (root != null) {
      switchTo(entry.key)
      return
    }
    currentKey = entry.key
    val v = build(entry)
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      0, 0,
      overlayType(),
      WindowManager.LayoutParams.FLAG_DIM_BEHIND or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
      PixelFormat.TRANSLUCENT,
    ).apply {
      dimAmount = 0.55f
      gravity = Gravity.TOP or Gravity.START
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
        WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
    }
    try {
      wm.addView(v, params)
      root = v
      renderMessages()
    } catch (_: Throwable) {
      root = null
      currentKey = null
    }
  }

  fun hide(wm: WindowManager) {
    val v = root ?: return
    try { wm.removeView(v) } catch (_: Throwable) {}
    root = null
    msgContainer = null
    msgScroll = null
    headerAvatar = null
    headerTitle = null
    bubbleRow = null
    input = null
    currentKey = null
  }

  fun switchTo(key: String) {
    val entry = BubbleStackStore.load(ctx).find { it.key == key } ?: return
    currentKey = entry.key
    headerTitle?.text = entry.title
    headerAvatar?.let { loadAvatar(it, entry.avatarUrl, entry.letter, colorBubbleMe) }
    refreshBubbleRow()
    renderMessages()
  }

  fun onIncoming(key: String) {
    if (key == currentKey) renderMessages(scrollToBottom = true)
    refreshBubbleRow()
  }

  fun refreshBubbleRow() {
    val row = bubbleRow ?: return
    row.removeAllViews()
    val entries = BubbleStackStore.load(ctx).asReversed()
    for (e in entries) addBubbleAvatar(row, e)
  }

  private fun renderMessages(scrollToBottom: Boolean = true) {
    val key = currentKey ?: return
    val container = msgContainer ?: return
    container.removeAllViews()
    val msgs = ConversationCache.list(ctx, key)
    if (msgs.isEmpty()) {
      container.addView(emptyState())
    } else {
      var lastDay: String? = null
      for (m in msgs) {
        val day = dayKey(m.ts)
        if (day != lastDay) {
          container.addView(dateSeparator(m.ts))
          lastDay = day
        }
        container.addView(buildMessageRow(m))
      }
    }
    if (scrollToBottom) {
      msgScroll?.post { msgScroll?.fullScroll(View.FOCUS_DOWN) }
    }
  }

  // ---------- Builders ----------

  private fun build(entry: BubbleStackStore.Entry): View {
    val scrim = object : FrameLayout(ctx) {
      override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_OUTSIDE) {
          service.collapsePanel()
          return true
        }
        return super.onTouchEvent(event)
      }
    }.apply {
      setOnClickListener { service.collapsePanel() }
      isClickable = true
    }

    val column = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      val topInset = statusBarHeight()
      setPadding(dp(8), topInset + dp(8), dp(8), dp(8))
    }

    val rowScroll = HorizontalScrollView(ctx).apply { isHorizontalScrollBarEnabled = false }
    val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
    rowScroll.addView(row, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
    ))
    column.addView(rowScroll, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { bottomMargin = dp(8) })
    bubbleRow = row

    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(Color.WHITE)
        cornerRadius = dp(20).toFloat()
      }
      elevation = dp(10).toFloat()
      isClickable = true
      clipToOutline = true
    }
    card.addView(buildHeader(entry))
    card.addView(buildDivider())

    msgScroll = ScrollView(ctx).apply {
      isFillViewport = true
      setBackgroundColor(colorChatBg)
    }
    msgContainer = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(10), dp(10), dp(10), dp(10))
    }
    msgScroll!!.addView(msgContainer, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
    ))
    card.addView(msgScroll, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f,
    ))

    card.addView(buildQuickReactions())
    card.addView(buildInputBar(entry))

    column.addView(card, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f,
    ))

    scrim.addView(column, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    ))
    refreshBubbleRow()
    return scrim
  }

  private fun buildHeader(entry: BubbleStackStore.Entry): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(12), dp(10), dp(8), dp(10))
      gravity = Gravity.CENTER_VERTICAL
    }
    val av = ImageView(ctx).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      clipToOutline = true
    }
    val avSize = dp(36)
    row.addView(av, LinearLayout.LayoutParams(avSize, avSize).apply { rightMargin = dp(10) })
    headerAvatar = av
    loadAvatar(av, entry.avatarUrl, entry.letter, colorBubbleMe)

    val title = TextView(ctx).apply {
      text = entry.title
      setTextColor(Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      typeface = Typeface.DEFAULT_BOLD
      maxLines = 1
    }
    row.addView(title, LinearLayout.LayoutParams(0,
      LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    headerTitle = title

    row.addView(circleBtn("−", 0xFF374151.toInt()) { service.collapsePanel() })
    row.addView(circleBtn("×", 0xFFEF4444.toInt()) {
      val k = currentKey ?: return@circleBtn
      service.dismissBubbleAndPanel(k)
    })
    return row
  }

  private fun buildDivider(): View = View(ctx).apply {
    setBackgroundColor(Color.parseColor("#E5E7EB"))
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
  }

  private fun buildQuickReactions(): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(8), dp(6), dp(8), dp(6))
      setBackgroundColor(Color.parseColor("#F9FAFB"))
      gravity = Gravity.CENTER_VERTICAL
    }
    for (emo in quickEmojis) {
      row.addView(TextView(ctx).apply {
        text = emo
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        setPadding(dp(8), dp(2), dp(8), dp(2))
        setOnClickListener { sendCurrent(emo) }
      })
    }
    return row
  }

  private fun buildInputBar(entry: BubbleStackStore.Entry): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(8), dp(8), dp(8), dp(10))
      setBackgroundColor(Color.WHITE)
      gravity = Gravity.CENTER_VERTICAL
    }
    row.addView(mediaIconBtn("📷") { service.openInAppAndCollapse(entry.key) })
    row.addView(mediaIconBtn("🖼") { service.openInAppAndCollapse(entry.key) })
    row.addView(mediaIconBtn("🎙") { service.openInAppAndCollapse(entry.key) })

    val edit = EditText(ctx).apply {
      hint = "Trả lời…"
      setTextColor(Color.parseColor("#111827"))
      setHintTextColor(Color.parseColor("#9CA3AF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#F3F4F6"))
        cornerRadius = dp(20).toFloat()
      }
      inputType = InputType.TYPE_CLASS_TEXT or
        InputType.TYPE_TEXT_FLAG_MULTI_LINE or
        InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      maxLines = 4
      setPadding(dp(12), dp(8), dp(12), dp(8))
      imeOptions = EditorInfo.IME_ACTION_SEND
      setOnEditorActionListener { _, actionId, _ ->
        if (actionId == EditorInfo.IME_ACTION_SEND) {
          sendCurrent(text.toString())
          true
        } else false
      }
    }
    input = edit
    val editLp = LinearLayout.LayoutParams(0,
      LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
      leftMargin = dp(4); rightMargin = dp(4)
    }
    row.addView(edit, editLp)

    val send = TextView(ctx).apply {
      text = "➤"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(colorBubbleMe)
      }
      val size = dp(40)
      layoutParams = LinearLayout.LayoutParams(size, size)
      setOnClickListener { sendCurrent(edit.text.toString()) }
    }
    row.addView(send)
    return row
  }

  private fun sendCurrent(text: String) {
    val key = currentKey ?: return
    val content = text.trim()
    if (content.isEmpty()) return
    val myId = ctx.getSharedPreferences("crm_floating_bubble_prefs", Context.MODE_PRIVATE)
      .getString(FloatingBubbleModule.KEY_CURRENT_USER_ID, "") ?: ""
    ConversationCache.append(
      ctx, key,
      ConversationCache.Msg(
        id = "local-${System.currentTimeMillis()}",
        sender = "Bạn",
        senderId = myId,
        text = content,
        avatar = null,
        ts = System.currentTimeMillis(),
        messageType = "text",
        attachmentUrl = null,
        attachmentMime = null,
        reactions = emptyList(),
        mine = true,
      ),
    )
    onIncoming(key)
    input?.setText("")
    MessageSender.sendText(ctx, key, content) { ok ->
      if (!ok) Toast.makeText(ctx, "Không gửi được tin", Toast.LENGTH_SHORT).show()
    }
  }

  private fun mediaIconBtn(label: String, onClick: () -> Unit): View {
    return TextView(ctx).apply {
      text = label
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      setPadding(dp(8), dp(8), dp(8), dp(8))
      setOnClickListener { onClick() }
    }
  }

  // ---------- Message bubble (mine vs others) ----------

  private fun buildMessageRow(m: ConversationCache.Msg): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = if (m.mine) Gravity.RIGHT or Gravity.TOP else Gravity.LEFT or Gravity.TOP
      setPadding(0, dp(4), 0, dp(4))
    }

    if (!m.mine) {
      val avatarSize = dp(32)
      val av = ImageView(ctx).apply {
        scaleType = ImageView.ScaleType.CENTER_CROP
        clipToOutline = true
      }
      row.addView(av, LinearLayout.LayoutParams(avatarSize, avatarSize).apply {
        rightMargin = dp(6); topMargin = dp(14)
      })
      loadAvatar(av, m.avatar, m.sender.firstLetter(), colorForName(m.sender))
    }

    val col = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
    val maxW = (ctx.resources.displayMetrics.widthPixels * 0.72f).toInt()

    if (!m.mine && m.sender.isNotBlank()) {
      col.addView(TextView(ctx).apply {
        text = m.sender
        setTextColor(Color.parseColor("#6B7280"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setPadding(dp(6), 0, dp(6), dp(2))
      })
    }

    val bubble = buildBubble(m, maxW)
    col.addView(bubble)

    // Reactions badge dưới bubble
    val reactBadge = buildReactionsBadge(m)
    if (reactBadge != null) {
      col.addView(reactBadge, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply {
        topMargin = dp(-6)
        gravity = if (m.mine) Gravity.RIGHT else Gravity.LEFT
      })
    }

    col.addView(TextView(ctx).apply {
      text = formatTs(m.ts)
      setTextColor(Color.parseColor("#9CA3AF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
      gravity = if (m.mine) Gravity.RIGHT else Gravity.LEFT
      setPadding(dp(4), dp(2), dp(4), 0)
    }, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ))

    row.addView(col, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply {
      if (!m.mine) rightMargin = dp(40) else leftMargin = dp(40)
    })
    return row
  }

  private fun buildBubble(m: ConversationCache.Msg, maxW: Int): View {
    val bgColor = if (m.mine) colorBubbleMe else colorBubbleOther
    val textColor = if (m.mine) colorTextMe else colorTextOther
    val container = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(bgColor)
        cornerRadius = dp(16).toFloat()
        if (!m.mine) setStroke(1, Color.parseColor("#E5E7EB"))
      }
      setPadding(dp(10), dp(7), dp(10), dp(8))
    }

    when (m.messageType) {
      "image" -> attachImageView(container, m, textColor)
      "video" -> attachVideoStub(container, m, textColor)
      "audio", "voice" -> attachAudioStub(container, m, textColor)
      "file" -> attachFileStub(container, m, textColor)
      else -> {
        if (m.text.isNotBlank()) {
          container.addView(TextView(ctx).apply {
            text = m.text
            setTextColor(textColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
          }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
          ).apply { /* width auto */ })
        }
      }
    }

    container.maxWidth = maxW
    // Long-press → popup reactions
    container.setOnLongClickListener {
      it.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      showReactionPicker(it, m)
      true
    }
    return container
  }

  private fun attachImageView(parent: LinearLayout, m: ConversationCache.Msg, fallbackTextColor: Int) {
    val w = dp(200); val h = dp(150)
    val iv = ImageView(ctx).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#D1D5DB"))
        cornerRadius = dp(10).toFloat()
      }
      clipToOutline = true
      setOnClickListener {
        currentKey?.let { service.openInAppAndCollapse(it) }
      }
    }
    parent.addView(iv, LinearLayout.LayoutParams(w, h))
    val url = m.attachmentUrl
    if (!url.isNullOrBlank()) loadAvatar(iv, url, "", Color.parseColor("#9CA3AF"), circular = false)
    if (m.text.isNotBlank()) {
      parent.addView(TextView(ctx).apply {
        text = m.text
        setTextColor(fallbackTextColor)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        setPadding(0, dp(6), 0, 0)
      })
    }
  }

  private fun attachVideoStub(parent: LinearLayout, m: ConversationCache.Msg, color: Int) {
    parent.addView(stubAttachment("▶  Video", color))
    parent.setOnClickListener { currentKey?.let { service.openInAppAndCollapse(it) } }
  }

  private fun attachAudioStub(parent: LinearLayout, m: ConversationCache.Msg, color: Int) {
    parent.addView(stubAttachment("🎙  Ghi âm", color))
    parent.setOnClickListener { currentKey?.let { service.openInAppAndCollapse(it) } }
  }

  private fun attachFileStub(parent: LinearLayout, m: ConversationCache.Msg, color: Int) {
    val label = m.attachmentUrl?.substringAfterLast('/') ?: "Tệp đính kèm"
    parent.addView(stubAttachment("📎  $label", color))
    parent.setOnClickListener { currentKey?.let { service.openInAppAndCollapse(it) } }
  }

  private fun stubAttachment(label: String, color: Int): TextView = TextView(ctx).apply {
    text = label
    setTextColor(color)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    typeface = Typeface.DEFAULT_BOLD
  }

  private fun buildReactionsBadge(m: ConversationCache.Msg): View? {
    if (m.reactions.isEmpty()) return null
    // Group by emoji
    val counts = LinkedHashMap<String, Int>()
    val myId = ctx.getSharedPreferences("crm_floating_bubble_prefs", Context.MODE_PRIVATE)
      .getString(FloatingBubbleModule.KEY_CURRENT_USER_ID, "") ?: ""
    val mineEmojis = HashSet<String>()
    for (r in m.reactions) {
      counts[r.emoji] = (counts[r.emoji] ?: 0) + 1
      if (r.userId.isNotBlank() && r.userId == myId) mineEmojis.add(r.emoji)
    }
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      background = GradientDrawable().apply {
        setColor(Color.WHITE)
        cornerRadius = dp(12).toFloat()
        setStroke(1, Color.parseColor("#E5E7EB"))
      }
      setPadding(dp(6), dp(2), dp(6), dp(2))
    }
    for ((emo, count) in counts) {
      val mine = mineEmojis.contains(emo)
      val tv = TextView(ctx).apply {
        text = if (count > 1) "$emo $count" else emo
        setTextColor(if (mine) colorBubbleMe else Color.parseColor("#374151"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        typeface = if (mine) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        setPadding(dp(2), 0, dp(4), 0)
        setOnClickListener {
          reactToMessage(m.id, emo)
        }
      }
      row.addView(tv)
    }
    return row
  }

  private fun showReactionPicker(anchor: View, m: ConversationCache.Msg) {
    if (m.id.isBlank()) return
    val container = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      background = GradientDrawable().apply {
        setColor(Color.WHITE)
        cornerRadius = dp(28).toFloat()
        setStroke(1, Color.parseColor("#E5E7EB"))
      }
      elevation = dp(6).toFloat()
      setPadding(dp(8), dp(6), dp(8), dp(6))
    }
    val popup = PopupWindow(
      container,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      true,
    ).apply {
      isOutsideTouchable = true
      isFocusable = true
    }
    for (emo in quickEmojis) {
      container.addView(TextView(ctx).apply {
        text = emo
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f)
        setPadding(dp(8), dp(2), dp(8), dp(2))
        setOnClickListener {
          popup.dismiss()
          reactToMessage(m.id, emo)
        }
      })
    }
    val loc = IntArray(2)
    anchor.getLocationOnScreen(loc)
    val xOff = if (m.mine) -dp(80) else 0
    popup.showAtLocation(anchor, Gravity.NO_GRAVITY, loc[0] + xOff, loc[1] - dp(56))
  }

  private fun reactToMessage(messageId: String, emoji: String) {
    val key = currentKey ?: return
    if (messageId.isBlank()) return
    val myId = ctx.getSharedPreferences("crm_floating_bubble_prefs", Context.MODE_PRIVATE)
      .getString(FloatingBubbleModule.KEY_CURRENT_USER_ID, "") ?: ""
    // Optimistic toggle
    val cur = ConversationCache.list(ctx, key).toMutableList()
    val idx = cur.indexOfFirst { it.id == messageId }
    if (idx >= 0) {
      val m = cur[idx]
      val existing = m.reactions.toMutableList()
      val mineIdx = existing.indexOfFirst { it.emoji == emoji && it.userId == myId }
      if (mineIdx >= 0) existing.removeAt(mineIdx)
      else existing.add(ConversationCache.Reaction(emoji, myId))
      ConversationCache.updateReactions(ctx, key, messageId, existing)
      renderMessages(scrollToBottom = false)
    }
    MessageSender.react(ctx, key, messageId, emoji) { rx ->
      if (rx != null) {
        ConversationCache.updateReactions(ctx, key, messageId, rx)
        renderMessages(scrollToBottom = false)
      }
    }
  }

  private fun emptyState(): View = TextView(ctx).apply {
    text = "Chưa có tin nhắn gần đây.\nKhi có tin mới, sẽ hiện ở đây."
    setTextColor(Color.parseColor("#9CA3AF"))
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    gravity = Gravity.CENTER
    setPadding(dp(20), dp(40), dp(20), dp(40))
  }

  private fun dateSeparator(ts: Long): View {
    return TextView(ctx).apply {
      text = formatDateLabel(ts)
      setTextColor(Color.parseColor("#6B7280"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, dp(8))
    }
  }

  private fun addBubbleAvatar(row: LinearLayout, entry: BubbleStackStore.Entry) {
    val size = dp(44)
    val active = entry.key == currentKey
    val container = FrameLayout(ctx).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(colorBubbleMe)
        setStroke(
          if (active) dp(3) else dp(2),
          if (active) Color.parseColor("#FFD400") else Color.WHITE,
        )
      }
      setOnClickListener { service.switchPanelTo(entry.key) }
    }
    val img = ImageView(ctx).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      clipToOutline = true
    }
    container.addView(img, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    ).apply {
      val pad = dp(3)
      setMargins(pad, pad, pad, pad)
    })
    loadAvatar(img, entry.avatarUrl, entry.letter, colorBubbleMe)
    row.addView(container, LinearLayout.LayoutParams(size, size).apply { rightMargin = dp(6) })
  }

  private fun circleBtn(label: String, color: Int, onClick: () -> Unit): View {
    val size = dp(32)
    return TextView(ctx).apply {
      text = label
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
      }
      layoutParams = LinearLayout.LayoutParams(size, size).apply { leftMargin = dp(6) }
      setOnClickListener { onClick() }
    }
  }

  // ---------- Avatar loader (cache LRU) ----------

  private fun loadAvatar(
    target: ImageView,
    url: String?,
    letter: String,
    fallbackColor: Int,
    circular: Boolean = true,
  ) {
    target.setImageDrawable(letterDrawable(letter.ifBlank { "?" }, fallbackColor, circular))
    if (url.isNullOrBlank()) return
    AvatarCache.get(url)?.let {
      target.setImageBitmap(it)
      return
    }
    io.execute {
      val bmp = fetchBitmap(url)
      if (bmp == null) {
        android.util.Log.w("BubblePanel", "avatar fetch failed: $url")
        return@execute
      }
      AvatarCache.put(url, bmp)
      main.post { target.setImageBitmap(bmp) }
    }
  }

  private fun fetchBitmap(url: String): Bitmap? = try {
    val token = ctx.getSharedPreferences("crm_floating_bubble_prefs", Context.MODE_PRIVATE)
      .getString(FloatingBubbleModule.KEY_AUTH_TOKEN, null)
    val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
    conn.connectTimeout = 8000
    conn.readTimeout = 10000
    conn.instanceFollowRedirects = true
    if (!token.isNullOrBlank()) conn.setRequestProperty("Authorization", "Bearer $token")
    conn.inputStream.use { BitmapFactory.decodeStream(it) }
  } catch (_: Throwable) { null }

  private fun letterDrawable(letter: String, color: Int, circular: Boolean): Drawable {
    return object : Drawable() {
      private val bg = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
      }
      private val txt = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        this.color = Color.WHITE
        textAlign = android.graphics.Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
      }
      override fun draw(canvas: android.graphics.Canvas) {
        val w = bounds.width().toFloat()
        val h = bounds.height().toFloat()
        if (circular) {
          val r = minOf(w, h) / 2f
          canvas.drawCircle(w / 2f, h / 2f, r, bg)
        } else {
          canvas.drawRect(0f, 0f, w, h, bg)
        }
        txt.textSize = minOf(w, h) * 0.42f
        val fm = txt.fontMetrics
        canvas.drawText(letter, w / 2f, h / 2f - (fm.ascent + fm.descent) / 2f, txt)
      }
      override fun setAlpha(a: Int) {}
      override fun setColorFilter(cf: android.graphics.ColorFilter?) {}
      @Suppress("DEPRECATION")
      override fun getOpacity(): Int = PixelFormat.OPAQUE
    }
  }

  // ---------- Helpers ----------

  private fun String.firstLetter(): String = trim().firstOrNull()?.uppercase() ?: "?"

  private fun colorForName(name: String): Int {
    if (name.isBlank()) return palette[0]
    val h = name.fold(0) { acc, c -> (acc * 31 + c.code) and 0x7FFFFFFF }
    return palette[h % palette.size]
  }

  private fun dp(v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), ctx.resources.displayMetrics).toInt()

  private fun statusBarHeight(): Int {
    val id = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) ctx.resources.getDimensionPixelSize(id) else dp(24)
  }

  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  private fun formatTs(ts: Long): String {
    if (ts <= 0) return ""
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(ts))
  }

  private fun dayKey(ts: Long): String {
    val cal = Calendar.getInstance().apply { timeInMillis = ts }
    return "${cal.get(Calendar.YEAR)}-${cal.get(Calendar.DAY_OF_YEAR)}"
  }

  private fun formatDateLabel(ts: Long): String {
    val today = Calendar.getInstance()
    val that = Calendar.getInstance().apply { timeInMillis = ts }
    val sameDay = today.get(Calendar.YEAR) == that.get(Calendar.YEAR) &&
      today.get(Calendar.DAY_OF_YEAR) == that.get(Calendar.DAY_OF_YEAR)
    if (sameDay) return "Hôm nay"
    today.add(Calendar.DAY_OF_YEAR, -1)
    val yesterday = today.get(Calendar.YEAR) == that.get(Calendar.YEAR) &&
      today.get(Calendar.DAY_OF_YEAR) == that.get(Calendar.DAY_OF_YEAR)
    if (yesterday) return "Hôm qua"
    return SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date(ts))
  }
}

/** Helper extension: maxWidth cho LinearLayout — đặt max width khi tin nhắn quá dài. */
private var LinearLayout.maxWidth: Int
  get() = (layoutParams?.width ?: ViewGroup.LayoutParams.WRAP_CONTENT)
  set(value) {
    val lp = layoutParams ?: ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.width = value
    layoutParams = lp
  }
