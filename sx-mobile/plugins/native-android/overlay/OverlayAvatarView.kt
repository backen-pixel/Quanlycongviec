package vn.tubeppro.sxmobile.overlay

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.LruCache
import android.view.View
import android.view.ViewOutlineProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Bộ nhớ đệm avatar dùng chung cho bong bóng, thẻ xem trước và khung chat overlay.
 *
 * - Bộ nhớ trong (LruCache) + đĩa (cacheDir/avatars): mở lại khung chat là có ảnh ngay, không tải lại.
 * - Giải mã THU NHỎ (≤ ~256px) thay vì ảnh gốc đầy đủ — nhanh và nhẹ RAM.
 * - Cùng một URL chỉ tải một lần dù nhiều view cùng xin; tải lỗi được nhớ 60 giây để không thử lại liên tục.
 * Mọi lệnh gọi/callback đều chạy trên luồng chính.
 */
object OverlayAvatarCache {
  private const val DECODE_PX = 256
  private const val DISK_LIMIT_BYTES = 24L * 1024 * 1024
  private const val FAIL_TTL_MS = 60_000L
  private const val MAX_BYTES = 64L * 1024 * 1024

  private val main = Handler(Looper.getMainLooper())
  private val mem = object : LruCache<String, Bitmap>(10 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
  }
  private val failedAt = HashMap<String, Long>()
  private val waiting = HashMap<String, ArrayList<(Bitmap?) -> Unit>>()
  private val pool = Executors.newFixedThreadPool(3)

  /** Ảnh đã có sẵn trong RAM (hoặc null). */
  fun peek(ctx: Context, rawUrl: String?): Bitmap? {
    val url = BubbleChatApi.resolveAvatarUrl(ctx, rawUrl)
    return if (url.isBlank()) null else mem.get(url)
  }

  /** Xin ảnh; callback được gọi ngay (nếu đã có) hoặc sau khi tải xong. Bitmap null = lỗi/không có ảnh. */
  fun load(ctx: Context, rawUrl: String?, cb: (Bitmap?) -> Unit) {
    val url = BubbleChatApi.resolveAvatarUrl(ctx, rawUrl)
    if (url.isBlank()) { cb(null); return }
    mem.get(url)?.let { cb(it); return }
    val failed = failedAt[url]
    if (failed != null && System.currentTimeMillis() - failed < FAIL_TTL_MS) { cb(null); return }
    val list = waiting[url]
    if (list != null) { list.add(cb); return }
    waiting[url] = arrayListOf(cb)
    val app = ctx.applicationContext
    pool.execute {
      val bmp = try { fetch(app, url) } catch (_: Throwable) { null }
      main.post {
        if (bmp != null) mem.put(url, bmp) else failedAt[url] = System.currentTimeMillis()
        waiting.remove(url)?.forEach { it(bmp) }
      }
    }
  }

  /** Tải sẵn (không cần callback) — gọi khi biết sắp cần avatar. */
  fun prefetch(ctx: Context, rawUrl: String?) = load(ctx, rawUrl) { }

  private const val TAG = "SxAvatar"

  /**
   * Quy trình: (1) có bản NHỎ đã lưu → dùng ngay; (2) chưa có → tải bản gốc xuống tệp tạm (avatar thật có thể là PNG hàng chục MB,
   * vd. ảnh chụp màn hình dùng làm avatar), giải mã THU NHỎ bằng inSampleSize (không nạp cả ảnh vào RAM), rồi chỉ lưu bản nhỏ
   * (≤ ~512px) để các lần sau mở là có ngay. Thư mục lưu nằm ở filesDir chứ không phải cacheDir vì một số máy (vd. Vivo) tự dọn
   * cacheDir bất cứ lúc nào.
   */
  private fun fetch(ctx: Context, url: String): Bitmap? {
    val dir = File(ctx.filesDir, "avatars").apply { mkdirs() }
    val key = sha1(url)
    val small = File(dir, "$key.s")

    // (1) Bản nhỏ đã lưu.
    if (small.exists() && small.length() > 0L) {
      val cached = try { BitmapFactory.decodeFile(small.absolutePath) } catch (_: Throwable) { null }
      if (cached != null) {
        small.setLastModified(System.currentTimeMillis())
        return cached
      }
      small.delete()
    }

    // (2) Tải bản gốc → giải mã thu nhỏ → lưu bản nhỏ.
    val raw = File(dir, "$key.dl")
    try {
      if (url.startsWith("data:", ignoreCase = true)) {
        val bytes = dataUriBytes(url) ?: return null
        raw.writeBytes(bytes)
      } else if (!downloadWithRetry(url, raw)) {
        return null
      }
      val bmp = decodeFileScaled(raw)
      if (bmp == null) {
        log("không giải mã được ảnh (${raw.length()}B, định dạng không hỗ trợ? vd. SVG): ${shortUrl(url)}")
        return null
      }
      Log.d(TAG, "OK gốc ${raw.length()}B → ${bmp.width}x${bmp.height} ${shortUrl(url)}")
      try {
        val tmp = File(dir, "$key.s.tmp")
        tmp.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        if (!tmp.renameTo(small)) tmp.delete()
        trimDisk(dir)
      } catch (_: Exception) { }
      return bmp
    } finally {
      try { raw.delete() } catch (_: Exception) { }
    }
  }

