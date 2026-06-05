package vn.tubeppro.crmobile.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

/**
 * Cuộc gọi đến / đang gọi trên màn khóa & màn hình chờ — không cần mở app CRM.
 */
class IncomingCallActivity : AppCompatActivity() {

  private var callData: IncomingCallHelper.CallData? = null
  private var uiState: String = "ringing"
  private var isMuted: Boolean = false
  private var durationBaseMs: Long = 0L
  private var durationAnchorMs: Long = 0L

  private lateinit var root: LinearLayout
  private lateinit var titleView: TextView
  private lateinit var nameView: TextView
  private lateinit var subtitleView: TextView
  private lateinit var buttonsRow: LinearLayout
  private lateinit var endBtn: Button
  private lateinit var muteBtn: Button

  private val handler = Handler(Looper.getMainLooper())
  private val tickRunnable = object : Runnable {
    override fun run() {
      if (uiState == "active" && durationAnchorMs > 0L) {
        val sec = ((System.currentTimeMillis() - durationAnchorMs + durationBaseMs) / 1000).toInt()
        val m = sec / 60
        val s = sec % 60
        subtitleView.text = String.format("%02d:%02d", m, s)
        handler.postDelayed(this, 1000L)
      }
    }
  }

  private val stateReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != LockScreenCallBridge.ACTION_STATE) return
      val status = intent.getStringExtra("status")?.trim().orEmpty()
      if (status == "idle" || status == "ended") {
        currentCallId = null
        finishAndRemoveTask()
        return
      }
      val callId = intent.getStringExtra("call_id")?.trim().orEmpty()
      if (callId.isNotBlank() && callData != null && callId != callData!!.callId) return
      isMuted = intent.getBooleanExtra("is_muted", false)
      durationBaseMs = intent.getLongExtra("duration_ms", 0L)
      when (status) {
        "connecting" -> showConnecting()
        "active" -> {
          if (uiState == "active" && ::muteBtn.isInitialized) {
            muteBtn.text = if (isMuted) "Bật mic" else "Tắt mic"
          } else {
            showActive(durationBaseMs)
          }
        }
        "incoming" -> showRinging()
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setupLockScreenWindow()
    val data = IncomingCallHelper.dataFromIntent(intent)
    if (data == null) {
      finish()
      return
    }
    val existing = currentCallId
    if (existing != null && existing != data.callId) {
      finish()
      return
    }
    currentCallId = data.callId
    callData = data
    buildUi()
    setContentView(root)
    showRinging()
    if (intent.getBooleanExtra("auto_accept", false)) {
      callData?.let { onAccept(it) }
    }
  }

  override fun onStart() {
    super.onStart()
    val filter = IntentFilter(LockScreenCallBridge.ACTION_STATE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(stateReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(stateReceiver, filter)
    }
  }

  override fun onStop() {
    try { unregisterReceiver(stateReceiver) } catch (_: Exception) { }
    handler.removeCallbacks(tickRunnable)
    super.onStop()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val data = IncomingCallHelper.dataFromIntent(intent) ?: return
    val existing = currentCallId
    if (existing != null && existing != data.callId && uiState != "ringing") return
    setIntent(intent)
    currentCallId = data.callId
    callData = data
    if (intent.getBooleanExtra("auto_accept", false)) {
      onAccept(data)
    }
  }

  private fun setupLockScreenWindow() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    WindowCompat.setDecorFitsSystemWindows(window, false)
  }

  private fun buildUi() {
    root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#0B1220"))
      setPadding(48, 96, 48, 96)
    }
    titleView = TextView(this).apply {
      textSize = 16f
      setTextColor(Color.parseColor("#94A3B8"))
      gravity = Gravity.CENTER
    }
    nameView = TextView(this).apply {
      textSize = 28f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 8)
    }
    subtitleView = TextView(this).apply {
      textSize = 16f
      setTextColor(Color.parseColor("#CBD5E1"))
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, 64)
    }
    buttonsRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    root.addView(titleView)
    root.addView(nameView)
    root.addView(subtitleView)
    root.addView(buttonsRow)
  }

  private fun showRinging() {
    uiState = "ringing"
    val data = callData ?: return
    titleView.text = if (data.isGroup) "Cuộc gọi nhóm" else "Cuộc gọi đến"
    nameView.text = if (data.isGroup) data.groupName.ifBlank { "Nhóm" } else data.fromName
    subtitleView.text = if (data.isGroup) {
      "${data.fromName} đang mời bạn tham gia"
    } else {
      "Đang gọi bạn…"
    }
    buttonsRow.removeAllViews()
    val reject = Button(this).apply {
      text = "Từ chối"
      setBackgroundColor(Color.parseColor("#DC2626"))
      setTextColor(Color.WHITE)
      setOnClickListener { onReject(data) }
    }
    val accept = Button(this).apply {
      text = "Trả lời"
      setBackgroundColor(Color.parseColor("#16A34A"))
      setTextColor(Color.WHITE)
      setOnClickListener { onAccept(data) }
    }
    val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginStart = 12
      marginEnd = 12
    }
    buttonsRow.addView(reject, lp)
    buttonsRow.addView(accept, lp)
  }

  private fun showConnecting() {
    uiState = "connecting"
    val data = callData ?: return
    titleView.text = if (data.isGroup) "Cuộc gọi nhóm" else data.fromName
    nameView.text = if (data.isGroup) data.groupName.ifBlank { "Nhóm" } else data.fromName
    subtitleView.text = "Đang kết nối…"
    buttonsRow.removeAllViews()
    endBtn = Button(this).apply {
      text = "Huỷ"
      setBackgroundColor(Color.parseColor("#DC2626"))
      setTextColor(Color.WHITE)
      setOnClickListener { onEndFromUi(data) }
    }
    buttonsRow.addView(endBtn)
  }

  private fun showActive(durationMs: Long) {
    uiState = "active"
    val data = callData ?: return
    titleView.text = "Đang gọi"
    nameView.text = if (data.isGroup) data.groupName.ifBlank { "Nhóm" } else data.fromName
    durationAnchorMs = System.currentTimeMillis()
    durationBaseMs = durationMs
    handler.removeCallbacks(tickRunnable)
    handler.post(tickRunnable)
    buttonsRow.removeAllViews()
    muteBtn = Button(this).apply {
      text = if (isMuted) "Bật mic" else "Tắt mic"
      setBackgroundColor(Color.parseColor("#334155"))
      setTextColor(Color.WHITE)
      setOnClickListener {
        isMuted = !isMuted
        text = if (isMuted) "Bật mic" else "Tắt mic"
        LockScreenCallBridge.notifyToggleMuteFromNativeUi(applicationContext, data.callId)
      }
    }
    endBtn = Button(this).apply {
      text = "Kết thúc"
      setBackgroundColor(Color.parseColor("#DC2626"))
      setTextColor(Color.WHITE)
      setOnClickListener { onEndFromUi(data) }
    }
    val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginStart = 12
      marginEnd = 12
    }
    buttonsRow.addView(muteBtn, lp)
    buttonsRow.addView(endBtn, lp)
  }

  private fun onAccept(data: IncomingCallHelper.CallData) {
    if (uiState != "ringing") return
    dismissKeyguardIfNeeded()
    showConnecting()
    LockScreenCallBridge.setUiActive(true)
    InCallForegroundService.start(
      this,
      if (data.isGroup) "Cuộc gọi nhóm" else data.fromName,
      "Đang kết nối…",
    )
    IncomingCallHelper.launchMainForCallBackground(this, data, "accept")
  }

  private fun onReject(data: IncomingCallHelper.CallData) {
    currentCallId = null
    CallRejectApi.rejectAsync(applicationContext, data.callId, data.fromUserId)
    IncomingCallHelper.cancelCallNotification(this, data.callId)
    LockScreenCallBridge.dismissUi(applicationContext)
    finishAndRemoveTask()
  }

  private fun onEndFromUi(data: IncomingCallHelper.CallData) {
    currentCallId = null
    LockScreenCallBridge.notifyEndFromNativeUi(applicationContext, data.callId)
    IncomingCallHelper.cancelCallNotification(this, data.callId)
    finishAndRemoveTask()
  }

  override fun onDestroy() {
    if (currentCallId == callData?.callId) currentCallId = null
    super.onDestroy()
  }

  private fun dismissKeyguardIfNeeded() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val km = getSystemService(KEYGUARD_SERVICE) as android.app.KeyguardManager
        km.requestDismissKeyguard(this, null)
      } catch (_: Exception) { }
    }
  }

  companion object {
    /** callId đang hiển thị trên màn khóa — chống trùng Activity. */
    @Volatile
    @JvmStatic
    var currentCallId: String? = null

    fun createIntent(context: Context, data: IncomingCallHelper.CallData, autoAccept: Boolean = false): Intent {
      return Intent(context, IncomingCallActivity::class.java).apply {
        putExtra("call_id", data.callId)
        putExtra("from_user_id", data.fromUserId)
        putExtra("from_name", data.fromName)
        putExtra("is_group", data.isGroup)
        putExtra("group_id", data.groupId)
        putExtra("group_name", data.groupName)
        putExtra("auto_accept", autoAccept)
      }
    }

    fun launchForAccept(context: Context, data: IncomingCallHelper.CallData) {
      context.startActivity(
        createIntent(context, data, autoAccept = true).apply {
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
              or Intent.FLAG_ACTIVITY_SINGLE_TOP
              or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS,
          )
        },
      )
    }
  }
}
