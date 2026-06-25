package vn.tubeppro.sxmobile.overlay

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import java.lang.ref.WeakReference

/** Mở composer trong Activity (adjustResize) — bàn phím hoạt động giống chat trong app. */
object BubbleComposeBridge {
  const val EXTRA_GROUP_ID = "group_id"
  const val EXTRA_REPLY_ID = "reply_id"
  const val EXTRA_REPLY_SENDER = "reply_sender"
  const val EXTRA_REPLY_TEXT = "reply_text"
  const val EXTRA_SHOW_ATTACH = "show_attach"

  data class ComposeRequest(
    val replyId: String? = null,
    val replySender: String? = null,
    val replyText: String? = null,
    val showAttach: Boolean = false,
  )

  private val handler = Handler(Looper.getMainLooper())
  @Volatile
  private var activePanel: OverlayChatPanel? = null
  @Volatile
  private var composeOpen = false
  private var composeActivityRef: WeakReference<BubbleComposeActivity>? = null

  fun registerPanel(panel: OverlayChatPanel?) {
    activePanel = panel
  }

  internal fun registerComposeActivity(activity: BubbleComposeActivity?) {
    composeActivityRef = activity?.let { WeakReference(it) }
    composeOpen = activity != null
  }

  fun isComposeOpen(): Boolean = composeOpen

  fun open(ctx: Context, groupId: String, request: ComposeRequest = ComposeRequest()) {
    if (groupId.isBlank()) return
    if (composeOpen) {
      composeActivityRef?.get()?.bringToFront()
      return
    }
    activePanel?.suspendForCompose()
    val i = Intent(ctx, BubbleComposeActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_GROUP_ID, groupId)
      if (!request.replyId.isNullOrBlank()) putExtra(EXTRA_REPLY_ID, request.replyId)
      if (!request.replySender.isNullOrBlank()) putExtra(EXTRA_REPLY_SENDER, request.replySender)
      if (!request.replyText.isNullOrBlank()) putExtra(EXTRA_REPLY_TEXT, request.replyText)
      if (request.showAttach) putExtra(EXTRA_SHOW_ATTACH, true)
    }
    ctx.startActivity(i)
  }

  /** Đóng compose trước khi huỷ panel (expand / close chat). */
  fun dismissComposeIfOpen() {
    composeActivityRef?.get()?.finishFromBridge()
  }

  internal fun onComposeClosed(refresh: Boolean) {
    composeOpen = false
    composeActivityRef = null
    handler.post {
      activePanel?.resumeAfterCompose(refresh)
    }
  }
}