  /** Log LỖI tải/giải mã avatar. Vivo và một số ROM ẩn log Info/Warn của app, chỉ cho Error lọt ra — nên dùng mức Error. */
  private fun log(msg: String) { Log.e(TAG, msg) }

  private fun shortUrl(u: String): String = if (u.length > 140) u.take(140) + "…" else u

  /** Ảnh nhúng sẵn dạng data:image/...;base64,... */
  private fun dataUriBytes(uri: String): ByteArray? = try {
    val comma = uri.indexOf(',')
    if (comma < 0 || !uri.substring(0, comma).contains("base64", ignoreCase = true)) null
    else android.util.Base64.decode(uri.substring(comma + 1), android.util.Base64.DEFAULT)
  } catch (e: Exception) {
    log("data URI lỗi: ${e.message}")
    null
  }

  /** Tải có thử lại một lần (mạng/máy chủ Render vừa thức dậy thường chậm ở lần đầu). */
  private fun downloadWithRetry(url: String, out: File): Boolean {
    for (attempt in 1..2) {
      try {
        if (download(url, out)) return true
      } catch (e: Exception) {
        log("tải lỗi (lần $attempt): ${e.javaClass.simpleName} ${e.message} — ${shortUrl(url)}")
      }
    }
    return false
  }

  /** Tải một URL xuống tệp, tự theo dõi chuyển hướng (kể cả http ↔ https mà HttpURLConnection mặc định không theo). */
  private fun download(startUrl: String, out: File): Boolean {
    var cur = encodeUrl(startUrl)
    for (hop in 0..5) {
      val conn = URL(cur).openConnection() as HttpURLConnection
      try {
        conn.connectTimeout = 10_000
        conn.readTimeout = 20_000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("Accept", "image/*,*/*;q=0.8")
        conn.setRequestProperty("User-Agent", "SxMobile-Overlay/1.0")
        val code = conn.responseCode
        if (code in intArrayOf(301, 302, 303, 307, 308)) {
          val loc = conn.getHeaderField("Location")
          if (loc.isNullOrBlank()) { log("chuyển hướng $code không có Location: ${shortUrl(cur)}"); return false }
          cur = encodeUrl(URL(URL(cur), loc).toString())
          continue
        }
        if (code !in 200..299) {
          log("HTTP $code: ${shortUrl(cur)}")
          return false
        }
        var total = 0L
        conn.inputStream.use { input ->
          out.outputStream().use { o ->
            val buf = ByteArray(32 * 1024)
            while (true) {
              val n = input.read(buf)
              if (n < 0) break
              o.write(buf, 0, n)
              total += n
              if (total > MAX_BYTES) { log("ảnh quá lớn (>${MAX_BYTES}B): ${shortUrl(cur)}"); return false }
            }
          }
        }
        return total > 0L
      } finally {
        conn.disconnect()
      }
    }
    log("quá nhiều lần chuyển hướng: ${shortUrl(startUrl)}")
    return false
  }

  /** Mã hoá phần trăm các ký tự không hợp lệ trong URL (dấu cách, tiếng Việt…) nhưng giữ nguyên các %XX đã có. */
  private fun encodeUrl(url: String): String {
    val safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&'()*+,;=%"
    val sb = StringBuilder(url.length + 16)
    for (ch in url) {
      if (safe.indexOf(ch) >= 0) sb.append(ch)
      else for (b in ch.toString().toByteArray(Charsets.UTF_8)) sb.append('%').append("%02X".format(b.toInt() and 0xFF))
    }
    return sb.toString()
  }

