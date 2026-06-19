package vn.tubeppro.crmobilev2.overlay

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

/** Activity trong suốt — chọn ảnh/video/file hoặc chụp/quay. */
class BubbleMediaPickerActivity : Activity() {
  private var cameraUri: Uri? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.setLayout(
      android.view.WindowManager.LayoutParams.MATCH_PARENT,
      android.view.WindowManager.LayoutParams.MATCH_PARENT,
    )
    when (intent.getStringExtra(BubbleMediaBridge.EXTRA_MODE)) {
      BubbleMediaBridge.MODE_GALLERY -> pickContent("image/*", false)
      BubbleMediaBridge.MODE_VIDEO -> pickContent("video/*", false)
      BubbleMediaBridge.MODE_FILE -> pickContent("*/*", true)
      BubbleMediaBridge.MODE_CAMERA -> takePhoto()
      BubbleMediaBridge.MODE_RECORD -> recordVideo()
      else -> finishCancel()
    }
  }

  private fun pickContent(type: String, allowMultiple: Boolean) {
    val i = Intent(Intent.ACTION_GET_CONTENT).apply {
      this.type = type
      addCategory(Intent.CATEGORY_OPENABLE)
      if (allowMultiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }
    @Suppress("DEPRECATION")
    startActivityForResult(Intent.createChooser(i, "Chọn"), REQ_PICK)
  }

  private fun takePhoto() {
    val file = File(cacheDir, "bubble_cam_${System.currentTimeMillis()}.jpg")
    val uri = FileProvider.getUriForFile(this, "${packageName}.bubblefileprovider", file)
    cameraUri = uri
    val i = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
      putExtra(MediaStore.EXTRA_OUTPUT, uri)
      addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    @Suppress("DEPRECATION")
    startActivityForResult(i, REQ_CAMERA)
  }

  private fun recordVideo() {
    val i = Intent(MediaStore.ACTION_VIDEO_CAPTURE)
    @Suppress("DEPRECATION")
    startActivityForResult(i, REQ_VIDEO)
  }

  @Deprecated("Deprecated in Java")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (resultCode != RESULT_OK) {
      finishCancel()
      return
    }
    when (requestCode) {
      REQ_PICK -> deliverFromPick(data)
      REQ_CAMERA -> {
        val uri = cameraUri
        if (uri != null) {
          deliver(listOf(BubbleChatApi.PendingFile(uri, "photo.jpg", "image/jpeg")))
        } else finishCancel()
      }
      REQ_VIDEO -> {
        val uri = data?.data
        if (uri != null) {
          val name = queryName(uri) ?: "video.mp4"
          deliver(listOf(BubbleChatApi.PendingFile(uri, name, mimeOf(uri, "video/mp4"))))
        } else finishCancel()
      }
      else -> finishCancel()
    }
  }

  private fun deliverFromPick(data: Intent?) {
    val out = ArrayList<BubbleChatApi.PendingFile>()
    val clip = data?.clipData
    if (clip != null) {
      for (i in 0 until clip.itemCount) {
        val uri = clip.getItemAt(i).uri ?: continue
        out.add(fileOf(uri))
      }
    } else {
      val uri = data?.data
      if (uri != null) out.add(fileOf(uri))
    }
    if (out.isEmpty()) finishCancel() else deliver(out)
  }

  private fun fileOf(uri: Uri): BubbleChatApi.PendingFile {
    val name = queryName(uri) ?: "file_${System.currentTimeMillis()}"
    return BubbleChatApi.PendingFile(uri, name, mimeOf(uri, "application/octet-stream"))
  }

  private fun queryName(uri: Uri): String? {
    return try {
      contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { c ->
          if (c.moveToFirst()) c.getString(0) else null
        }
    } catch (_: Exception) {
      null
    }
  }

  private fun mimeOf(uri: Uri, fallback: String): String {
    return contentResolver.getType(uri)
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(
        MimeTypeMap.getFileExtensionFromUrl(uri.toString()),
      )
      ?: fallback
  }

  private fun deliver(files: List<BubbleChatApi.PendingFile>) {
    BubbleMediaBridge.deliver(files)
    finish()
  }

  private fun finishCancel() {
    BubbleMediaBridge.cancel()
    finish()
  }

  companion object {
    private const val REQ_PICK = 701
    private const val REQ_CAMERA = 702
    private const val REQ_VIDEO = 703
  }
}
