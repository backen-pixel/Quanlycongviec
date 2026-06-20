package vn.tubeppro.crmobilev2.overlay

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

/** Activity trong suốt — chọn ảnh/video/file hoặc chụp/quay. */
class BubbleMediaPickerActivity : Activity() {
  private var cameraUri: Uri? = null
  private var cameraFile: File? = null
  private var videoFile: File? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    when (intent.getStringExtra(BubbleMediaBridge.EXTRA_MODE)) {
      BubbleMediaBridge.MODE_GALLERY -> pickContent("image/*", true)
      BubbleMediaBridge.MODE_VIDEO -> pickContent("video/*", false)
      BubbleMediaBridge.MODE_FILE -> pickContent("*/*", true)
      BubbleMediaBridge.MODE_CAMERA -> takePhoto()
      BubbleMediaBridge.MODE_RECORD -> recordVideo()
      else -> finishCancel()
    }
  }

  private fun pickContent(type: String, allowMultiple: Boolean) {
    val intents = ArrayList<Intent>()
    intents.add(Intent(Intent.ACTION_GET_CONTENT).apply {
      this.type = type
      addCategory(Intent.CATEGORY_OPENABLE)
      if (allowMultiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    })
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      intents.add(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        this.type = type
        addCategory(Intent.CATEGORY_OPENABLE)
        if (allowMultiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          putExtra(Intent.EXTRA_LOCAL_ONLY, true)
        }
      })
    }
    if (type.startsWith("image/") || type.startsWith("video/")) {
      intents.add(Intent(Intent.ACTION_PICK).apply {
        this.type = type
        if (allowMultiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      })
    }
    val launch = intents.first()
    @Suppress("DEPRECATION")
    startActivityForResult(
      if (intents.size == 1) {
        Intent.createChooser(launch, "Chọn")
      } else {
        Intent.createChooser(launch, "Chọn").apply {
          putExtra(Intent.EXTRA_INITIAL_INTENTS, intents.drop(1).toTypedArray())
        }
      },
      REQ_PICK,
    )
  }

  private fun takePhoto() {
    val file = File(cacheDir, "bubble_cam_${System.currentTimeMillis()}.jpg")
    cameraFile = file
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
    val file = File(cacheDir, "bubble_vid_${System.currentTimeMillis()}.mp4")
    videoFile = file
    val uri = FileProvider.getUriForFile(this, "${packageName}.bubblefileprovider", file)
    val i = Intent(MediaStore.ACTION_VIDEO_CAPTURE).apply {
      putExtra(MediaStore.EXTRA_OUTPUT, uri)
      putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1)
      addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
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
        val file = cameraFile
        if (file != null && file.exists() && file.length() > 0L) {
          deliver(listOf(BubbleChatApi.pendingFileFromCache(file, "photo.jpg", "image/jpeg")))
        } else finishCancel()
      }
      REQ_VIDEO -> {
        val file = videoFile
        if (file != null && file.exists() && file.length() > 0L) {
          deliver(listOf(BubbleChatApi.pendingFileFromCache(file, "video.mp4", "video/mp4")))
        } else {
          val uri = data?.data
          if (uri != null) {
            val name = queryName(uri) ?: "video.mp4"
            val mime = mimeOf(uri, name, "video/mp4")
            deliver(listOf(copyToCache(uri, name, mime)))
          } else finishCancel()
        }
      }
      else -> finishCancel()
    }
  }

  private fun deliverFromPick(data: Intent?) {
    val out = ArrayList<BubbleChatApi.PendingFile>()
    try {
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
    } catch (_: Exception) {
      finishCancel()
      return
    }
    if (out.isEmpty()) finishCancel() else deliver(out)
  }

  private fun fileOf(uri: Uri): BubbleChatApi.PendingFile {
    val name = queryName(uri) ?: "file_${System.currentTimeMillis()}"
    val mime = mimeOf(uri, name, "application/octet-stream")
    return copyToCache(uri, name, mime)
  }

  /** Copy sang cache app — đọc bằng File path, không phụ thuộc URI grant. */
  private fun copyToCache(uri: Uri, name: String, mime: String): BubbleChatApi.PendingFile {
    val normalized = BubbleChatApi.normalizeMime(mime, name)
    val ext = name.substringAfterLast('.', "").ifBlank {
      MimeTypeMap.getSingleton().getExtensionFromMimeType(normalized) ?: "bin"
    }
    val dest = File(cacheDir, "bubble_pick_${System.currentTimeMillis()}.$ext")
    contentResolver.openInputStream(uri)?.use { input ->
      dest.outputStream().use { output -> input.copyTo(output) }
    } ?: throw IllegalStateException("Không đọc được file đã chọn")
    if (!dest.exists() || dest.length() <= 0L) {
      throw IllegalStateException("File đã chọn rỗng")
    }
    return BubbleChatApi.pendingFileFromCache(dest, name, normalized)
  }

  private fun queryName(uri: Uri): String? {
    return try {
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { c ->
          if (c.moveToFirst()) c.getString(0) else null
        }
    } catch (_: Exception) {
      null
    }
  }

  private fun mimeOf(uri: Uri, name: String, fallback: String): String {
    val raw = contentResolver.getType(uri)
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(
        MimeTypeMap.getFileExtensionFromUrl(uri.toString()),
      )
      ?: fallback
    return BubbleChatApi.normalizeMime(raw, name)
  }

  private fun deliver(files: List<BubbleChatApi.PendingFile>) {
    BubbleMediaBridge.deliver(files)
    finish()
  }

  private fun finishCancel() {
    BubbleMediaBridge.cancel()
    finish()
  }

  override fun onDestroy() {
    BubbleMediaBridge.ensurePanelResumedAfterPicker()
    super.onDestroy()
  }

  companion object {
    private const val REQ_PICK = 701
    private const val REQ_CAMERA = 702
    private const val REQ_VIDEO = 703
  }
}
