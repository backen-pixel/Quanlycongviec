import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Mic, RefreshCw } from 'lucide-react';
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

export default function LeadVoiceRecordingsTab({ leadId }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.get('/voice-recordings', { params: { lead_id: leadId } });
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600">
          Các file ghi âm (web / app) đã{' '}
          <span className="font-medium text-gray-800">ghép với lead hoặc deal này</span>. Upload thêm tại trang Ghi âm
          hoặc từ điện thoại.
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
          {list.map((r) => (
            <li key={r.id} className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
              <p className="text-sm font-medium text-gray-900 break-all">{r.file_name}</p>
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
              <audio controls className="mt-2 w-full max-w-md h-9" src={recordingAudioUrl(r)} preload="none" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
