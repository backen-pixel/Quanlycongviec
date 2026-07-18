import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Mic, RefreshCw, FileText, Loader2 } from 'lucide-react';
import { formatDateTime } from '../lib/utils';

function recordingAudioUrl(rec) {
  if (rec?.audio_url) return rec.audio_url;
  const storage_path = rec?.storage_path || rec;
  if (typeof storage_path !== 'string') return '';
  const path = storage_path.startsWith('/') ? storage_path : `/${storage_path}`;
  const base = import.meta.env.VITE_API_URL;
  if (base) return `${String(base).replace(/\/$/, '')}${path}`;
  return path;
}

function dirLabel(d) {
  if (d === 'inbound') return 'Gọi đến';
  if (d === 'outbound') return 'Gọi đi';
  if (d === 'unknown') return 'Không rõ';
  return d || '';
}

function sttBadge(status) {
  const s = String(status || 'idle');
  const map = {
    done: { label: 'Đã có văn bản', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pending: { label: 'Chờ chuyển văn bản', className: 'bg-amber-50 text-amber-800 border-amber-200' },
    processing: { label: 'Đang chuyển…', className: 'bg-sky-50 text-sky-800 border-sky-200' },
    failed: { label: 'STT lỗi', className: 'bg-red-50 text-red-700 border-red-200' },
    skipped: { label: 'Không STT', className: 'bg-slate-50 text-slate-600 border-slate-200' },
    idle: { label: 'Chưa xếp hàng', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  };
  return map[s] || map.idle;
}

function canTranscribe(r) {
  if (r?.prospect_class === 'prospect_lead') return true;
  if (r?.lead?.type === 'lead') return true;
  return false;
}

export default function LeadVoiceRecordingsTab({ leadId }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [openTranscriptId, setOpenTranscriptId] = useState(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.get('/voice-recordings', {
        params: { lead_id: leadId, include_transcript: '1' },
      });
      setList(data.recordings || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Không tải được danh sách');
      setList([]);
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestTranscribe = async (id, force = false) => {
    setBusyId(id);
    setErr('');
    try {
      const { data } = await api.post(`/voice-recordings/${id}/transcribe`, { force: force ? 1 : 0 });
      if (data?.recording) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...data.recording } : r)));
      } else {
        await load();
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Không xếp hàng chuyển văn bản');
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600">
          Các file ghi âm (web / app) đã{' '}
          <span className="font-medium text-gray-800">ghép với lead hoặc deal này</span>. Lead tiềm năng được xếp
          hàng chuyển thành văn bản tự động (OpenAI).
        </p>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-9 px-3 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <Link
            to="/tools/voice-recordings"
            className="h-9 px-3 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 inline-flex items-center gap-2"
          >
            <Mic className="h-4 w-4" />
            Trang ghi âm
          </Link>
        </div>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-gray-200 bg-gray-50/80">
          <Mic className="h-10 w-10 text-violet-200 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Chưa có file ghi âm nào được ghép với cơ hội này.</p>
          <p className="text-xs text-gray-400 mt-1">Upload kèm số điện thoại hoặc gắn tay trên trang Ghi âm.</p>
        </div>
      ) : (
        <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {list.map((r) => {
            const badge = sttBadge(r.stt_status);
            const transcript = r.transcript != null ? String(r.transcript).trim() : '';
            const showTranscribe =
              canTranscribe(r) &&
              (!transcript || r.stt_status === 'failed') &&
              r.stt_status !== 'processing' &&
              r.stt_status !== 'pending';
            const open = openTranscriptId === r.id;

            return (
              <li key={r.id} className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 break-all min-w-0">{r.file_name}</p>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.className}`}
                    title={r.stt_error || undefined}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                  <span>{formatDateTime(r.created_at)}</span>
                  {r.uploader?.full_name ? (
                    <span className="font-medium text-violet-800">NV: {r.uploader.full_name}</span>
                  ) : null}
                  {r.phone_number ? <span className="font-medium">Số: {r.phone_number}</span> : null}
                  {r.direction ? <span>{dirLabel(r.direction)}</span> : null}
                  {r.source ? <span>Nguồn: {r.source}</span> : null}
                  {r.device_label ? <span>{r.device_label}</span> : null}
                </div>
                {(r.call_started_at || r.call_ended_at) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {r.call_started_at ? `Bắt đầu: ${formatDateTime(r.call_started_at)}` : null}
                    {r.call_started_at && r.call_ended_at ? ' · ' : null}
                    {r.call_ended_at ? `Kết thúc: ${formatDateTime(r.call_ended_at)}` : null}
                  </p>
                )}
                {r.notes ? <p className="text-xs text-gray-600 mt-1 line-clamp-2">{r.notes}</p> : null}
                {r.stt_status === 'failed' && r.stt_error ? (
                  <p className="text-xs text-red-600 mt-1">{r.stt_error}</p>
                ) : null}
                <audio controls className="mt-2 w-full max-w-md h-9" src={recordingAudioUrl(r)} preload="none" />

                <div className="mt-2 flex flex-wrap gap-2">
                  {transcript ? (
                    <button
                      type="button"
                      onClick={() => setOpenTranscriptId(open ? null : r.id)}
                      className="h-8 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 text-emerald-800 text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {open ? 'Ẩn văn bản' : 'Xem văn bản'}
                    </button>
                  ) : null}
                  {showTranscribe ? (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void requestTranscribe(r.id, r.stt_status === 'failed')}
                      className="h-8 px-2.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 text-xs font-medium hover:bg-violet-100 disabled:opacity-50 inline-flex items-center gap-1.5"
                      title="Chỉ áp dụng cho Lead tiềm năng"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      {r.stt_status === 'failed' ? 'Thử lại STT' : 'Chuyển thành văn bản'}
                    </button>
                  ) : null}
                  {!canTranscribe(r) && !transcript ? (
                    <span className="text-[11px] text-slate-500 self-center" title="Phase 1 chỉ STT Lead tiềm năng">
                      Deal / không phải lead tiềm năng — không STT tự động
                    </span>
                  ) : null}
                </div>

                {open && transcript ? (
                  <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
                    {transcript}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
