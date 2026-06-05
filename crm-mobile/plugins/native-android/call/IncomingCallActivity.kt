package vn.tubeppro.crmobile.call

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

/** Màn hình full-screen "Cuộc gọi đến" khi app tắt / màn hình khóa. */
class IncomingCallActivity : AppCompatActivity() {

  private var callData: IncomingCallHelper.CallData? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
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

    callData = IncomingCallHelper.dataFromIntent(intent)
    if (callData == null) {
      finish()
      return
    }

    setContentView(buildUi(callData!!))
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    callData = IncomingCallHelper.dataFromIntent(intent)
  }

  private fun buildUi(data: IncomingCallHelper.CallData): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#0B1220"))
      setPadding(48, 96, 48, 96)
    }

    val title = TextView(this).apply {
      text = if (data.isGroup) "Cuộc gọi nhóm" else "Cuộc gọi đến"
      textSize = 16f
      setTextColor(Color.parseColor("#94A3B8"))
      gravity = Gravity.CENTER
    }

    val name = TextView(this).apply {
      text = if (data.isGroup) {
        data.groupName.ifBlank { "Nhóm" }
      } else {
        data.fromName
      }
      textSize = 28f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 8)
    }

    val subtitle = TextView(this).apply {
      text = if (data.isGroup) {
        "${data.fromName} đang mời bạn tham gia"
      } else {
        "Đang gọi bạn…"
      }
      textSize = 16f
      setTextColor(Color.parseColor("#CBD5E1"))
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, 64)
    }

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }

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
    buttons.addView(reject, lp)
    buttons.addView(accept, lp)

    root.addView(title)
    root.addView(name)
    root.addView(subtitle)
    root.addView(buttons)
    return root
  }

  private fun onAccept(data: IncomingCallHelper.CallData) {
    IncomingCallHelper.launchMainWithCall(this, data, "accept")
    finish()
  }

  private fun onReject(data: IncomingCallHelper.CallData) {
    CallRejectApi.rejectAsync(applicationContext, data.callId, data.fromUserId)
    IncomingCallHelper.cancelCallNotification(this, data.callId)
    finish()
  }

  companion object {
    fun createIntent(context: Context, data: IncomingCallHelper.CallData): Intent {
      return Intent(context, IncomingCallActivity::class.java).apply {
        putExtra("call_id", data.callId)
        putExtra("from_user_id", data.fromUserId)
        putExtra("from_name", data.fromName)
        putExtra("is_group", data.isGroup)
        putExtra("group_id", data.groupId)
        putExtra("group_name", data.groupName)
      }
    }
  }
}
