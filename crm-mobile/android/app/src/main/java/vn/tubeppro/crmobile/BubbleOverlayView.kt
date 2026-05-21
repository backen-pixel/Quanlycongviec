package vn.tubeppro.crmobile

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.SystemClock
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * View tròn render avatar (chữ cái) + badge cho bong bóng overlay.
 *
 * Đối ứng [com.facebook.chatheads.view.bubble.BubbleView] của Messenger.
 * Tự xử lý touch: tap, long-press, drag, snap mép, drop dismiss.
 *
 * KHÔNG tự gắn vào WindowManager — [BubbleWindowManager] phụ trách.
 */
@SuppressLint("ViewConstructor")
class BubbleOverlayView(
  context: Context,
  private val callback: Callback,
) : View(context) {

  interface Callback {
    fun onTap()
    fun onLongPress()
    fun onDragStart()
    fun onDragMove(rawX: Float, rawY: Float)
    fun onDragEnd(rawX: Float, rawY: Float, droppedToDismiss: Boolean)
  }

  // ---------------- State ----------------
  private var avatarLetter: String = "?"
  private var avatarBitmap: android.graphics.Bitmap? = null
  private val avatarMatrix = android.graphics.Matrix()
  private val avatarBitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isFilterBitmap = true }
  private var badgeText: String? = null
  private var dragging = false

  // ---------------- Paints ----------------
  private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = ZALO_BLUE
    style = Paint.Style.STROKE
    strokeWidth = dp(3f)
  }
  private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    style = Paint.Style.FILL
  }
  private val avatarBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = ZALO_BLUE_SOFT
    style = Paint.Style.FILL
  }
  private val avatarTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = ZALO_BLUE
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    textAlign = Paint.Align.CENTER
  }
  private val badgeBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#FF3B30")
    style = Paint.Style.FILL
  }
  private val badgeBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    style = Paint.Style.STROKE
    strokeWidth = dp(2f)
  }
  private val badgeTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    textAlign = Paint.Align.CENTER
  }

  // ---------------- Touch state ----------------
  private var touchDownX = 0f
  private var touchDownY = 0f
  private var touchDownTimeMs = 0L
  private var didDrag = false
  private val longPressMs = 420L
  private val tapSlopPx = dp(8f)
  private val longPressRunnable = Runnable {
    if (!didDrag) {
      callback.onLongPress()
    }
  }

  fun setAvatarLetter(s: String) {
    avatarLetter = (s.trim().ifEmpty { "?" }).take(1).uppercase()
    invalidate()
  }

  fun setAvatarBitmap(bmp: android.graphics.Bitmap?) {
    avatarBitmap = bmp
    invalidate()
  }

  fun setBadge(count: Int) {
    badgeText = when {
      count <= 0 -> null
      count > 99 -> "99+"
      else -> count.toString()
    }
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    val cx = w / 2f
    val cy = h / 2f
    val outerR = min(cx, cy) - dp(2f)

    // Outer white circle + blue ring
    canvas.drawCircle(cx, cy, outerR, bgPaint)
    canvas.drawCircle(cx, cy, outerR - dp(1.5f), ringPaint)

    // Avatar fill + letter / bitmap
    val innerR = outerR - dp(6f)
    canvas.drawCircle(cx, cy, innerR, avatarBgPaint)
    val bmp = avatarBitmap
    if (bmp != null && !bmp.isRecycled) {
      val saved = canvas.save()
      val path = android.graphics.Path().apply {
        addCircle(cx, cy, innerR, android.graphics.Path.Direction.CW)
      }
      canvas.clipPath(path)
      val side = (innerR * 2).toFloat()
      val src = minOf(bmp.width, bmp.height).toFloat()
      val scale = side / src
      avatarMatrix.reset()
      avatarMatrix.setScale(scale, scale)
      val dxCenter = cx - (bmp.width * scale) / 2f
      val dyCenter = cy - (bmp.height * scale) / 2f
      avatarMatrix.postTranslate(dxCenter, dyCenter)
      canvas.drawBitmap(bmp, avatarMatrix, avatarBitmapPaint)
      canvas.restoreToCount(saved)
    } else {
      avatarTextPaint.textSize = innerR * 0.9f
      val fm = avatarTextPaint.fontMetrics
      val ty = cy - (fm.ascent + fm.descent) / 2f
      canvas.drawText(avatarLetter, cx, ty, avatarTextPaint)
    }

    // Badge top-right
    val text = badgeText
    if (text != null) {
      val padH = dp(5f)
      badgeTextPaint.textSize = dp(10f)
      val tw = badgeTextPaint.measureText(text)
      val bw = max(dp(18f), tw + padH * 2)
      val bh = dp(18f)
      val br = bh / 2f
      val right = cx + outerR - dp(2f)
      val top = cy - outerR + dp(2f) - bh / 2f
      val rect = RectF(right - bw, top, right, top + bh)
      canvas.drawRoundRect(rect, br, br, badgeBgPaint)
      canvas.drawRoundRect(rect, br, br, badgeBorderPaint)
      val bfm = badgeTextPaint.fontMetrics
      val bty = rect.centerY() - (bfm.ascent + bfm.descent) / 2f
      canvas.drawText(text, rect.centerX(), bty, badgeTextPaint)
    }
  }

  // ---------------- Touch handling ----------------

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.action) {
      MotionEvent.ACTION_DOWN -> {
        touchDownX = event.rawX
        touchDownY = event.rawY
        touchDownTimeMs = SystemClock.uptimeMillis()
        didDrag = false
        postDelayed(longPressRunnable, longPressMs)
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - touchDownX
        val dy = event.rawY - touchDownY
        if (!didDrag && hypot(dx.toDouble(), dy.toDouble()) > tapSlopPx) {
          didDrag = true
          dragging = true
          removeCallbacks(longPressRunnable)
          callback.onDragStart()
        }
        if (dragging) {
          callback.onDragMove(event.rawX, event.rawY)
        }
        return true
      }
      MotionEvent.ACTION_UP -> {
        removeCallbacks(longPressRunnable)
        if (dragging) {
          dragging = false
          val dropped = false // computed by BubbleWindowManager when it knows drop bounds
          callback.onDragEnd(event.rawX, event.rawY, dropped)
        } else if (!didDrag) {
          val elapsed = SystemClock.uptimeMillis() - touchDownTimeMs
          if (elapsed < longPressMs) callback.onTap()
        }
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        removeCallbacks(longPressRunnable)
        if (dragging) {
          dragging = false
          callback.onDragEnd(event.rawX, event.rawY, false)
        }
        return true
      }
    }
    return super.onTouchEvent(event)
  }

  private fun dp(v: Float): Float =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

  companion object {
    val ZALO_BLUE: Int = Color.parseColor("#0068FF")
    val ZALO_BLUE_SOFT: Int = Color.parseColor("#E8F4FF")

    /** LayoutParams chuẩn cho overlay window. */
    fun makeLayoutParams(sizePx: Int, x: Int, y: Int): WindowManager.LayoutParams {
      val type = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
      return WindowManager.LayoutParams(
        sizePx, sizePx, x, y,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        android.graphics.PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = android.view.Gravity.TOP or android.view.Gravity.START
      }
    }
  }
}
