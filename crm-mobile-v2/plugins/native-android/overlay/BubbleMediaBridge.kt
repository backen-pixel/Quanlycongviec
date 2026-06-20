package vn.tubeppro.crmobilev2.overlay

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper

/** Bridge chọn media từ Activity (Service không mở camera trực tiếp). */
object BubbleMediaBridge {
  const val EXTRA_MODE = "mode"
  const val MODE_GALLERY = "gallery"
  const val MODE_VIDEO = "video"
  const val MODE_FILE = "file"
  const val MODE_CAMERA = "camera"
  const val MODE_RECORD = "record"

  private val handler = Handler(Looper.getMainLooper())
  private var callback: ((List<BubbleChatApi.PendingFile>) -> Unit)? = null
  @Volatile
  private var activePanel: OverlayChatPanel? = null
  @Volatile
  private var suspendedPanelForPick = false

  fun registerPanel(panel: OverlayChatPanel?) {
    activePanel = panel
  }

  fun pick(
    ctx: Context,
    mode: String,
    suspendPanel: Boolean = true,
    onResult: (List<BubbleChatApi.PendingFile>) -> Unit,
  ) {
    callback = onResult
    suspendedPanelForPick = suspendPanel
    if (suspendPanel) activePanel?.prepareForExternalPicker()
    val i = Intent(ctx, BubbleMediaPickerActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      putExtra(EXTRA_MODE, mode)
    }
    ctx.startActivity(i)
  }

  internal fun deliver(files: List<BubbleChatApi.PendingFile>) {
    handler.post {
      finishPick(files)
    }
  }

  internal fun cancel() {
    handler.post {
      finishPick(emptyList())
    }
  }

  private fun finishPick(files: List<BubbleChatApi.PendingFile>) {
    val shouldResume = suspendedPanelForPick
    val panel = activePanel
    val cb = callback
    suspendedPanelForPick = false
    callback = null
    if (shouldResume) panel?.resumeAfterExternalPicker()
    cb?.invoke(files)
  }

  /** Fallback khi Activity picker đóng — đảm bảo panel overlay được gắn lại. */
  internal fun ensurePanelResumedAfterPicker() {
    handler.post {
      if (!suspendedPanelForPick) {
        activePanel?.let { panel ->
          if (panel.isAlive() && !panel.isVisibleOnScreen()) {
            panel.resumeAfterExternalPicker()
          }
        }
        return@post
      }
      suspendedPanelForPick = false
      activePanel?.resumeAfterExternalPicker()
    }
    handler.postDelayed({ activePanel?.resumeAfterExternalPicker() }, 200)
  }
}
