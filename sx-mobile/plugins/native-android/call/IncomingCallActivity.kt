package vn.tubeppro.sxmobile.call

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import vn.tubeppro.sxmobile.R

/**
 * Giao diện cuộc gọi full-screen trên màn khóa — gọi đến / đang gọi / đang nói.
 */
class IncomingCallActivity : AppCompatActivity() {

  private var callData: IncomingCallHelper.CallData? = null
  private var callDirection: String = "incoming"
  private var uiState: String = "ringing"
  private var isMuted: Boolean = false
  private var durationBaseMs: Long = 0L
  private var durationAnchorMs: Long = 0L
  private var ringAnchorMs: Long = 0L
  private var receiverRegistered = false

  private lateinit var avatarText: TextView
  private lateinit var nameText: TextView
  private lateinit var statusText: TextView
  private lateinit var subtitleText: TextView
  private lateinit var waveformRow: LinearLayout
  private lateinit var secondaryRow: LinearLayout
  private lateinit var incomingRow: LinearLayout
  private lateinit var activeRow: LinearLayout
  private lateinit var btnDecline: ImageButton
  private lateinit var btnAccept: ImageButton
  private lateinit var btnEnd: ImageButton
  private lateinit var btnMuteSecondary: ImageButton
  private lateinit var pulseRing1: View
  private lateinit var pulseRing2: View
  private lateinit var pulseRing3: View

  private val handler = Handler(Looper.getMainLooper())
  private val tickRunnable = object : Runnable {
    override fun run() {
      if (uiState == "incall" && durationAnchorMs > 0L) {
        val sec = ((System.currentTimeMillis() - durationAnchorMs + durationBaseMs) / 1000).toInt()
        subtitleText.text = String.format("%02d:%02d", sec / 60, sec % 60)
        handler.postDelayed(this, 1000L)
      }
    }
  }

