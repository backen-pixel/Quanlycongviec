package vn.tubep.voicesync

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.provider.CallLog
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File

/**
 * Chạy nền (foreground): khi cuộc gọi OFFHOOK bắt đầu ghi micro, IDLE dừng và đẩy file + số điện thoại (CallLog) lên API.
 * Lưu ý: không phải máy nào cũng ghi được âm đầu dây; micro ghi tiếng loa/môi trường.
 */
class CallMonitorService : Service() {

    companion object {
        const val CHANNEL_ID = "voice_call_sync"
        const val NOTIF_ID = 4101
        const val ACTION_STOP = "vn.tubep.voicesync.ACTION_STOP"
        @Volatile
        var running: Boolean = false
            private set
    }

    private val job = SupervisorJob()
    private val scope = CoroutineScope(job + Dispatchers.Default)

    private var telephonyManager: TelephonyManager? = null
    private var callActive = false
    private var offHookAt = 0L
    private var recorder: MediaRecorder? = null
    private var recordFile: File? = null
    private var lastRingingNumber: String? = null

    @Suppress("DEPRECATION")
    private val legacyListener = object : PhoneStateListener() {
        override fun onCallStateChanged(state: Int, phoneNumber: String?) {
            if (state == TelephonyManager.CALL_STATE_RINGING && !phoneNumber.isNullOrBlank()) {
                lastRingingNumber = phoneNumber
            }
            handleCallState(state)
        }
    }

    @Suppress("NewApi")
    private val telephonyCallback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
        override fun onCallStateChanged(state: Int) {
            handleCallState(state)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        createChannel()
        val notif = buildNotification("Đang theo dõi cuộc gọi…")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIF_ID, notif)
        }
        telephonyManager = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyManager?.registerTelephonyCallback(mainExecutor, telephonyCallback)
            } else {
                telephonyManager?.listen(legacyListener, PhoneStateListener.LISTEN_CALL_STATE)
            }
        } catch (_: Exception) { }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            shutdown()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    private fun shutdown() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyManager?.unregisterTelephonyCallback(telephonyCallback)
            } else {
                telephonyManager?.listen(legacyListener, PhoneStateListener.LISTEN_NONE)
            }
        } catch (_: Exception) { }
        telephonyManager = null
        stopRecordingSilently()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        running = false
        stopSelf()
    }

    override fun onDestroy() {
        job.cancel()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyManager?.unregisterTelephonyCallback(telephonyCallback)
            } else {
                telephonyManager?.listen(legacyListener, PhoneStateListener.LISTEN_NONE)
            }
        } catch (_: Exception) { }
        telephonyManager = null
        running = false
        stopRecordingSilently()
        super.onDestroy()
    }

    private fun handleCallState(state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (!callActive) {
                    callActive = true
                    offHookAt = System.currentTimeMillis()
                    startRecording()
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                if (callActive) {
                    callActive = false
                    stopRecordingAndUpload()
                }
            }
        }
    }

    private fun startRecording() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            updateNotif("Thiếu quyền micro — không ghi được")
            return
        }
        try {
            stopRecordingSilently()
            recordFile = File(cacheDir, "call_${System.currentTimeMillis()}.m4a")
            val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            mr.setAudioSource(MediaRecorder.AudioSource.MIC)
            mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            mr.setOutputFile(recordFile!!.absolutePath)
            mr.prepare()
            mr.start()
            recorder = mr
            updateNotif("Đang ghi âm cuộc gọi (micro)…")
        } catch (e: Exception) {
            updateNotif("Lỗi ghi: ${e.message}")
        }
    }

    private fun stopRecordingSilently() {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (_: Exception) { }
        recorder = null
    }

    private fun stopRecordingAndUpload() {
        stopRecordingSilently()
        val file = recordFile
        recordFile = null
        updateNotif("Đang tải lên server…")
        val ended = System.currentTimeMillis()
        val started = if (offHookAt > 0) offHookAt else ended

        val logInfo = readLastCallLog()
        val phone = logInfo?.first ?: lastRingingNumber
        lastRingingNumber = null
        val direction = logInfo?.second
        val externalId = logInfo?.third?.let { "calllog_$it" }

        if (file == null || !file.exists()) {
            updateNotif("Không có file ghi — chờ cuộc gọi sau")
            startForeground(NOTIF_ID, buildNotification("Theo dõi cuộc gọi (sẵn sàng)"))
            return
        }

        scope.launch {
            val res = VoiceRepository.uploadAudioFile(
                this@CallMonitorService,
                file,
                "audio/mp4",
                file.name,
                phone,
                direction,
                started,
                ended,
                externalId,
                "android_call_bg",
            )
            file.delete()
            if (res.isSuccess) {
                try {
                    VoiceRepository.relinkUnassigned(this@CallMonitorService)
                } catch (_: Exception) { }
            }
            val msg = if (res.isSuccess) "Đã đồng bộ: ${phone ?: "—"}" else "Lỗi upload: ${res.exceptionOrNull()?.message}"
            runOnMain { updateNotif(msg) }
            runOnMain {
                startForeground(NOTIF_ID, buildNotification("Theo dõi cuộc gọi — $msg"))
            }
        }
    }

    private fun readLastCallLog(): Triple<String, String, Long>? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            return null
        }
        val uri = CallLog.Calls.CONTENT_URI
        val proj = arrayOf(
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls._ID,
        )
        return try {
            contentResolver.query(uri, proj, null, null, "${CallLog.Calls.DATE} DESC")?.use { c ->
                if (c.moveToFirst()) {
                    val num = c.getString(0) ?: return@use null
                    val type = c.getInt(1)
                    val id = c.getLong(2)
                    val dir = when (type) {
                        CallLog.Calls.INCOMING_TYPE -> "inbound"
                        CallLog.Calls.OUTGOING_TYPE -> "outbound"
                        else -> "unknown"
                    }
                    Triple(num, dir, id)
                } else null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun runOnMain(block: () -> Unit) {
        android.os.Handler(mainLooper).post(block)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Đồng bộ ghi âm",
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Theo dõi cuộc gọi và tải ghi âm" }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(text: String): Notification {
        val stopIntent = Intent(this, CallMonitorService::class.java).apply { action = ACTION_STOP }
        val stopPi = android.app.PendingIntent.getService(
            this, 0, stopIntent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) android.app.PendingIntent.FLAG_IMMUTABLE else 0),
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("TuBep Voice Sync")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Tắt", stopPi)
            .build()
    }

    private fun updateNotif(text: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(text))
    }
}
