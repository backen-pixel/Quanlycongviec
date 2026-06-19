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
  private var visibilityHook: ((Boolean) -> Unit)? = null

  fun registerVisibilityHook(hook: (Boolean) -> Unit) {
    visibilityHook = hook
  }

  fun clearVisibilityHook() {
    visibilityHook = null
  }

  fun pick(ctx: Context, mode: String, onResult: (List<BubbleChatApi.PendingFile>) -> Unit) {
    callback = onResult
    visibilityHook?.invoke(false)
    val i = Intent(ctx, BubbleMediaPickerActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      putExtra(EXTRA_MODE, mode)
    }
    ctx.startActivity(i)
  }

  internal fun deliver(files: List<BubbleChatApi.PendingFile>) {
    handler.post {
      visibilityHook?.invoke(true)
      callback?.invoke(files)
      callback = null
    }
  }

  internal fun cancel() {
    handler.post {
      visibilityHook?.invoke(true)
      callback?.invoke(emptyList())
      callback = null
    }
  }
}