  private val ringTickRunnable = object : Runnable {
    override fun run() {
      if (uiState == "ringing" || uiState == "outgoing") {
        val sec = ((System.currentTimeMillis() - ringAnchorMs) / 1000).toInt()
        subtitleText.text = String.format("%02d:%02d", sec / 60, sec % 60)
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
      applyState(status)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setupLockScreenWindow()
    callDirection = intent.getStringExtra("call_direction")?.trim().orEmpty().ifBlank { "incoming" }
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
    setContentView(R.layout.activity_incoming_call)
    bindViews()
    setupWaveform()
    startPulseAnimation()
    wireButtons(data)
    if (callDirection == "outgoing") showOutgoing()
    else showRinging()
    if (intent.getBooleanExtra("auto_accept", false)) onAccept(data)
    registerStateReceiver()
  }

  override fun onResume() {
    super.onResume()
    if (uiState != "idle") setupLockScreenWindow()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val state = intent.getStringExtra("call_state")?.trim().orEmpty()
    if (state.isNotBlank()) {
      setIntent(intent)
      val stateCallId = intent.getStringExtra("call_id")?.trim().orEmpty()
      if (stateCallId.isNotBlank() && callData != null && stateCallId != callData!!.callId) return
      isMuted = intent.getBooleanExtra("is_muted", isMuted)
      durationBaseMs = intent.getLongExtra("duration_ms", durationBaseMs)
      applyState(state)
      return
    }
    val data = IncomingCallHelper.dataFromIntent(intent) ?: return
    val existing = currentCallId
    if (existing != null && existing != data.callId && uiState != "ringing") return
    setIntent(intent)
    currentCallId = data.callId
    callData = data
    if (intent.getBooleanExtra("auto_accept", false)) onAccept(data)
  }

  private fun bindViews() {
    avatarText = findViewById(R.id.avatar_text)
    nameText = findViewById(R.id.name_text)
    statusText = findViewById(R.id.status_text)
    subtitleText = findViewById(R.id.subtitle_text)
    waveformRow = findViewById(R.id.waveform_row)
    secondaryRow = findViewById(R.id.secondary_row)
    incomingRow = findViewById(R.id.incoming_row)
    activeRow = findViewById(R.id.active_row)
    btnDecline = findViewById(R.id.btn_decline)
    btnAccept = findViewById(R.id.btn_accept)
    btnEnd = findViewById(R.id.btn_end)
    btnMuteSecondary = findViewById(R.id.btn_mute_secondary)
    pulseRing1 = findViewById(R.id.pulse_ring_1)
    pulseRing2 = findViewById(R.id.pulse_ring_2)
    pulseRing3 = findViewById(R.id.pulse_ring_3)
  }

  private fun wireButtons(data: IncomingCallHelper.CallData) {
    btnDecline.setOnClickListener { onReject(data) }
    btnAccept.setOnClickListener { onAccept(data) }
    btnEnd.setOnClickListener { onEndFromUi(data) }
    btnMuteSecondary.setOnClickListener {
      isMuted = !isMuted
      LockScreenCallBridge.notifyToggleMuteFromNativeUi(applicationContext, data.callId)
      updateMuteIcon()
    }
  }

  private fun setupWaveform() {
    waveformRow.removeAllViews()
    val heights = intArrayOf(12, 20, 28, 18, 24, 16, 22)
    for (h in heights) {
      val bar = View(this).apply {
        setBackgroundColor(Color.parseColor("#3B82F6"))
        val lp = LinearLayout.LayoutParams(dp(4), dp(h))
        lp.marginEnd = dp(3)
        layoutParams = lp
      }
      waveformRow.addView(bar)
    }
  }

  private fun startPulseAnimation() {
    listOf(pulseRing1 to 0L, pulseRing2 to 400L, pulseRing3 to 800L).forEach { (view, delay) ->
      ObjectAnimator.ofFloat(view, View.ALPHA, 0.35f, 0.9f).apply {
        duration = 1400
        repeatMode = ValueAnimator.REVERSE
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        startDelay = delay
        start()
      }
      ObjectAnimator.ofFloat(view, View.SCALE_X, 0.92f, 1.08f).apply {
        duration = 1400
        repeatMode = ValueAnimator.REVERSE
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        startDelay = delay
        start()
      }
      ObjectAnimator.ofFloat(view, View.SCALE_Y, 0.92f, 1.08f).apply {
        duration = 1400
        repeatMode = ValueAnimator.REVERSE
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        startDelay = delay
        start()
      }
    }
  }

  private fun displayName(data: IncomingCallHelper.CallData): String {
    return if (data.isGroup) data.groupName.ifBlank { "Nhóm" } else data.fromName
  }

  private fun showRinging() {
    uiState = "ringing"
    val data = callData ?: return
    val name = displayName(data)
    avatarText.text = avatarInitials(name)
    nameText.text = name
    statusText.text = if (data.isGroup) "CUỘC GỌI NHÓM" else "CUỘC GỌI ĐẾN"
    subtitleText.text = "Đang đổ chuông…"
    incomingRow.visibility = View.VISIBLE
    activeRow.visibility = View.GONE
    secondaryRow.visibility = View.VISIBLE
    btnMuteSecondary.isEnabled = false
    btnMuteSecondary.alpha = 0.4f
    handler.removeCallbacks(tickRunnable)
    handler.removeCallbacks(ringTickRunnable)
  }

  private fun showOutgoing() {
    uiState = "outgoing"
    val data = callData ?: return
    val name = displayName(data)
    avatarText.text = avatarInitials(name)
    nameText.text = name
    statusText.text = "ĐANG GỌI"
    subtitleText.text = "00:00"
    incomingRow.visibility = View.GONE
    activeRow.visibility = View.VISIBLE
    secondaryRow.visibility = View.VISIBLE
    handler.removeCallbacks(tickRunnable)
    startRingTimer()
  }

  private fun showConnecting() {
    uiState = "connecting"
    handler.removeCallbacks(ringTickRunnable)
    val data = callData ?: return
    nameText.text = displayName(data)
    statusText.text = "ĐANG KẾT NỐI"
    subtitleText.text = "Đang kết nối…"
    incomingRow.visibility = View.GONE
    activeRow.visibility = View.VISIBLE
    secondaryRow.visibility = View.VISIBLE
    btnMuteSecondary.isEnabled = true
    btnMuteSecondary.alpha = 1f
  }

  private fun showActive(durationMs: Long) {
    val data = callData ?: return
    val wasActive = uiState == "incall"
    uiState = "incall"
    handler.removeCallbacks(ringTickRunnable)
    nameText.text = displayName(data)
    statusText.text = "ĐANG GỌI"
    incomingRow.visibility = View.GONE
    activeRow.visibility = View.VISIBLE
    secondaryRow.visibility = View.VISIBLE
    btnMuteSecondary.isEnabled = true
    btnMuteSecondary.alpha = 1f
    updateMuteIcon()
    if (!wasActive) {
      durationAnchorMs = System.currentTimeMillis()
      durationBaseMs = durationMs
      handler.removeCallbacks(tickRunnable)
      handler.post(tickRunnable)
    }
  }

  private fun updateMuteIcon() {
    btnMuteSecondary.alpha = if (isMuted) 0.5f else 1f
  }

  private fun applyState(status: String) {
    when (status) {
      "idle", "ended" -> {
        currentCallId = null
        finishAndRemoveTask()
      }
      "outgoing" -> showOutgoing()
      "connecting" -> showConnecting()
      "incall", "active" -> showActive(durationBaseMs)
      "incoming" -> showRinging()
    }
  }

  private fun onAccept(data: IncomingCallHelper.CallData) {
    if (uiState != "ringing") return
    // KHÔNG dismiss keyguard: activity đã showWhenLocked nên giữ nguyên trên màn khóa,
    // tránh bật màn mở khóa (PIN/vân tay) che mất giao diện cuộc gọi.
    showConnecting()
    LockScreenCallBridge.setUiActive(true, data)
    InCallForegroundService.start(
      this,
      data.callId,
      if (data.isGroup) "Cuộc gọi nhóm" else data.fromName,
      "Đang kết nối…",
    )
    IncomingCallHelper.completeNativeAccept(applicationContext, data)
  }

  private fun onReject(data: IncomingCallHelper.CallData) {
    currentCallId = null
    CallRejectApi.rejectAsync(applicationContext, data.callId, data.fromUserId)
    IncomingCallHelper.cancelCallNotification(this, data.callId)
    LockScreenCallBridge.dismissUi(applicationContext, force = true)
    finishAndRemoveTask()
  }

  private fun onEndFromUi(data: IncomingCallHelper.CallData) {
    currentCallId = null
    LockScreenCallBridge.notifyEndFromNativeUi(applicationContext, data.callId)
    IncomingCallHelper.cancelCallNotification(this, data.callId)
    finishAndRemoveTask()
  }

  override fun onDestroy() {
    handler.removeCallbacks(tickRunnable)
    handler.removeCallbacks(ringTickRunnable)
    unregisterStateReceiver()
    if (!LockScreenCallBridge.isUiActive() && currentCallId == callData?.callId) {
      currentCallId = null
    }
    super.onDestroy()
  }

  private fun registerStateReceiver() {
    if (receiverRegistered) return
    val filter = IntentFilter(LockScreenCallBridge.ACTION_STATE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(stateReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(stateReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun unregisterStateReceiver() {
    if (!receiverRegistered) return
    try { unregisterReceiver(stateReceiver) } catch (_: Exception) { }
    receiverRegistered = false
  }

  private fun startRingTimer() {
    ringAnchorMs = System.currentTimeMillis()
    handler.removeCallbacks(ringTickRunnable)
    handler.post(ringTickRunnable)
  }

  /** Giữ UI cuộc gọi trên cùng sau khi MainActivity nạp RN ngầm. */
  private fun keepCallUiOnTop(status: String) {
    val id = callData?.callId?.trim().orEmpty()
    if (id.isBlank()) return
    val show = {
      presentState(applicationContext, id, status, durationBaseMs, isMuted)
    }
    handler.post(show)
    handler.postDelayed(show, 120L)
    handler.postDelayed(show, 450L)
    handler.postDelayed(show, 900L)
  }

  private fun avatarInitials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.size >= 2) {
      return (parts.first().first().toString() + parts.last().first()).uppercase()
    }
    return parts.firstOrNull()?.take(2)?.uppercase() ?: "?"
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

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  private fun dismissKeyguardIfNeeded() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val km = getSystemService(KEYGUARD_SERVICE) as? android.app.KeyguardManager
      km?.requestDismissKeyguard(this, null)
    }
  }

  companion object {
    @Volatile
    @JvmStatic
    var currentCallId: String? = null

    fun createIntent(
      context: Context,
      data: IncomingCallHelper.CallData,
      autoAccept: Boolean = false,
      direction: String = "incoming",
    ): Intent {
      return Intent(context, IncomingCallActivity::class.java).apply {
        putExtra("call_id", data.callId)
        putExtra("from_user_id", data.fromUserId)
        putExtra("from_name", data.fromName)
        putExtra("is_group", data.isGroup)
        putExtra("group_id", data.groupId)
        putExtra("group_name", data.groupName)
        putExtra("auto_accept", autoAccept)
        putExtra("call_direction", direction)
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

    /** Gọi đi — hiện full-screen ngay trên Android. */
    fun launchOutgoing(context: Context, data: IncomingCallHelper.CallData) {
      context.startActivity(
        createIntent(context, data, direction = "outgoing").apply {
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
              or Intent.FLAG_ACTIVITY_SINGLE_TOP
              or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS,
          )
        },
      )
    }

    fun presentState(
      context: Context,
      callId: String,
      status: String,
      durationMs: Long,
      isMuted: Boolean,
    ) {
      if (callId.isBlank()) return
      if (currentCallId != null && currentCallId != callId) return
      if (currentCallId == null) currentCallId = callId
      val data = LockScreenCallBridge.activeCallData
      val intent = Intent(context, IncomingCallActivity::class.java).apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK
            or Intent.FLAG_ACTIVITY_SINGLE_TOP
            or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            or Intent.FLAG_ACTIVITY_NO_ANIMATION
            or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS,
        )
        putExtra("call_state", status)
        putExtra("call_id", callId)
        putExtra("duration_ms", durationMs)
        putExtra("is_muted", isMuted)
        if (data != null && data.callId == callId) {
          putExtra("from_user_id", data.fromUserId)
          putExtra("from_name", data.fromName)
          putExtra("is_group", data.isGroup)
          putExtra("group_id", data.groupId)
          putExtra("group_name", data.groupName)
        }
      }
      try {
        context.startActivity(intent)
      } catch (_: Exception) { }
    }

    private fun initials(name: String): String {
      val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
      if (parts.size >= 2) {
        return (parts.first().first().toString() + parts.last().first()).uppercase()
      }
      return parts.firstOrNull()?.take(2)?.uppercase() ?: "?"
    }
  }
}
