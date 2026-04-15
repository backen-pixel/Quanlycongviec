package vn.tubep.voicesync

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.CompoundButton
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import kotlinx.coroutines.launch
import org.json.JSONObject
import vn.tubep.voicesync.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var adapter: RecordingsAdapter

    private var recording = false
    private var mediaRecorder: MediaRecorder? = null
    private var micFile: File? = null

    private val pickAudio = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@registerForActivityResult
        lifecycleScope.launch {
            try {
                val temp = File(cacheDir, "pick_${System.currentTimeMillis()}.tmp")
                contentResolver.openInputStream(uri)?.use { input ->
                    temp.outputStream().use { input.copyTo(it) }
                } ?: run {
                    toast("Không đọc được file")
                    return@launch
                }
                var name = "upload.m4a"
                contentResolver.query(uri, null, null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (i >= 0) {
                            val n = c.getString(i)
                            if (!n.isNullOrBlank()) name = n
                        }
                    }
                }
                val mime = contentResolver.getType(uri) ?: "application/octet-stream"
                val res = VoiceRepository.uploadAudioFile(
                    this@MainActivity,
                    temp,
                    mime,
                    name,
                    phoneNumber = null,
                    direction = null,
                    callStartedMs = null,
                    callEndedMs = null,
                    externalCallId = null,
                    source = "android_pick",
                )
                temp.delete()
                if (res.isSuccess) {
                    toast("Đã tải lên")
                    loadList()
                } else toast(res.exceptionOrNull()?.message ?: "Lỗi upload")
            } catch (e: Exception) {
                toast(e.message ?: "Lỗi")
            }
        }
    }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            updateUiAuth()
            loadList()
        }

    private val monitorSwitchListener = CompoundButton.OnCheckedChangeListener { _, checked ->
        if (checked) {
            if (!hasAllMonitorPerms()) {
                binding.switchBgMonitor.isChecked = false
                toast("Cấp đủ quyền (Micro, Điện thoại, Nhật ký cuộc gọi…)")
                return@OnCheckedChangeListener
            }
            ContextCompat.startForegroundService(this, Intent(this, CallMonitorService::class.java))
            toast("Đã bật theo dõi nền")
        } else {
            startService(Intent(this, CallMonitorService::class.java).apply { action = CallMonitorService.ACTION_STOP })
            toast("Đã tắt theo dõi")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = getSharedPreferences("voice_sync", MODE_PRIVATE)
        binding.editBaseUrl.setText(prefs.getString("base_url", "http://10.0.2.2:4000"))
        binding.editEmail.setText(prefs.getString("email", ""))
        binding.editPassword.setText(prefs.getString("password", ""))

        adapter = RecordingsAdapter(
            baseUrl = { VoiceRepository.baseUrl(this) },
            onDelete = { row ->
                AlertDialog.Builder(this)
                    .setTitle("Xóa bản ghi?")
                    .setPositiveButton("Xóa") { _, _ ->
                        lifecycleScope.launch {
                            val r = VoiceRepository.deleteRecording(this@MainActivity, row.id)
                            if (r.isSuccess) {
                                toast("Đã xóa")
                                loadList()
                            } else toast(r.exceptionOrNull()?.message ?: "Lỗi")
                        }
                    }
                    .setNegativeButton(android.R.string.cancel, null)
                    .show()
            },
        )
        binding.recyclerRecordings.layoutManager = LinearLayoutManager(this)
        binding.recyclerRecordings.adapter = adapter

        binding.btnPermissions.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle(R.string.perm_title)
                .setMessage(R.string.perm_message)
                .setPositiveButton(R.string.btn_grant) { _, _ ->
                    permissionLauncher.launch(permissionsNeeded())
                }
                .show()
        }

        binding.btnLogin.setOnClickListener {
            val base = binding.editBaseUrl.text?.toString()?.trim()?.trimEnd('/') ?: return@setOnClickListener
            val email = binding.editEmail.text?.toString()?.trim() ?: return@setOnClickListener
            val pass = binding.editPassword.text?.toString() ?: return@setOnClickListener
            lifecycleScope.launch {
                val r = VoiceRepository.login(this@MainActivity, base, email, pass)
                if (r.isSuccess) {
                    toast("Đăng nhập OK")
                    updateUiAuth()
                    loadList()
                } else toast(r.exceptionOrNull()?.message ?: "Lỗi đăng nhập")
            }
        }

        binding.switchBgMonitor.setOnCheckedChangeListener(monitorSwitchListener)

        binding.btnPickAudio.setOnClickListener { pickAudio.launch("audio/*") }
        binding.btnRecord.setOnClickListener { toggleMicRecord() }

        binding.swipeRefresh.setOnRefreshListener { loadList() }

        updateUiAuth()
        loadList()
    }

    override fun onResume() {
        super.onResume()
        if (::binding.isInitialized) {
            binding.switchBgMonitor.setOnCheckedChangeListener(null)
            binding.switchBgMonitor.isChecked = CallMonitorService.running
            binding.switchBgMonitor.setOnCheckedChangeListener(monitorSwitchListener)
        }
    }

    private fun permissionsNeeded(): Array<String> {
        val list = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
        )
        if (Build.VERSION.SDK_INT >= 33) {
            list.add(Manifest.permission.READ_MEDIA_AUDIO)
            list.add(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            list.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        return list.toTypedArray()
    }

    private fun hasAllMonitorPerms(): Boolean =
        permissionsNeeded().all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }

    private fun updateUiAuth() {
        val ok = getSharedPreferences("voice_sync", MODE_PRIVATE).getString("token", "")?.isNotBlank() == true
        binding.btnPickAudio.isEnabled = ok
        binding.btnRecord.isEnabled = ok
        binding.switchBgMonitor.isEnabled = ok
    }

    private fun loadList() {
        val loggedIn = getSharedPreferences("voice_sync", MODE_PRIVATE).getString("token", "")?.isNotBlank() == true
        if (!loggedIn) {
            binding.swipeRefresh.isRefreshing = false
            adapter.setData(emptyList())
            binding.textStatus.text = "Đăng nhập để xem danh sách."
            return
        }
        binding.swipeRefresh.isRefreshing = true
        lifecycleScope.launch {
            val res = VoiceRepository.listRecordingsJson(this@MainActivity)
            binding.swipeRefresh.isRefreshing = false
            if (res.isSuccess) {
                adapter.setData(parseRecordings(res.getOrNull().orEmpty()))
                binding.textStatus.text = "Đã tải ${adapter.itemCount} bản ghi."
            } else {
                binding.textStatus.text = res.exceptionOrNull()?.message ?: "Lỗi tải danh sách"
            }
        }
    }

    private fun parseRecordings(json: String): List<RecordingRow> {
        return try {
            val root = JSONObject(json)
            val arr = root.optJSONArray("recordings") ?: return emptyList()
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                RecordingRow(
                    id = o.optString("id"),
                    fileName = o.optString("file_name"),
                    storagePath = o.optString("storage_path"),
                    mimeType = o.optString("mime_type").ifBlank { null },
                    createdAt = o.optString("created_at"),
                    phoneNumber = o.optString("phone_number").ifBlank { null },
                    direction = o.optString("direction").ifBlank { null },
                    durationSec = if (o.has("duration_sec") && !o.isNull("duration_sec")) o.optDouble("duration_sec") else null,
                    source = o.optString("source").ifBlank { null },
                    notes = o.optString("notes").ifBlank { null },
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun toggleMicRecord() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            toast("Cấp quyền micro trước")
            return
        }
        if (!recording) {
            try {
                micFile = File(cacheDir, "mic_${System.currentTimeMillis()}.m4a")
                val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    MediaRecorder(this)
                } else {
                    @Suppress("DEPRECATION")
                    MediaRecorder()
                }
                mr.setAudioSource(MediaRecorder.AudioSource.MIC)
                mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                mr.setOutputFile(micFile!!.absolutePath)
                mr.prepare()
                mr.start()
                mediaRecorder = mr
                recording = true
                binding.btnRecord.text = "Dừng & upload"
                binding.textStatus.text = "Đang ghi micro…"
            } catch (e: Exception) {
                binding.textStatus.text = "Lỗi ghi: ${e.message}"
            }
        } else {
            try {
                mediaRecorder?.apply { stop(); release() }
            } catch (_: Exception) { }
            mediaRecorder = null
            recording = false
            binding.btnRecord.text = "Ghi micro (thử)"
            val f = micFile ?: return
            micFile = null
            if (!f.exists()) return
            lifecycleScope.launch {
                val res = VoiceRepository.uploadAudioFile(
                    this@MainActivity,
                    f,
                    "audio/mp4",
                    f.name,
                    phoneNumber = null,
                    direction = null,
                    callStartedMs = null,
                    callEndedMs = null,
                    externalCallId = null,
                    source = "android_mic",
                )
                f.delete()
                if (res.isSuccess) {
                    toast("Đã upload ghi micro")
                    loadList()
                } else binding.textStatus.text = res.exceptionOrNull()?.message ?: "Lỗi upload"
            }
        }
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        try {
            mediaRecorder?.release()
        } catch (_: Exception) { }
        mediaRecorder = null
        super.onDestroy()
    }
}
