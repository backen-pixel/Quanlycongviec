package vn.tubeppro.vcmobile.overlay

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Composer chat trong Activity — bàn phím + ch?n ?nh ho?t d?ng gi?ng ChatDetailScreen.
 * Overlay panel ?n t?m khi Activity này m?.
 */
class BubbleComposeActivity : Activity() {
  private var groupId = ""
  private var replyId: String? = null
  private var inputView: EditText? = null
  private var sendButton: TextView? = null
  private var replyBar: LinearLayout? = null
  private var pendingStrip: HorizontalScrollView? = null
  private var pendingRow: LinearLayout? = null
  private var attachSheet: LinearLayout? = null
  private var rootLayout: FrameLayout? = null
  private var composerWrap: LinearLayout? = null
  private val pendingFiles = ArrayList<BubbleChatApi.PendingFile>()
  private var sending = false
  private var closed = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    BubbleComposeBridge.registerComposeActivity(this)
    groupId = intent.getStringExtra(BubbleComposeBridge.EXTRA_GROUP_ID)?.trim().orEmpty()
    if (groupId.isBlank()) {
      finish()
      return
    }
    replyId = intent.getStringExtra(BubbleComposeBridge.EXTRA_REPLY_ID)?.trim()?.ifBlank { null }
    val replySender = intent.getStringExtra(BubbleComposeBridge.EXTRA_REPLY_SENDER)?.trim().orEmpty()
    val replyText = intent.getStringExtra(BubbleComposeBridge.EXTRA_REPLY_TEXT)?.trim().orEmpty()
    val showAttach = intent.getBooleanExtra(BubbleComposeBridge.EXTRA_SHOW_ATTACH, false)

    val ui = buildUi(replySender, replyText)
    rootLayout = ui.first
    composerWrap = ui.second
    setContentView(ui.first)

