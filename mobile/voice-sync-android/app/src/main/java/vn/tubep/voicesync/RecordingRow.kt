package vn.tubep.voicesync

data class RecordingRow(
    val id: String,
    val fileName: String,
    val storagePath: String,
    val mimeType: String?,
    val createdAt: String,
    val phoneNumber: String?,
    val direction: String?,
    val durationSec: Double?,
    val source: String?,
    val notes: String?,
)
