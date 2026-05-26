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
import android.view.VelocityTracker
import android.view.View
import android.view.WindowManager
import kotlin.math.hypot
import kotlin.math.max

/**
 * View tròn render avatar (chữ cái) + badge cho bong bóng overlay.
 *
 * KIẾN TRÚC: Window được tạo lớn ([WINDOW_DP] = 180dp) nhưng phần bong bóng vẽ
 * thật chỉ [VISIBLE_DP] = 60dp ở **giữa** window. Phần đệm trong suốt 60dp mỗi
 * bên giúp ngón tay không bị "thoát" window khi user kéo nhanh — đây là cách
 * Facebook ChatHeads làm để drag mượt mà. Đánh đổi: vùng halo trong suốt sẽ
 * không cho touch xuyên xuống app dưới (giống Messenger). Ta accept tradeoff
 * này vì smoothness của drag là yêu cầu chính.
 *
 * Để giảm "false-tap" khi user chạm vào vùng halo trong suốt, [onTouchEvent]
 * hit-test theo bán kính bubble visible: touch ngoài vòng tròn → trả về `false`
 * và bubble không phản hồi (visual không có gì xảy ra).
 *
 * Tham khảo: [com.facebook.chatheads.view.bubble.BubbleView]
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
    fun onDragEnd(rawX: Float, rawY: Float, droppedToDismiss: Boolean, vx: Float, vy: Float)
  }

  // ---------------- State ----------------
  private var avatarLetter: String = "?"
  private var avatarBitmap: android.graphics.Bitmap? = null
  private val avatarMatrix = android.graphics.Matrix()
  private val avatarBitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isFilterBitmap = true }
  private var badgeText: String? = null
  private var dragging = false

  /** Bán kính bong bóng nhìn thấy (cố định, không phụ thuộc kích thước view). */
  private val bubbleVisibleRadius = dp(VISIBLE_DP / 2f)
  /** Bao rộng hơn bubble một chút để bắt touch ở mép cho dễ. */
  private val touchableRadius = bubbleVisibleRadius + dp(6f)

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
    // Dùng kích thước bubble CỐ ĐỊNH (không phụ thuộc view size — view có thể lớn 180dp).
    val outerR = bubbleVisibleRadius - dp(2f)

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

  private var velocityTracker: VelocityTracker? = null

  /** Kiểm tra điểm touch có nằm trong vùng tròn bubble (so với tâm view). */
  private fun isOnVisibleBubble(x: Float, y: Float): Boolean {
    val cx = width / 2f
    val cy = height / 2f
    val dist = hypot((x - cx).toDouble(), (y - cy).toDouble()).toFloat()
    return dist <= touchableRadius
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.action) {
      MotionEvent.ACTION_DOWN -> {
        // Bỏ qua DOWN ngoài vùng bubble — vùng đệm trong suốt 60dp mỗi bên
        // không được phép trigger drag (tránh "false-tap" khi user vô tình
        // chạm vào halo của window).
        if (!isOnVisibleBubble(event.x, event.y)) return false
        touchDownX = event.rawX
        touchDownY = event.rawY
        touchDownTimeMs = SystemClock.uptimeMillis()
        didDrag = false
        velocityTracker?.recycle()
        velocityTracker = VelocityTracker.obtain().also { it.addMovement(event) }
        postDelayed(longPressRunnable, longPressMs)
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        velocityTracker?.addMovement(event)
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
        val tracker = velocityTracker
        var vx = 0f; var vy = 0f
        if (tracker != null) {
          tracker.addMovement(event)
          tracker.computeCurrentVelocity(1000)
          vx = tracker.xVelocity
          vy = tracker.yVelocity
          tracker.recycle()
          velocityTracker = null
        }
        if (dragging) {
          dragging = false
          callback.onDragEnd(event.rawX, event.rawY, false, vx, vy)
        } else if (!didDrag) {
          val elapsed = SystemClock.uptimeMillis() - touchDownTimeMs
          if (elapsed < longPressMs) callback.onTap()
        }
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        removeCallbacks(longPressRunnable)
        velocityTracker?.recycle()
        velocityTracker = null
        if (dragging) {
          dragging = false
          callback.onDragEnd(event.rawX, event.rawY, false, 0f, 0f)
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

    /** Kích thước bong bóng nhìn thấy (dp). */
    const val VISIBLE_DP: Float = 60f
    /** Kích thước window thật (lớn hơn để đảm bảo finger không "thoát" lúc kéo). */
    const val WINDOW_DP: Float = 180f

    fun visibleSizePx(ctx: Context): Int =
      TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, VISIBLE_DP, ctx.resources.displayMetrics).toInt()

    fun windowSizePx(ctx: Context): Int =
      TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, WINDOW_DP, ctx.resources.displayMetrics).toInt()

    /**
     * LayoutParams cho overlay window. `windowSizePx` là kích thước WINDOW thật
     * (lớn hơn bubble visible để có vùng đệm cho drag), không phải bubble size.
     */
    fun makeLayoutParams(windowSizePx: Int, x: Int, y: Int): WindowManager.LayoutParams {
      val type = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
      return WindowManager.LayoutParams(
        windowSizePx, windowSizePx, x, y,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
          WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        android.graphics.PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = android.view.Gravity.TOP or android.view.Gravity.START
      }
    }
  }
}