    if (showAttach) showAttachSheet()
    inputView?.post {
      inputView?.requestFocus()
      showKeyboard()
    }
  }

  override fun onBackPressed() {
    closeCompose(false)
  }

  override fun onDestroy() {
    BubbleComposeBridge.registerComposeActivity(null)
    if (!closed) BubbleComposeBridge.onComposeClosed(false)
    super.onDestroy()
  }

  fun bringToFront() {
    inputView?.post {
      inputView?.requestFocus()
      showKeyboard()
    }
  }

  fun finishFromBridge() {
    closeCompose(false)
  }

  override fun finish() {
    super.finish()
    overridePendingTransition(0, 0)
  }

  private fun buildUi(replySender: String, replyText: String): Pair<FrameLayout, LinearLayout> {
    val c = OverlayChatTheme.palette(this)
    val root = FrameLayout(this).apply {
      setBackgroundColor(Color.argb(120, 0, 0, 0))
      setOnClickListener { closeCompose(false) }
    }

    val sheet = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = OverlayChatTheme.roundedRect(c.bgElevated, 18, ::dp, c.border).also { bg ->
        bg.cornerRadii = floatArrayOf(
          dp(18).toFloat(), dp(18).toFloat(),
          dp(18).toFloat(), dp(18).toFloat(),
          0f, 0f, 0f, 0f,
        )
      }
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM,
      )
      setOnClickListener { /* gi? sheet */ }
    }
    composerWrap = sheet

    val reply = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(8), dp(8), dp(8))
      setBackgroundColor(c.inputBg)
      visibility = if (replyId != null && replyText.isNotBlank()) View.VISIBLE else View.GONE
    }
    replyBar = reply
    reply.addView(TextView(this).apply {
      text = if (replySender.isNotBlank()) "Tr? l?i $replySender" else "Tr? l?i"
      setTextColor(c.accent)
      setTypeface(typeface, Typeface.BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    })
    reply.addView(TextView(this).apply {
      text = replyText
      setTextColor(c.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      maxLines = 2
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
        it.marginStart = dp(8)
      }
    })
    reply.addView(TextView(this).apply {
      text = "?"
      setTextColor(c.textFaint)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setPadding(dp(8), dp(4), dp(4), dp(4))
      setOnClickListener {
        replyId = null
        replyBar?.visibility = View.GONE
      }
    })
    sheet.addView(reply)

    val pendingScroll = HorizontalScrollView(this).apply {
      isHorizontalScrollBarEnabled = false
      visibility = View.GONE
    }
    pendingStrip = pendingScroll
    pendingRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(12), dp(6), dp(12), dp(4))
    }
    pendingScroll.addView(pendingRow)
    sheet.addView(pendingScroll)

    val bar = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM
      setPadding(dp(12), dp(10), dp(12), dp(12))
    }

    bar.addView(TextView(this).apply {
      text = "+"
      gravity = Gravity.CENTER
      setTextColor(c.accent)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      setTypeface(typeface, Typeface.BOLD)
      background = OverlayChatTheme.plusButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).also { it.bottomMargin = dp(4) }
      setOnClickListener { showAttachSheet() }
    })

    val inputWrap = LinearLayout(this).apply {
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

    inputView = EditText(this).apply {
      hint = "Nh?n tin..."
      setHintTextColor(c.textFaint)
      setTextColor(c.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      maxLines = 4
      background = null
      setPadding(0, dp(11), 0, dp(11))
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
    }
    inputWrap.addView(inputView)
    bar.addView(inputWrap)

    sendButton = TextView(this).apply {
      text = "?"
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      background = OverlayChatTheme.sendButtonBg(c, ::dp)
      layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
      setOnClickListener { sendDraft() }
    }
    bar.addView(sendButton)
    sheet.addView(bar)

    val attach = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = OverlayChatTheme.roundedRect(c.bgElevated, 16, ::dp, c.border)
      setPadding(dp(12), dp(12), dp(12), dp(16))
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM,
      )
      visibility = View.GONE
    }
    attachSheet = attach
    root.addView(sheet)
    root.addView(attach)
    updateSendButton()
    return root to sheet
  }

  private fun showAttachSheet() {
    val sheet = attachSheet ?: return
    val c = OverlayChatTheme.palette(this)
    sheet.removeAllViews()
    sheet.visibility = View.VISIBLE
    fun addOpt(label: String, mode: String) {
      sheet.addView(TextView(this).apply {
        text = label
        setTextColor(c.text)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setPadding(dp(14), dp(14), dp(14), dp(14))
        setOnClickListener {
          hideAttachSheet()
          BubbleMediaBridge.pick(this@BubbleComposeActivity, mode, suspendPanel = false) { files ->
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
  }

  private fun hideAttachSheet() {
    attachSheet?.visibility = View.GONE
    attachSheet?.removeAllViews()
  }

  private fun refreshPendingStrip() {
    val row = pendingRow ?: return
    val c = OverlayChatTheme.palette(this)
    row.removeAllViews()
    if (pendingFiles.isEmpty()) {
      pendingStrip?.visibility = View.GONE
      updateSendButton()
      return
    }
    pendingStrip?.visibility = View.VISIBLE
    pendingFiles.forEachIndexed { idx, f ->
      if (f.isImage()) {
        val frame = FrameLayout(this).apply {
          layoutParams = LinearLayout.LayoutParams(dp(76), dp(76)).also { it.marginEnd = dp(8) }
          background = OverlayChatTheme.roundedRect(c.inputBg, 10, ::dp, c.border)
        }
        frame.addView(ImageView(this).apply {
          scaleType = ImageView.ScaleType.CENTER_CROP
          layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
          )
          try {
            val bmp = android.graphics.BitmapFactory.decodeFile(f.cachePath)
            if (bmp != null) setImageBitmap(bmp)
          } catch (_: Exception) { }
        })
        frame.addView(TextView(this).apply {
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
        row.addView(TextView(this).apply {
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
    val c = OverlayChatTheme.palette(this)
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
    if (sending) return
    val text = inputView?.text?.toString()?.trim().orEmpty()
    val files = pendingFiles.toList()
    if (text.isBlank() && files.isEmpty()) return

    sending = true
    updateSendButton()
    hideKeyboard()

    val gid = groupId
    val rid = replyId
    Thread {
      val ok = if (files.isNotEmpty()) {
        BubbleChatApi.uploadWithFiles(this, gid, files, text, rid)
      } else {
        BubbleChatApi.sendMessage(this, gid, text, rid)
      }
      runOnUiThread {
        sending = false
        if (ok) closeCompose(true) else {
          updateSendButton()
          inputView?.error = "G?i th?t b?i"
        }
      }
    }.start()
  }

  private fun closeCompose(sent: Boolean) {
    if (closed) return
    closed = true
    hideAttachSheet()
    hideKeyboard()
    BubbleComposeBridge.onComposeClosed(sent)
    finish()
  }

  private fun showKeyboard() {
    val input = inputView ?: return
    val imm = getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager
    imm?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
  }

  private fun hideKeyboard() {
    val imm = getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager
    inputView?.let { imm?.hideSoftInputFromWindow(it.windowToken, 0) }
  }

  private fun dp(v: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      v.toFloat(),
      resources.displayMetrics,
    ).toInt()
  }
}
