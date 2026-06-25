package vn.tubeppro.sxmobile.overlay

import android.content.Context
import android.graphics.Color

/** Bảng màu overlay chat — khớp `theme/index.ts` + `messengerTheme.ts`. */
object OverlayChatTheme {
  data class Palette(
    val bg: Int,
    val bgElevated: Int,
    val border: Int,
    val text: Int,
    val textMuted: Int,
    val textFaint: Int,
    val accent: Int,
    val accentSoft: Int,
    val bubbleOut: Int,
    val bubbleIn: Int,
    val bubbleInBorder: Int,
    val online: Int,
    val inputBg: Int,
    val iconBtnBg: Int,
  )

  private val AVATAR_PALETTE = intArrayOf(
    0xFFEC4899.toInt(),
    0xFF3B82F6.toInt(),
    0xFF10B981.toInt(),
    0xFFF59E0B.toInt(),
    0xFF8B5CF6.toInt(),
    0xFF06B6D4.toInt(),
    0xFFF97316.toInt(),
  )

  private val SENDER_PALETTE = intArrayOf(
    0xFFDB2777.toInt(),
    0xFFD97706.toInt(),
    0xFF2563EB.toInt(),
    0xFF7C3AED.toInt(),
    0xFF059669.toInt(),
    0xFFDC2626.toInt(),
    0xFF0891B2.toInt(),
    0xFFCA8A04.toInt(),
    0xFF9333EA.toInt(),
    0xFFEA580C.toInt(),
  )

  fun palette(ctx: Context): Palette {
    val mode = ctx.getSharedPreferences(OverlayBubbleService.PREF_NAME, Context.MODE_PRIVATE)
      .getString(PREF_UI_THEME, "dark")
      ?.trim()
      ?.lowercase()
    return if (mode == "light") lightPalette() else darkPalette()
  }

  private fun darkPalette() = Palette(
    bg = Color.parseColor("#0B0F17"),
    bgElevated = Color.parseColor("#10151F"),
    border = Color.parseColor("#232C3D"),
    text = Color.parseColor("#F1F5F9"),
    textMuted = Color.parseColor("#9AA7BD"),
    textFaint = Color.parseColor("#5E6B82"),
    accent = Color.parseColor("#2F6BFF"),
    accentSoft = Color.argb(41, 47, 107, 255),
    bubbleOut = Color.parseColor("#2F6BFF"),
    bubbleIn = Color.parseColor("#1E2636"),
    bubbleInBorder = Color.parseColor("#232C3D"),
    online = Color.parseColor("#22C55E"),
    inputBg = Color.parseColor("#161C28"),
    iconBtnBg = Color.parseColor("#1A1F28"),
  )

  private fun lightPalette() = Palette(
    bg = Color.parseColor("#F4F6FB"),
    bgElevated = Color.parseColor("#FFFFFF"),
    border = Color.parseColor("#E2E8F0"),
    text = Color.parseColor("#0F172A"),
    textMuted = Color.parseColor("#5A6B85"),
    textFaint = Color.parseColor("#94A3B8"),
    accent = Color.parseColor("#2563EB"),
    accentSoft = Color.argb(31, 37, 99, 235),
    bubbleOut = Color.parseColor("#2563EB"),
    bubbleIn = Color.parseColor("#EEF2F8"),
    bubbleInBorder = Color.parseColor("#E2E8F0"),
    online = Color.parseColor("#16A34A"),
    inputBg = Color.parseColor("#FFFFFF"),
    iconBtnBg = Color.parseColor("#F1F5F9"),
  )

  fun avatarColor(name: String): Int {
    var h = 0
    for (c in name) h = (h + c.code * 17) % AVATAR_PALETTE.size
    return AVATAR_PALETTE[h]
  }

  fun senderColor(userId: String, fallbackName: String): Int {
    val key = userId.ifBlank { fallbackName.ifBlank { "?" } }
    var h = 0
    for (c in key) h = (h + c.code * 13) % SENDER_PALETTE.size
    return SENDER_PALETTE[h]
  }

  fun initials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    if (parts.size == 1) return parts[0].take(2).uppercase()
    return "${parts.first().firstOrNull() ?: ""}${parts.last().firstOrNull() ?: ""}".uppercase()
  }

  fun bubbleBackground(
    mine: Boolean,
    c: Palette,
    dp: (Int) -> Int,
  ): android.graphics.drawable.GradientDrawable {
    val r = dp(18).toFloat()
    val tail = dp(4).toFloat()
    val gd = android.graphics.drawable.GradientDrawable()
    gd.shape = android.graphics.drawable.GradientDrawable.RECTANGLE
    gd.setColor(if (mine) c.bubbleOut else c.bubbleIn)
    gd.cornerRadii = if (mine) {
      floatArrayOf(r, r, r, r, tail, tail, r, r)
    } else {
      floatArrayOf(r, r, r, r, r, r, tail, tail)
    }
    if (!mine) gd.setStroke(dp(1), c.bubbleInBorder)
    return gd
  }

  fun circleBg(color: Int, dp: (Int) -> Int): android.graphics.drawable.GradientDrawable {
    val gd = android.graphics.drawable.GradientDrawable()
    gd.shape = android.graphics.drawable.GradientDrawable.OVAL
    gd.setColor(color)
    return gd
  }

  fun roundedRect(
    color: Int,
    radiusDp: Int,
    dp: (Int) -> Int,
    stroke: Int? = null,
  ): android.graphics.drawable.GradientDrawable {
    val gd = android.graphics.drawable.GradientDrawable()
    gd.shape = android.graphics.drawable.GradientDrawable.RECTANGLE
    gd.cornerRadius = dp(radiusDp).toFloat()
    gd.setColor(color)
    stroke?.let { gd.setStroke(dp(1), it) }
    return gd
  }

  fun iconButtonBg(c: Palette, dp: (Int) -> Int) = circleBg(c.iconBtnBg, dp)
  fun sendButtonBg(c: Palette, dp: (Int) -> Int) = circleBg(c.accent, dp)
  fun plusButtonBg(c: Palette, dp: (Int) -> Int) = circleBg(c.accentSoft, dp)

  const val PREF_UI_THEME = "ui_theme"
}
