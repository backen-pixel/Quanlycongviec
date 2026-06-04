package vn.tubeppro.crmobile.overlay

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import vn.tubeppro.crmobile.MainActivity
import kotlin.math.abs

/** Quản lý bong bóng chat nổi (TYPE_APPLICATION_OVERLAY). */
object OverlayBubbleManager {
  private var windowManager: WindowManager? = null
  private val bubbleViews = LinkedHashMap<String, View>()
  private val bubbleParams = LinkedHashMap<String, WindowManager.LayoutParams>()

  fun canDraw(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(context.applicationContext)
    } else {
      true
    }
  }

  fun openOverlaySettings(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        android.net.Uri.parse("package:${context.packageName}"),
      )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  fun showBubble(context: Context, key: String, title: String, letter: String) {
    val app = context.applicationContext
    if (!canDraw(app)) return
    val wm = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    windowManager = wm

    bubbleViews[key]?.let {
      try { wm.removeView(it) } catch (_: Exception) { }
    }

    val density = app.resources.displayMetrics.density
    val size = (56 * density).toInt()

    val container = FrameLayout(app)
    val label = TextView(app)
    label.text = letter.ifBlank { "?" }.take(1).uppercase()
    label.gravity = Gravity.CENTER
    label.setTextColor(Color.WHITE)
    label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
    label.setBackgroundColor(Color.parseColor("#0068FF"))
    label.layoutParams = FrameLayout.LayoutParams(size, size)

    val params = WindowManager.LayoutParams(
      size,
      size,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.x = (16 * density).toInt()
    params.y = (120 * density).toInt() + bubbleViews.size * (size + 12)

    container.addView(label)
    attachDrag(wm, container, params)
    container.setOnClickListener {
      val intent = Intent(app, MainActivity::class.java)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      intent.putExtra("bubble_key", key)
      intent.putExtra("bubble_title", title)
      app.startActivity(intent)
    }

    try {
      wm.addView(container, params)
      bubbleViews[key] = container
      bubbleParams[key] = params
    } catch (_: Exception) { }
  }

  fun hideBubble(key: String) {
    val wm = windowManager ?: return
    bubbleViews.remove(key)?.let {
      try { wm.removeView(it) } catch (_: Exception) { }
    }
    bubbleParams.remove(key)
  }

  fun stopAll() {
    val wm = windowManager ?: return
    for ((_, view) in bubbleViews) {
      try { wm.removeView(view) } catch (_: Exception) { }
    }
    bubbleViews.clear()
    bubbleParams.clear()
  }

  private fun attachDrag(wm: WindowManager, view: View, params: WindowManager.LayoutParams) {
    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    view.setOnTouchListener { v, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          startX = params.x
          startY = params.y
          false
        }
        MotionEvent.ACTION_MOVE -> {
          params.x = startX + (event.rawX - downX).toInt()
          params.y = startY + (event.rawY - downY).toInt()
          try { wm.updateViewLayout(v, params) } catch (_: Exception) { }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (abs(event.rawX - downX) < 8 && abs(event.rawY - downY) < 8) {
            v.performClick()
          }
          true
        }
        else -> false
      }
    }
  }
}