  /** Giải mã thu nhỏ trực tiếp từ tệp: cạnh ngắn nhất còn trong [256, 512) px. */
  private fun decodeFileScaled(file: File): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= DECODE_PX) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeFile(file.absolutePath, opts)
  }

  private fun trimDisk(dir: File) {
    val files = dir.listFiles() ?: return
    val now = System.currentTimeMillis()
    for (f in files) if ((f.name.endsWith(".dl") || f.name.endsWith(".tmp")) && now - f.lastModified() > 10 * 60_000L) f.delete()
    var total = files.sumOf { it.length() }
    if (total <= DISK_LIMIT_BYTES) return
    for (f in files.sortedBy { it.lastModified() }) {
      if (total <= DISK_LIMIT_BYTES / 2) break
      total -= f.length()
      f.delete()
    }
  }

  private fun sha1(s: String): String =
    MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}

/**
 * Avatar tròn tự vẽ: nền chuyển sắc + chữ cái viết tắt, khi ảnh về thì vẽ ảnh (cắt giữa) trong hình tròn.
 * Vẽ thẳng vào canvas nên hình luôn tròn đủ, không bị cắt bởi khung cha và không cần thêm lớp View nào.
 */
class OverlayAvatarView(context: Context) : View(context) {
  private var initials = "?"
  private var colorA = 0xFFFF416C.toInt()
  private var colorB = 0xFF8A2387.toInt()
  private var textSp = 12f
  private var strokeWidthPx = 0f
  private var strokeColor = Color.WHITE
  private var bitmap: Bitmap? = null
  private var bmpShader: BitmapShader? = null
  private var wantedUrl = ""

  private val gradPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val bmpPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    textAlign = Paint.Align.CENTER
  }
  private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private var shaderW = -1
  private var shaderH = -1

  init {
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setOval(0, 0, view.width, view.height)
      }
    }
  }

  /** Kiểu hiển thị: cặp màu nền, cỡ chữ, viền (dp). */
  fun style(a: Int, b: Int, textSizeSp: Float, strokeDp: Float = 0f, stroke: Int = Color.WHITE): OverlayAvatarView {
    colorA = a
    colorB = b
    textSp = textSizeSp
    strokeWidthPx = strokeDp * resources.displayMetrics.density
    strokeColor = stroke
    shaderW = -1
    invalidate()
    return this
  }

  /** Đặt tên (cho chữ cái) và URL ảnh (có thể rỗng → chỉ hiện chữ cái). */
  fun setAvatar(url: String?, name: String): OverlayAvatarView {
    initials = OverlayChatTheme.initials(name)
    val u = url?.trim().orEmpty()
    if (u != wantedUrl) {
      wantedUrl = u
      bitmap = null
      bmpShader = null
    }
    invalidate()
    if (u.isNotBlank() && bitmap == null) {
      OverlayAvatarCache.load(context, u) { bmp ->
        if (wantedUrl == u && bmp != null) {
          bitmap = bmp
          bmpShader = null
          invalidate()
        }
      }
    }
    return this
  }

  override fun onDraw(canvas: Canvas) {
    val w = width
    val h = height
    if (w <= 0 || h <= 0) return
    if (shaderW != w || shaderH != h) {
      gradPaint.shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(), colorA, colorB, Shader.TileMode.CLAMP)
      shaderW = w
      shaderH = h
      bmpShader = null
    }
    val inset = strokeWidthPx / 2f
    val cx = w / 2f
    val cy = h / 2f
    val r = minOf(w, h) / 2f - inset
    canvas.drawCircle(cx, cy, r, gradPaint)

    val b = bitmap
    if (b != null) {
      var sh = bmpShader
      if (sh == null) {
        sh = BitmapShader(b, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        val scale = maxOf(w.toFloat() / b.width, h.toFloat() / b.height)
        val m = Matrix()
        m.setScale(scale, scale)
        m.postTranslate((w - b.width * scale) / 2f, (h - b.height * scale) / 2f)
        sh.setLocalMatrix(m)
        bmpShader = sh
        bmpPaint.shader = sh
      }
      canvas.drawCircle(cx, cy, r, bmpPaint)
    } else {
      textPaint.textSize = textSp * resources.displayMetrics.scaledDensity
      val fm = textPaint.fontMetrics
      canvas.drawText(initials, cx, cy - (fm.ascent + fm.descent) / 2f, textPaint)
    }

    if (strokeWidthPx > 0f) {
      ringPaint.strokeWidth = strokeWidthPx
      ringPaint.color = strokeColor
      canvas.drawCircle(cx, cy, r, ringPaint)
    }
  }
}
