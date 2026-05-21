package vn.tubeppro.crmobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Khung chat NỔI vẽ bằng native View.
 * Bao gồm: hàng bubble nhỏ → header → list tin → quick reactions → input + media + send.
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
  private val cachedBitmaps = ConcurrentHashMap<String, Bitmap>()
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  private val quickEmojis = listOf("❤️", "👍", "😆", "😮", "😢", "🙏")

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
      // KHÔNG dùng FLAG_NOT_FOCUSABLE → EditText có thể nhận bàn phím.
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
    headerAvatar?.let { loadAvatar(it, entry.avatarUrl, entry.letter) }
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
      for (m in msgs) container.addView(buildMessageRow(m))
    }
    if (scrollToBottom) {
      msgScroll?.post { msgScroll?.fullScroll(View.FOCUS_DOWN) }
    }
  }

  // ---------- Builders ----------

  private fun build(entry: BubbleStackStore.Entry): View {
    val scrim = object : FrameLayout(ctx) {
      override fun onTouchEvent(event: android.view.MotionEvent): Boolean {
        if (event.action == android.view.MotionEvent.ACTION_OUTSIDE) {
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

    // Bubble row (avatar nhỏ — biết ai đã nhắn tới)
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

    // Card
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
      setBackgroundColor(Color.parseColor("#F4F6FA"))
    }
    msgContainer = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(10), dp(12), dp(10))
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
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#0068FF"))
      }
      scaleType = ImageView.ScaleType.CENTER_CROP
      clipToOutline = true
    }
    val avSize = dp(36)
    row.addView(av, LinearLayout.LayoutParams(avSize, avSize).apply { rightMargin = dp(10) })
    headerAvatar = av
    loadAvatar(av, entry.avatarUrl, entry.letter)

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
    layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, 1,
    )
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

    // Nhóm icon media (mở app để xử lý upload)
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
        setColor(Color.parseColor("#0068FF"))
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
    // Optimistic: hiện ngay
    ConversationCache.append(
      ctx, key,
      ConversationCache.Msg(
        sender = "Bạn",
        text = content,
        avatar = null,
        ts = System.currentTimeMillis(),
      ),
    )
    onIncoming(key)
    input?.setText("")
    MessageSender.sendText(ctx, key, content) { ok ->
      if (!ok) {
        Toast.makeText(ctx, "Không gửi được tin", Toast.LENGTH_SHORT).show()
      }
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

  private fun buildMessageRow(m: ConversationCache.Msg): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.TOP
      setPadding(0, dp(4), 0, dp(4))
    }
    val avatarSize = dp(28)
    val av = ImageView(ctx).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#0068FF"))
      }
      scaleType = ImageView.ScaleType.CENTER_CROP
      clipToOutline = true
    }
    row.addView(av, LinearLayout.LayoutParams(avatarSize, avatarSize).apply { rightMargin = dp(8) })
    loadAvatar(av, m.avatar, m.sender.take(1))

    val col = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
    col.addView(TextView(ctx).apply {
      text = m.sender
      setTextColor(Color.parseColor("#111827"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      typeface = Typeface.DEFAULT_BOLD
    })
    col.addView(TextView(ctx).apply {
      text = m.text
      setTextColor(Color.parseColor("#1F2937"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(dp(10), dp(7), dp(10), dp(8))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#FFFFFF"))
        cornerRadius = dp(14).toFloat()
        setStroke(1, Color.parseColor("#E5E7EB"))
      }
    }, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(2) })
    col.addView(TextView(ctx).apply {
      text = formatTs(m.ts)
      setTextColor(Color.parseColor("#9CA3AF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
    }, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(2) })
    row.addView(col, LinearLayout.LayoutParams(0,
      LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    return row
  }

  private fun emptyState(): View = TextView(ctx).apply {
    text = "Chưa có tin nhắn gần đây.\nKhi có tin mới, sẽ hiện ở đây."
    setTextColor(Color.parseColor("#9CA3AF"))
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    gravity = Gravity.CENTER
    setPadding(dp(20), dp(40), dp(20), dp(40))
  }

  private fun addBubbleAvatar(row: LinearLayout, entry: BubbleStackStore.Entry) {
    val size = dp(44)
    val active = entry.key == currentKey
    val container = FrameLayout(ctx).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#0068FF"))
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
    loadAvatar(img, entry.avatarUrl, entry.letter)
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

  // ---------- Avatar loader ----------

  private fun loadAvatar(target: ImageView, url: String?, letter: String) {
    target.setImageDrawable(letterDrawable(letter.ifBlank { "?" }))
    if (url.isNullOrBlank()) return
    cachedBitmaps[url]?.let {
      target.setImageBitmap(it)
      return
    }
    io.execute {
      val bmp = fetchBitmap(url) ?: return@execute
      cachedBitmaps[url] = bmp
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

  private fun letterDrawable(letter: String): android.graphics.drawable.Drawable {
    return object : android.graphics.drawable.Drawable() {
      private val bg = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#0068FF")
      }
      private val txt = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = android.graphics.Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
      }
      override fun draw(canvas: android.graphics.Canvas) {
        val w = bounds.width().toFloat()
        val h = bounds.height().toFloat()
        val r = minOf(w, h) / 2f
        canvas.drawCircle(w / 2f, h / 2f, r, bg)
        txt.textSize = r * 0.95f
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
}
