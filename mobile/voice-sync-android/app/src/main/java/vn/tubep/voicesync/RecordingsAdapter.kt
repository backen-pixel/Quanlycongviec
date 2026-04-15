package vn.tubep.voicesync

import android.content.Intent
import android.net.Uri
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import vn.tubep.voicesync.databinding.ItemRecordingBinding

class RecordingsAdapter(
    private val baseUrl: () -> String,
    private val onDelete: (RecordingRow) -> Unit,
) : RecyclerView.Adapter<RecordingsAdapter.VH>() {

    private val items = mutableListOf<RecordingRow>()

    fun setData(rows: List<RecordingRow>) {
        items.clear()
        items.addAll(rows)
        notifyDataSetChanged()
    }

    override fun getItemCount() = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemRecordingBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val r = items[position]
        val b = holder.binding
        b.textPhone.text = if (r.phoneNumber.isNullOrBlank()) "—" else r.phoneNumber
        b.textDirection.text = when (r.direction) {
            "inbound" -> "Gọi đến"
            "outbound" -> "Gọi đi"
            else -> "Cuộc gọi"
        }
        b.textFile.text = r.fileName
        val dur = r.durationSec?.let { String.format("%.0fs", it) } ?: "—"
        b.textMeta.text = "${r.createdAt} · ${r.source ?: "—"} · $dur"
        if (!r.callTimeLabel.isNullOrBlank()) {
            b.textCallTime.visibility = android.view.View.VISIBLE
            b.textCallTime.text = r.callTimeLabel
        } else {
            b.textCallTime.visibility = android.view.View.GONE
        }
        if (!r.crmSummary.isNullOrBlank()) {
            b.textCrmLink.visibility = android.view.View.VISIBLE
            b.textCrmLink.text = r.crmSummary
        } else {
            b.textCrmLink.visibility = android.view.View.GONE
        }
        if (!r.notes.isNullOrBlank()) {
            b.textNotes.visibility = android.view.View.VISIBLE
            b.textNotes.text = r.notes
        } else {
            b.textNotes.visibility = android.view.View.GONE
        }
        b.btnPlay.setOnClickListener {
            val root = baseUrl().trimEnd('/')
            val url = r.audioUrl?.takeIf { it.isNotBlank() }
                ?: run {
                    val path = if (r.storagePath.startsWith("/")) r.storagePath else "/${r.storagePath}"
                    "$root$path"
                }
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(url), r.mimeType ?: "audio/*")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val cx = b.root.context
            try {
                cx.startActivity(Intent.createChooser(intent, "Phát âm thanh").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                cx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
        b.btnDelete.setOnClickListener { onDelete(r) }
    }

    class VH(val binding: ItemRecordingBinding) : RecyclerView.ViewHolder(binding.root)
}
