package vn.tubep.voicesync

data class RecordingRow(
    val id: String,
    val fileName: String,
    val storagePath: String,
    /** URL đầy đủ từ API (Supabase public) khi file nằm bucket ghi-am */
    val audioUrl: String?,
    val mimeType: String?,
    val createdAt: String,
    val phoneNumber: String?,
    val direction: String?,
    val durationSec: Double?,
    val source: String?,
    val notes: String?,
    /** Hiển thị thời điểm cuộc gọi (call_started_at / call_ended_at) */
    val callTimeLabel: String?,
    /** Khách + Lead/Deal đã ghép */
    val crmSummary: String?,
)
