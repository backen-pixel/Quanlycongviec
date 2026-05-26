package vn.tubeppro.crmobile

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Khung chat NỔI vẽ bằng native View — mirror chi tiết style với
 * [MessengerGroupChatScreen.tsx] và [LeadChatPanel.tsx]:
 *  - MESSENGER style: bong bóng xanh/đỏ, avatar 30dp, time trong bubble, max-width 72%
 *  - LEAD style:      bong bóng bo nhỏ hơn, không avatar, max-width 88%, system pill amber
 *
 * Hỗ trợ: date separator, reply chip, image/audio attachment, long-press reaction picker,
 * tap reaction badge → toggle.
 */
class ExpandedChatPanel(
  private val ctx: Context,
  private val service: OverlayBubbleService,
) {
  enum class ChatStyle { MESSENGER, LEAD }

  private var root: View? = null
  private var msgContainer: LinearLayout? = null
  private var msgScroll: ScrollView? = null
  private var headerAvatar: ImageView? = null
  private var headerTitle: TextView? = null
  private var bubbleRow: LinearLayout? = null
  private var input: EditText? = null
  private var replyChipBar: LinearLayout? = null
  /** Drawer ảnh inline hiện dưới composer (giống "media drawer" của Messenger). */
  private var mediaDrawer: FrameLayout? = null
  private var mediaDrawerOpen: Boolean = false
  private var currentKey: String? = null
  private var replyTo: ConversationCache.Msg? = null
  private var reactionPopup: PopupWindow? = null

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
    replyTo = null
    val v = build(entry)
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      0, 0,
      overlayType(),
      // FLAG_LAYOUT_NO_LIMITS + manual IME inset handling: overlay window không tự resize
      // khi bàn phím xuất hiện. Dùng OnApplyWindowInsetsListener để padding bottom theo IME.
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
      v.isFocusableInTouchMode = true
      v.requestFocus()
      v.setOnKeyListener { _, code, ev ->
        if (code == android.view.KeyEvent.KEYCODE_BACK && ev.action == android.view.KeyEvent.ACTION_UP) {
          if (reactionPopup?.isShowing == true) {
            reactionPopup?.dismiss()
          } else {
            service.collapsePanel()
          }
          true
        } else false
      }
      attachKeyboardInsetHandler(v)
      renderMessages()
    } catch (_: Throwable) {
      root = null
      currentKey = null
    }
  }

  /**
   * Overlay window KHÔNG được Android tự co lại khi bàn phím bật.
   * Cách xử lý: lắng nghe WindowInsets — khi IME visible thì đẩy `column` lên
   * (bằng cách thêm bottom padding = chiều cao IME). Cuộn list xuống đáy.
   *
   * Có fallback bằng GlobalLayoutListener so sánh `visibleDisplayFrame` cho Android < 11
   * khi WindowInsets API không trả đúng IME inset.
   */
  private fun attachKeyboardInsetHandler(root: View) {
    val column = (root as? FrameLayout)?.getChildAt(0) as? LinearLayout ?: return
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      val imeBottom = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom
      val sysBars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()).bottom
      val pad = maxOf(0, imeBottom - sysBars)
      if (column.paddingBottom != pad) {
        column.setPadding(column.paddingLeft, column.paddingTop, column.paddingRight, pad)
        if (imeBottom > 0) msgScroll?.post { msgScroll?.fullScroll(View.FOCUS_DOWN) }
      }
      insets
    }
    // Fallback: polling visibleDisplayFrame mỗi khi layout đổi.
    val rect = android.graphics.Rect()
    root.viewTreeObserver.addOnGlobalLayoutListener {
      try {
        root.getWindowVisibleDisplayFrame(rect)
        val screenH = root.height
        val keypadH = screenH - rect.bottom
        // Nếu API insets đã set padding rồi thì skip
        if (column.paddingBottom == 0 && keypadH > screenH * 0.15) {
          column.setPadding(column.paddingLeft, column.paddingTop, column.paddingRight, keypadH)
          msgScroll?.post { msgScroll?.fullScroll(View.FOCUS_DOWN) }
        } else if (column.paddingBottom != 0 && keypadH < screenH * 0.10) {
          column.setPadding(column.paddingLeft, column.paddingTop, column.paddingRight, 0)
        }
      } catch (_: Throwable) {}
    }
  }

  fun hide(wm: WindowManager) {
    reactionPopup?.dismiss()
    reactionPopup = null
    val v = root ?: return
    try { wm.removeView(v) } catch (_: Throwable) {}
    root = null
    msgContainer = null
    msgScroll = null
    headerAvatar = null
    headerTitle = null
    bubbleRow = null
    input = null
    replyChipBar = null
    mediaDrawer = null
    mediaDrawerOpen = false
    currentKey = null
    replyTo = null
  }

  fun switchTo(key: String) {
    val entry = BubbleStackStore.load(ctx).find { it.key == key } ?: return
    currentKey = entry.key
    replyTo = null
    refreshReplyChip()
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

  private fun chatStyleFor(key: String?): ChatStyle =
    if (key?.startsWith("lead:") == true) ChatStyle.LEAD else ChatStyle.MESSENGER

  private fun renderMessages(scrollToBottom: Boolean = true) {
    val key = currentKey ?: return
    val container = msgContainer ?: return
    container.removeAllViews()
    val style = chatStyleFor(key)
    container.setBackgroundColor(if (style == ChatStyle.MESSENGER) Color.parseColor("#EAE6DF") else Color.parseColor("#F4F6FA"))
    val msgs = ConversationCache.list(ctx, key)
    if (msgs.isEmpty()) {
      container.addView(emptyState())
    } else {
      val myId = readMyUserId()
      var lastDayKey = ""
      for (m in msgs) {
        val dayKey = dayKeyOf(m.ts)
        if (dayKey != lastDayKey) {
          container.addView(buildDateSeparator(m.ts, style))
          lastDayKey = dayKey
        }
        val isSystem = m.sender == "Hệ thống" || m.userId.isNullOrBlank() && m.text.startsWith("[")
        if (isSystem && style == ChatStyle.LEAD) {
          container.addView(buildSystemPill(m))
          continue
        }
        if (isSystem && style == ChatStyle.MESSENGER) {
          container.addView(buildSystemItalic(m))
          continue
        }
        val mine = !myId.isNullOrBlank() && m.userId == myId
        container.addView(buildMessageRow(m, mine, style))
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

    card.addView(buildQuickReactionsBar())
    card.addView(buildReplyChipBar())
    card.addView(buildInputBar(entry))
    // Inline media drawer (ẩn mặc định, mở ra khi tap nút 🖼) — chiếm chỗ vùng
    // bàn phím giống Messenger sticker/photo drawer.
    val drawer = FrameLayout(ctx).apply {
      setBackgroundColor(Color.parseColor("#FFFFFF"))
      visibility = View.GONE
    }
    mediaDrawer = drawer
    card.addView(
      drawer,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(260),
      ),
    )

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

  private fun buildQuickReactionsBar(): View {
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

  private fun buildReplyChipBar(): View {
    val bar = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(10), dp(0), dp(10), dp(0))
      setBackgroundColor(Color.WHITE)
      visibility = View.GONE
      gravity = Gravity.CENTER_VERTICAL
    }
    replyChipBar = bar
    return bar
  }

  private fun refreshReplyChip() {
    val bar = replyChipBar ?: return
    val r = replyTo
    bar.removeAllViews()
    if (r == null) {
      bar.visibility = View.GONE
      return
    }
    bar.visibility = View.VISIBLE
    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(10), dp(6), dp(10), dp(6))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#EFF6FF"))
        cornerRadius = dp(6).toFloat()
      }
    }
    card.addView(TextView(ctx).apply {
      text = "↩ Trả lời ${r.sender}"
      setTextColor(Color.parseColor("#2563EB"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      typeface = Typeface.DEFAULT_BOLD
    })
    card.addView(TextView(ctx).apply {
      text = r.text
      setTextColor(Color.parseColor("#1E40AF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      maxLines = 1
      ellipsize = android.text.TextUtils.TruncateAt.END
    })
    bar.addView(card, LinearLayout.LayoutParams(0,
      LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
      topMargin = dp(4); bottomMargin = dp(4)
    })
    bar.addView(TextView(ctx).apply {
      text = "×"
      setTextColor(Color.parseColor("#64748B"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      setPadding(dp(8), dp(2), dp(8), dp(2))
      setOnClickListener {
        replyTo = null
        refreshReplyChip()
      }
    })
  }

  private fun buildInputBar(entry: BubbleStackStore.Entry): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(8), dp(8), dp(8), dp(10))
      setBackgroundColor(Color.WHITE)
      gravity = Gravity.CENTER_VERTICAL
    }

    // Media buttons:
    //  - 🖼: mở inline drawer (overlay window không thể bị che vì cùng nằm trong panel)
    //  - 📷 🎙 📎: external Activity, nhưng phải ẩn TẠM overlay trước khi launch
    //    (overlay window luôn nằm trên Activity → nếu không ẩn, picker bị che)
    fun openExternalPicker(modeName: String) {
      try {
        // Ẩn overlay (panel + bubbles) trước, Activity launch xong tự show lại.
        OverlayBubbleService.requestHideOverlay(ctx)
        BubbleMediaPickerActivity.launch(ctx, entry.key, modeName)
      } catch (e: Throwable) {
        OverlayBubbleService.requestShowOverlay(ctx)
        android.widget.Toast.makeText(
          ctx,
          "Không mở được trình chọn (${e.message ?: "lỗi"})",
          android.widget.Toast.LENGTH_SHORT,
        ).show()
      }
    }
    row.addView(mediaIconBtn("📷") { openExternalPicker("camera") })
    row.addView(mediaIconBtn("🖼") { toggleMediaDrawer(entry.key) })
    row.addView(mediaIconBtn("🎙") { openExternalPicker("audio") })
    row.addView(mediaIconBtn("📎") { openExternalPicker("file") })

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

  // ---------- Inline image drawer (giống Messenger media picker) ----------

  /** Mở/đóng drawer ảnh inline dưới composer. */
  private fun toggleMediaDrawer(bubbleKey: String) {
    val drawer = mediaDrawer ?: return
    if (mediaDrawerOpen) {
      drawer.visibility = View.GONE
      drawer.removeAllViews()
      mediaDrawerOpen = false
      return
    }
    mediaDrawerOpen = true
    drawer.removeAllViews()
    drawer.addView(buildImageDrawerContent(bubbleKey))
    drawer.visibility = View.VISIBLE
    // Ẩn bàn phím nếu đang mở (drawer thay chỗ keyboard)
    try {
      val imm = ctx.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
        as android.view.inputmethod.InputMethodManager
      input?.let { imm.hideSoftInputFromWindow(it.windowToken, 0) }
    } catch (_: Throwable) {}
  }

  private fun buildImageDrawerContent(bubbleKey: String): View {
    val container = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
      setBackgroundColor(Color.parseColor("#F8FAFC"))
    }
    // Header với tiêu đề + nút "Mở thư viện" (full picker external)
    val header = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(12), dp(8), dp(8), dp(8))
      gravity = Gravity.CENTER_VERTICAL
    }
    header.addView(TextView(ctx).apply {
      text = "Ảnh gần đây"
      setTextColor(Color.parseColor("#111827"))
      typeface = Typeface.DEFAULT_BOLD
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    })
    header.addView(TextView(ctx).apply {
      text = "Mở thư viện"
      setTextColor(Color.parseColor("#0068FF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setPadding(dp(10), dp(6), dp(10), dp(6))
      setOnClickListener {
        OverlayBubbleService.requestHideOverlay(ctx)
        BubbleMediaPickerActivity.launch(ctx, bubbleKey, "image")
        // Đóng drawer luôn
        mediaDrawer?.visibility = View.GONE
        mediaDrawer?.removeAllViews()
        mediaDrawerOpen = false
      }
    })
    container.addView(header)

    val scroll = android.widget.HorizontalScrollView(ctx).apply {
      isHorizontalScrollBarEnabled = false
    }
    val grid = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(8), 0, dp(8), dp(8))
    }
    scroll.addView(grid)
    container.addView(scroll, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.MATCH_PARENT,
    ))

    // Loading state
    val loading = TextView(ctx).apply {
      text = "Đang tải ảnh…"
      setTextColor(Color.parseColor("#6B7280"))
      setPadding(dp(12), dp(8), dp(12), dp(8))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    }
    grid.addView(loading)

    // Query MediaStore async
    Thread {
      val items = queryRecentImages(40)
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        if (mediaDrawer == null) return@post
        grid.removeAllViews()
        if (items.isEmpty()) {
          grid.addView(TextView(ctx).apply {
            text = "Không có ảnh hoặc chưa cấp quyền truy cập."
            setTextColor(Color.parseColor("#6B7280"))
            setPadding(dp(12), dp(8), dp(12), dp(8))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
          })
        } else {
          for (uri in items) grid.addView(buildThumbnail(bubbleKey, uri))
        }
      }
    }.start()

    return container
  }

  private fun buildThumbnail(bubbleKey: String, uri: android.net.Uri): View {
    val size = dp(110)
    val wrap = FrameLayout(ctx).apply {
      layoutParams = LinearLayout.LayoutParams(size, size).apply {
        rightMargin = dp(6)
      }
    }
    val iv = ImageView(ctx).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#E5E7EB"))
        cornerRadius = dp(8).toFloat()
      }
      clipToOutline = true
    }
    wrap.addView(iv, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    ))
    // Decode thumbnail async, sample down để tiết kiệm memory
    Thread {
      val bmp = decodeThumbnail(uri, 240)
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        if (bmp != null) iv.setImageBitmap(bmp)
      }
    }.start()
    wrap.setOnClickListener {
      android.widget.Toast.makeText(ctx, "Đang gửi ảnh…", android.widget.Toast.LENGTH_SHORT).show()
      BubbleChatUploader.upload(ctx, bubbleKey, uri) { ok ->
        android.widget.Toast.makeText(
          ctx,
          if (ok) "Đã gửi" else "Gửi ảnh thất bại",
          android.widget.Toast.LENGTH_SHORT,
        ).show()
      }
      // Đóng drawer ngay khi tap
      mediaDrawer?.visibility = View.GONE
      mediaDrawer?.removeAllViews()
      mediaDrawerOpen = false
    }
    return wrap
  }

  /** Query MediaStore lấy URI của [limit] ảnh gần nhất, sắp theo DATE_MODIFIED giảm dần. */
  private fun queryRecentImages(limit: Int): List<android.net.Uri> {
    val out = ArrayList<android.net.Uri>()
    val collection = android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    val projection = arrayOf(android.provider.MediaStore.Images.Media._ID)
    return try {
      ctx.contentResolver.query(
        collection,
        projection,
        null, null,
        "${android.provider.MediaStore.Images.Media.DATE_MODIFIED} DESC",
      )?.use { c ->
        val idCol = c.getColumnIndex(android.provider.MediaStore.Images.Media._ID)
        var count = 0
        while (c.moveToNext() && count < limit) {
          val id = c.getLong(idCol)
          out.add(android.content.ContentUris.withAppendedId(collection, id))
          count++
        }
      }
      out
    } catch (_: Throwable) {
      emptyList()
    }
  }

  private fun decodeThumbnail(uri: android.net.Uri, targetSize: Int): android.graphics.Bitmap? {
    return try {
      // 1) Đọc kích thước thật (inJustDecodeBounds) để tính inSampleSize
      val opts1 = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
      ctx.contentResolver.openInputStream(uri)?.use {
        android.graphics.BitmapFactory.decodeStream(it, null, opts1)
      }
      var sample = 1
      while (opts1.outWidth / sample > targetSize * 2 || opts1.outHeight / sample > targetSize * 2) {
        sample *= 2
      }
      val opts2 = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
      ctx.contentResolver.openInputStream(uri)?.use {
        android.graphics.BitmapFactory.decodeStream(it, null, opts2)
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun sendCurrent(text: String) {
    val key = currentKey ?: return
    val content = text.trim()
    if (content.isEmpty()) return
    val r = replyTo
    val optimisticTxt = if (r != null) content else content
    ConversationCache.append(
      ctx, key,
      ConversationCache.Msg(
        userId = readMyUserId(),
        sender = "Bạn",
        text = optimisticTxt,
        avatar = null,
        ts = System.currentTimeMillis(),
        replyToText = r?.text,
      ),
    )
    onIncoming(key)
    input?.setText("")
    val replyId = r?.id
    replyTo = null
    refreshReplyChip()
    MessageSender.sendText(ctx, key, content, replyId) { ok ->
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

  // ---------- Message rows ----------

  private fun buildSystemItalic(m: ConversationCache.Msg): View {
    return TextView(ctx).apply {
      text = m.text
      setTextColor(Color.parseColor("#6B7280"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      gravity = Gravity.CENTER
      setTypeface(typeface, Typeface.ITALIC)
      setPadding(dp(8), dp(6), dp(8), dp(6))
    }
  }

  private fun buildSystemPill(m: ConversationCache.Msg): View {
    val wrap = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(4), 0, dp(4))
    }
    val pill = TextView(ctx).apply {
      text = m.text
      setTextColor(Color.parseColor("#92400E"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
      setPadding(dp(10), dp(5), dp(10), dp(5))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#FEF3C7"))
        setStroke(1, Color.parseColor("#FDE68A"))
        cornerRadius = dp(12).toFloat()
      }
    }
    wrap.addView(pill)
    return wrap
  }

  private fun buildDateSeparator(ts: Long, style: ChatStyle): View {
    val wrap = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(8), 0, dp(6))
    }
    val pill = TextView(ctx).apply {
      text = formatDay(ts)
      setTextColor(Color.parseColor("#6B7280"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setPadding(dp(10), dp(3), dp(10), dp(3))
      background = GradientDrawable().apply {
        setColor(if (style == ChatStyle.MESSENGER) 0x33FFFFFF else 0xFFE5E7EB.toInt())
        cornerRadius = dp(10).toFloat()
      }
    }
    wrap.addView(pill)
    return wrap
  }

  private fun buildMessageRow(m: ConversationCache.Msg, mine: Boolean, style: ChatStyle): View {
    return when (style) {
      ChatStyle.MESSENGER -> buildMessengerRow(m, mine)
      ChatStyle.LEAD -> buildLeadRow(m, mine)
    }
  }

  private fun buildMessengerRow(m: ConversationCache.Msg, mine: Boolean): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = (if (mine) Gravity.END else Gravity.START) or Gravity.BOTTOM
      setPadding(0, dp(3), 0, dp(3))
    }
    val avSize = dp(30)
    if (!mine) {
      val av = ImageView(ctx).apply {
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(senderColor(m.userId ?: m.sender))
        }
        scaleType = ImageView.ScaleType.CENTER_CROP
        clipToOutline = true
      }
      loadAvatar(av, m.avatar, m.sender.take(1))
      row.addView(av, LinearLayout.LayoutParams(avSize, avSize).apply { rightMargin = dp(6) })
    }

    val maxBubbleW = (screenWidthPx() * 0.72f).toInt()

    val bubbleColumn = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
    }

    if (!mine && !m.userId.isNullOrBlank()) {
      bubbleColumn.addView(TextView(ctx).apply {
        text = m.sender
        setTextColor(Color.parseColor("#475569"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setPadding(dp(6), 0, dp(6), dp(2))
      })
    }

    val bubble = MaxWidthLinearLayout(ctx, maxBubbleW).apply {
      orientation = LinearLayout.VERTICAL
      background = bubbleBackground(
        bg = if (mine) Color.parseColor("#005CE8") else Color.WHITE,
        radius = 18,
        tailMine = mine,
      )
      setPadding(dp(12), dp(8), dp(12), dp(6))
    }

    val replyTxt = m.replyToText?.takeIf { it.isNotBlank() && it != "null" }
    val attUrl = m.attachmentUrl?.takeIf { it.isNotBlank() && it != "null" && it != "undefined" }
    val displayText = m.text.takeIf { it.isNotBlank() && it != "null" && it != "undefined" } ?: ""
    if (replyTxt != null) bubble.addView(buildReplyChipInBubble(replyTxt, mine))
    if (attUrl != null) bubble.addView(buildAttachmentView(m, mine))
    if (displayText.isNotBlank()) {
      bubble.addView(TextView(ctx).apply {
        text = displayText
        setTextColor(if (mine) Color.WHITE else Color.parseColor("#0F172A"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      })
    }
    val timeRow = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.END
    }
    timeRow.addView(TextView(ctx).apply {
      text = formatTs(m.ts)
      setTextColor(if (mine) 0xCCFFFFFF.toInt() else Color.parseColor("#94A3B8"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
    })
    bubble.addView(timeRow, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(2) })

    bubble.setOnLongClickListener { showMessageActionsPopup(it, m); true }
    attachSwipeToReply(bubble, m, mine)

    bubbleColumn.addView(bubble, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ))

    if (m.reactions.isNotEmpty()) {
      bubbleColumn.addView(buildReactionBadges(m, mine))
    }

    val colLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    )
    row.addView(bubbleColumn, colLp)

    if (mine) {
      // Spacer avatar to align — actually Messenger không show avatar mine; skip
    }
    return row
  }

  private fun buildLeadRow(m: ConversationCache.Msg, mine: Boolean): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = if (mine) Gravity.END else Gravity.START
      setPadding(0, dp(3), 0, dp(3))
    }
    val maxBubbleW = (screenWidthPx() * 0.88f).toInt()
    val bubbleColumn = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
    if (!mine) {
      bubbleColumn.addView(TextView(ctx).apply {
        text = m.sender
        setTextColor(Color.parseColor("#475569"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        typeface = Typeface.DEFAULT_BOLD
        setPadding(dp(2), 0, dp(2), dp(2))
      })
    }
    val bubble = MaxWidthLinearLayout(ctx, maxBubbleW).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(if (mine) Color.parseColor("#1D5BD7") else Color.WHITE)
        setStroke(1, if (mine) Color.parseColor("#164FC4") else Color.parseColor("#E2E8F0"))
        cornerRadius = dp(14).toFloat()
      }
      setPadding(dp(12), dp(8), dp(12), dp(8))
      elevation = dp(2).toFloat()
    }
    val replyTxt3 = m.replyToText?.takeIf { it.isNotBlank() && it != "null" }
    val attUrl3 = m.attachmentUrl?.takeIf { it.isNotBlank() && it != "null" && it != "undefined" }
    val displayText3 = m.text.takeIf { it.isNotBlank() && it != "null" && it != "undefined" } ?: ""
    if (replyTxt3 != null) bubble.addView(buildReplyChipInBubble(replyTxt3, mine))
    if (attUrl3 != null) bubble.addView(buildAttachmentView(m, mine))
    if (displayText3.isNotBlank()) {
      bubble.addView(TextView(ctx).apply {
        text = displayText3
        setTextColor(if (mine) Color.WHITE else Color.parseColor("#0F172A"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      })
    }
    bubble.addView(TextView(ctx).apply {
      text = formatTs(m.ts)
      setTextColor(if (mine) 0xCCFFFFFF.toInt() else Color.parseColor("#94A3B8"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
    }, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(2); gravity = Gravity.END })
    bubble.setOnLongClickListener { showMessageActionsPopup(it, m); true }
    attachSwipeToReply(bubble, m, mine)
    bubbleColumn.addView(bubble)
    if (m.reactions.isNotEmpty()) bubbleColumn.addView(buildReactionBadges(m, mine))
    row.addView(bubbleColumn)
    return row
  }

  private fun bubbleBackground(bg: Int, radius: Int, tailMine: Boolean): GradientDrawable {
    val r = dp(radius).toFloat()
    val tail = dp(4).toFloat()
    val radii = if (tailMine) {
      floatArrayOf(r, r, r, r, tail, tail, r, r)
    } else {
      floatArrayOf(r, r, r, r, r, r, tail, tail)
    }
    return GradientDrawable().apply {
      setColor(bg)
      cornerRadii = radii
      if (bg == Color.WHITE) setStroke(1, Color.parseColor("#E2E8F0"))
    }
  }

  private fun buildReplyChipInBubble(replyText: String, mine: Boolean): View {
    val wrap = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), dp(4), dp(8), dp(4))
      background = GradientDrawable().apply {
        setColor(if (mine) 0x33FFFFFF else Color.parseColor("#DBEAFE"))
        cornerRadius = dp(6).toFloat()
      }
    }
    wrap.addView(TextView(ctx).apply {
      text = "↩ Trả lời tin nhắn"
      setTextColor(if (mine) Color.WHITE else Color.parseColor("#1E40AF"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
      typeface = Typeface.DEFAULT_BOLD
    })
    wrap.addView(TextView(ctx).apply {
      text = replyText
      setTextColor(if (mine) 0xE6FFFFFF.toInt() else Color.parseColor("#1E3A8A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      maxLines = 2
      ellipsize = android.text.TextUtils.TruncateAt.END
    })
    val lp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { bottomMargin = dp(6) }
    wrap.layoutParams = lp
    return wrap
  }

  private fun buildAttachmentView(m: ConversationCache.Msg, mine: Boolean): View {
    val url = m.attachmentUrl?.takeIf { it.isNotBlank() && it != "null" && it != "undefined" }
      ?: return View(ctx).apply { layoutParams = LinearLayout.LayoutParams(0, 0) }
    val type = (m.messageType ?: "").lowercase()
    return when {
      type == "image" || url.matches(Regex(".*\\.(png|jpg|jpeg|gif|webp)(\\?.*)?$", RegexOption.IGNORE_CASE)) ->
        buildImageAttachment(url)
      type == "audio" || url.matches(Regex(".*\\.(mp3|m4a|wav|ogg)(\\?.*)?$", RegexOption.IGNORE_CASE)) ->
        buildAudioAttachment(url, mine)
      else -> buildFileAttachment(url, mine)
    }
  }

  private fun buildImageAttachment(url: String): View {
    val img = ImageView(ctx).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#E5E7EB"))
        cornerRadius = dp(8).toFloat()
      }
      clipToOutline = true
      setOnClickListener {
        try {
          val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          ctx.startActivity(i)
        } catch (_: Throwable) {}
      }
    }
    val lp = LinearLayout.LayoutParams(dp(220), dp(160)).apply { bottomMargin = dp(6) }
    img.layoutParams = lp
    // Tải hình
    cachedBitmaps[url]?.let { img.setImageBitmap(it); return img }
    io.execute {
      val bmp = fetchBitmap(url) ?: return@execute
      cachedBitmaps[url] = bmp
      main.post { img.setImageBitmap(bmp) }
    }
    return img
  }

  private fun buildAudioAttachment(@Suppress("UNUSED_PARAMETER") url: String, mine: Boolean): View {
    return TextView(ctx).apply {
      text = "🎙 Mở trong app để nghe"
      setTextColor(if (mine) Color.WHITE else Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      setPadding(dp(10), dp(6), dp(10), dp(6))
      background = GradientDrawable().apply {
        setColor(if (mine) 0x33FFFFFF else Color.parseColor("#EEF2F7"))
        cornerRadius = dp(8).toFloat()
      }
      setOnClickListener { currentKey?.let { service.openInAppAndCollapse(it) } }
    }
  }

  private fun buildFileAttachment(url: String, mine: Boolean): View {
    val name = url.substringAfterLast('/').takeIf { it.isNotBlank() && it != "null" } ?: "Tệp đính kèm"
    return TextView(ctx).apply {
      text = "📎 $name"
      setTextColor(if (mine) Color.WHITE else Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      setPadding(dp(10), dp(6), dp(10), dp(6))
      background = GradientDrawable().apply {
        setColor(if (mine) 0x33FFFFFF else Color.parseColor("#EEF2F7"))
        cornerRadius = dp(8).toFloat()
      }
      setOnClickListener {
        try {
          ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          })
        } catch (_: Throwable) {}
      }
    }
  }

  private fun buildReactionBadges(m: ConversationCache.Msg, mine: Boolean): View {
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = if (mine) Gravity.END else Gravity.START
      setPadding(0, dp(2), 0, dp(2))
    }
    // group by emoji
    val grouped = LinkedHashMap<String, Int>()
    for (r in m.reactions) grouped[r.emoji] = (grouped[r.emoji] ?: 0) + 1
    for ((emoji, count) in grouped) {
      val chip = TextView(ctx).apply {
        text = if (count > 1) "$emoji $count" else emoji
        setTextColor(Color.parseColor("#0F172A"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setPadding(dp(6), dp(2), dp(6), dp(2))
        background = GradientDrawable().apply {
          setColor(Color.parseColor("#F3F4F6"))
          setStroke(1, Color.parseColor("#E5E7EB"))
          cornerRadius = dp(10).toFloat()
        }
        setOnClickListener { toggleReaction(m, emoji) }
      }
      row.addView(chip, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { rightMargin = dp(4) })
    }
    return row
  }

  // ---------- Reactions ----------

  /**
   * Toggle reaction — **optimistic**:
   *  1. Cập nhật cache + render NGAY (hiệu ứng tức thì).
   *  2. Gọi API trong background.
   *  3. Khi API trả → ghi đè cache bằng kết quả thật, render lại.
   *  4. Nếu API fail → rollback về snapshot trước đó.
   */
  private fun toggleReaction(m: ConversationCache.Msg, emoji: String) {
    val key = currentKey ?: return
    if (!key.startsWith("lead:")) return
    val msgId = m.id ?: return
    val leadId = key.removePrefix("lead:")
    val myId = readMyUserId() ?: ""
    val before = m.reactions
    // Toggle local: nếu đã có reaction (cùng emoji + myId) → xoá, ngược lại thêm
    val mine = before.firstOrNull { it.userId == myId && it.emoji == emoji }
    val nextLocal = if (mine != null) {
      before.filterNot { it.userId == myId && it.emoji == emoji }
    } else {
      // Bỏ reaction cũ của mình cho emoji khác (theo behavior backend)
      val withoutMine = before.filterNot { it.userId == myId }
      withoutMine + ConversationCache.Reaction(emoji, myId, "Bạn")
    }
    ConversationCache.updateReactions(ctx, key, msgId, nextLocal)
    renderMessages(scrollToBottom = false)

    MessageSender.sendReaction(ctx, leadId, msgId, emoji) { reactions ->
      main.post {
        if (reactions != null) {
          ConversationCache.updateReactions(ctx, key, msgId, reactions)
          renderMessages(scrollToBottom = false)
        } else {
          // Rollback
          ConversationCache.updateReactions(ctx, key, msgId, before)
          renderMessages(scrollToBottom = false)
          Toast.makeText(ctx, "Không gửi được cảm xúc", Toast.LENGTH_SHORT).show()
        }
      }
    }
  }

  // ---------- Long-press menu (reaction + reply + copy) ----------

  /**
   * Menu hiện khi long-press 1 tin nhắn:
   *  - Hàng emoji nhanh (6 cảm xúc)
   *  - Nút "Trả lời"
   *  - Nút "Sao chép"
   */
  private fun showMessageActionsPopup(anchor: View, m: ConversationCache.Msg) {
    reactionPopup?.dismiss()
    val isLead = currentKey?.startsWith("lead:") == true
    val canReact = isLead && !m.id.isNullOrBlank()

    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(Color.WHITE)
        cornerRadius = dp(14).toFloat()
        setStroke(1, Color.parseColor("#E5E7EB"))
      }
      elevation = dp(8).toFloat()
      setPadding(dp(4), dp(4), dp(4), dp(4))
    }

    // Hàng emoji (chỉ hiện cho lead chat có id)
    if (canReact) {
      val emoRow = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(dp(4), dp(4), dp(4), dp(4))
      }
      for (emo in quickEmojis) {
        emoRow.addView(TextView(ctx).apply {
          text = emo
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
          setPadding(dp(8), dp(4), dp(8), dp(4))
          setOnClickListener {
            toggleReaction(m, emo)
            reactionPopup?.dismiss()
          }
        })
      }
      card.addView(emoRow)
      card.addView(View(ctx).apply {
        setBackgroundColor(Color.parseColor("#E5E7EB"))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
      })
    }

    fun item(label: String, onClick: () -> Unit) = TextView(ctx).apply {
      text = label
      setTextColor(Color.parseColor("#0F172A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(dp(14), dp(10), dp(28), dp(10))
      setOnClickListener { onClick(); reactionPopup?.dismiss() }
    }

    val replyableText = m.text.takeIf { it.isNotBlank() && it != "null" } ?: m.messageType ?: ""
    card.addView(item("↩  Trả lời") {
      replyTo = m
      refreshReplyChip()
      input?.requestFocus()
    })
    if (replyableText.isNotBlank()) {
      card.addView(item("📋  Sao chép") {
        try {
          val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
          cm.setPrimaryClip(android.content.ClipData.newPlainText("message", replyableText))
          Toast.makeText(ctx, "Đã sao chép", Toast.LENGTH_SHORT).show()
        } catch (_: Throwable) {}
      })
    }

    val popup = PopupWindow(card,
      android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
      android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
      true)
    popup.isOutsideTouchable = true
    popup.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
    reactionPopup = popup
    val loc = IntArray(2)
    anchor.getLocationOnScreen(loc)
    val yOffset = if (canReact) dp(70) else dp(50)
    try {
      popup.showAtLocation(anchor, Gravity.NO_GRAVITY, loc[0], loc[1] - yOffset)
    } catch (_: Throwable) {}
  }

  // ---------- Swipe to reply (vuốt ngang để trả lời như Messenger) ----------

  private fun attachSwipeToReply(bubble: View, m: ConversationCache.Msg, mine: Boolean) {
    val threshold = dp(60).toFloat()
    val maxOffset = dp(80).toFloat()
    val direction = if (mine) -1f else 1f // mine vuốt trái, other vuốt phải
    var startX = 0f
    var startY = 0f
    var swiping = false
    var triggered = false
    bubble.setOnTouchListener { v, e ->
      when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          startX = e.rawX; startY = e.rawY
          swiping = false; triggered = false
          false
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - startX
          val dy = e.rawY - startY
          if (!swiping && abs(dx) > dp(10) && abs(dx) > abs(dy) * 1.2f && dx * direction > 0) {
            swiping = true
            v.parent?.requestDisallowInterceptTouchEvent(true)
          }
          if (swiping) {
            val capped = (dx).coerceIn(-maxOffset, maxOffset)
            v.translationX = capped
            if (!triggered && abs(capped) >= threshold) {
              triggered = true
              vibrateLight()
            } else if (triggered && abs(capped) < threshold) {
              triggered = false
            }
            true
          } else false
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (swiping) {
            val accept = triggered
            v.animate().translationX(0f).setDuration(180).start()
            swiping = false; triggered = false
            if (accept) {
              replyTo = m
              refreshReplyChip()
              input?.requestFocus()
            }
            true
          } else false
        }
        else -> false
      }
    }
  }

  private fun vibrateLight() {
    try {
      val vib = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator ?: return
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        vib.vibrate(android.os.VibrationEffect.createOneShot(15, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION") vib.vibrate(15)
      }
    } catch (_: Throwable) {}
  }

  // ---------- UI helpers ----------

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

  /**
   * Set ảnh avatar dạng HÌNH TRÒN — không phụ thuộc `clipToOutline` (nhiều OEM
   * Android render đường outline lệch hoặc bỏ qua khiến avatar méo). Dùng
   * [circularBitmapDrawable] tự vẽ bằng `BitmapShader` → tròn 100% trên mọi máy.
   */
  private fun loadAvatar(target: ImageView, url: String?, letter: String) {
    target.scaleType = ImageView.ScaleType.FIT_XY
    target.setImageDrawable(letterDrawable(letter.ifBlank { "?" }, senderColor(letter)))
    if (url.isNullOrBlank()) return
    cachedBitmaps[url]?.let {
      target.setImageDrawable(circularBitmapDrawable(it))
      return
    }
    io.execute {
      val bmp = fetchBitmap(url) ?: return@execute
      cachedBitmaps[url] = bmp
      main.post { target.setImageDrawable(circularBitmapDrawable(bmp)) }
    }
  }

  /**
   * Drawable hiển thị bitmap dưới dạng hình tròn dùng [android.graphics.BitmapShader]
   * — tương đương Glide `CircleCrop` nhưng không phụ thuộc thư viện ngoài.
   */
  private fun circularBitmapDrawable(bmp: Bitmap): android.graphics.drawable.Drawable {
    return object : android.graphics.drawable.Drawable() {
      private val shader = android.graphics.BitmapShader(
        bmp,
        android.graphics.Shader.TileMode.CLAMP,
        android.graphics.Shader.TileMode.CLAMP,
      )
      private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        this.shader = this@apply.shader.also { /* no-op */ }
      }.also { it.shader = shader }
      private val matrix = android.graphics.Matrix()

      override fun onBoundsChange(bounds: android.graphics.Rect) {
        super.onBoundsChange(bounds)
        // Center-crop scale: scale theo cạnh ngắn của bitmap → vừa khít bounds.
        val w = bounds.width().toFloat()
        val h = bounds.height().toFloat()
        val src = minOf(bmp.width, bmp.height).toFloat()
        val scale = maxOf(w, h) / src
        matrix.reset()
        matrix.setScale(scale, scale)
        val dx = (w - bmp.width * scale) / 2f
        val dy = (h - bmp.height * scale) / 2f
        matrix.postTranslate(dx, dy)
        shader.setLocalMatrix(matrix)
      }

      override fun draw(canvas: android.graphics.Canvas) {
        val w = bounds.width().toFloat()
        val h = bounds.height().toFloat()
        val r = minOf(w, h) / 2f
        canvas.drawCircle(w / 2f, h / 2f, r, paint)
      }

      override fun setAlpha(a: Int) { paint.alpha = a }
      override fun setColorFilter(cf: android.graphics.ColorFilter?) { paint.colorFilter = cf }
      @Suppress("DEPRECATION")
      override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
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

  private fun letterDrawable(letter: String, bgColor: Int): android.graphics.drawable.Drawable {
    return object : android.graphics.drawable.Drawable() {
      private val bg = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = bgColor
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
        canvas.drawText(letter.uppercase(), w / 2f, h / 2f - (fm.ascent + fm.descent) / 2f, txt)
      }
      override fun setAlpha(a: Int) {}
      override fun setColorFilter(cf: android.graphics.ColorFilter?) {}
      @Suppress("DEPRECATION")
      override fun getOpacity(): Int = PixelFormat.OPAQUE
    }
  }

  private val avatarPalette = intArrayOf(
    Color.parseColor("#0068FF"),
    Color.parseColor("#FB923C"),
    Color.parseColor("#10B981"),
    Color.parseColor("#A855F7"),
    Color.parseColor("#EC4899"),
    Color.parseColor("#06B6D4"),
    Color.parseColor("#F59E0B"),
    Color.parseColor("#EF4444"),
  )

  private fun senderColor(seed: String?): Int {
    if (seed.isNullOrBlank()) return avatarPalette[0]
    val h = (seed.hashCode() xor (seed.length * 31))
    return avatarPalette[Math.floorMod(h, avatarPalette.size)]
  }

  // ---------- Helpers ----------

  private fun dp(v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), ctx.resources.displayMetrics).toInt()

  private fun statusBarHeight(): Int {
    val id = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) ctx.resources.getDimensionPixelSize(id) else dp(24)
  }

  private fun screenWidthPx(): Int = ctx.resources.displayMetrics.widthPixels

  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  private fun formatTs(ts: Long): String {
    if (ts <= 0) return ""
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(ts))
  }

  private fun dayKeyOf(ts: Long): String {
    if (ts <= 0) return "?"
    return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(ts))
  }

  private fun formatDay(ts: Long): String {
    val cal = Calendar.getInstance().apply { timeInMillis = ts }
    val today = Calendar.getInstance()
    val yest = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }
    fun sameDay(a: Calendar, b: Calendar) =
      a.get(Calendar.YEAR) == b.get(Calendar.YEAR) &&
        a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)
    return when {
      sameDay(cal, today) -> "Hôm nay"
      sameDay(cal, yest) -> "Hôm qua"
      else -> SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date(ts))
    }
  }

  private fun readMyUserId(): String? = ctx
    .getSharedPreferences("crm_floating_bubble_prefs", Context.MODE_PRIVATE)
    .getString(FloatingBubbleModule.KEY_USER_ID, null)

  /**
   * `LinearLayout` đặt được giới hạn `maxWidth` (LinearLayout chuẩn không có thuộc tính này).
   * Dùng để bubble không vượt quá tỉ lệ % bề ngang khung chat.
   */
  private class MaxWidthLinearLayout(ctx: Context, private val maxW: Int) : LinearLayout(ctx) {
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
      val current = android.view.View.MeasureSpec.getSize(widthMeasureSpec)
      val limited = if (current > 0 && current > maxW) {
        android.view.View.MeasureSpec.makeMeasureSpec(maxW,
          android.view.View.MeasureSpec.getMode(widthMeasureSpec).let {
            if (it == android.view.View.MeasureSpec.UNSPECIFIED) android.view.View.MeasureSpec.AT_MOST else it
          })
      } else widthMeasureSpec
      super.onMeasure(limited, heightMeasureSpec)
    }
  }
}
