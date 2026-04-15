import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { Mic, Upload, Trash2, RefreshCw, Square, Circle, Smartphone } from 'lucide-react';
import { formatDateTime } from '../lib/utils';

function recordingAudioUrl(storage_path) {
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

/**
 * Web và app Android dùng chung API (Bearer): POST multipart field `audio` + metadata cuộc gọi (tuỳ chọn).
 */
export default function VoiceRecordingsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [direction, setDirection] = useState('');
  const [callStartedAt, setCallStartedAt] = useState('');
  const [callEndedAt, setCallEndedAt] = useState('');
  const [externalCallId, setExternalCallId] = useState('');
  const fileRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.get('/voice-recordings');
      setList(data.recordings || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi tải danh sách');
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const appendMeta = (fd) => {
    if (deviceLabel.trim()) fd.append('device_label', deviceLabel.trim());
    if (notes.trim()) fd.append('notes', notes.trim());
    if (phoneNumber.replace(/\s/g, '').trim()) fd.append('phone_number', phoneNumber.replace(/\s/g, '').trim());
    if (direction) fd.append('direction', direction);
    if (callStartedAt.trim()) fd.append('call_started_at', callStartedAt.trim());
    if (callEndedAt.trim()) fd.append('call_ended_at', callEndedAt.trim());
    if (externalCallId.trim()) fd.append('external_call_id', externalCallId.trim());
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('audio', file);
      fd.append('source', 'web');
      appendMeta(fd);
      await api.post('/voice-recordings', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setNotes('');
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Upload thất bại');
    }
    setUploading(false);
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    void uploadFile(f);
  };

  const startMic = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined });
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('webm') ? 'webm' : 'm4a';
        const file = new File([blob], `mic_${Date.now()}.${ext}`, { type });
        void uploadFile(file);
        setRecording(false);
        mediaRecorderRef.current = null;
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      setErr('Không bật được micro: ' + (e.message || String(e)));
    }
  };

  const stopMic = () => {
    mediaRecorderRef.current?.stop();
  };

  const remove = async (id) => {
    if (!confirm('Xóa bản ghi này?')) return;
    try {
      await api.delete(`/voice-recordings/${id}`);
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Xóa lỗi');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-1 sm:px-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
          <Mic className="h-7 w-7 text-violet-600 shrink-0" />
          Cuộc gọi &amp; đồng bộ ghi âm
        </h1>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          Trang này là nơi web hiển thị file do bạn upload hoặc do{' '}
          <span className="font-medium text-gray-800">app mobile</span> đẩy lên cùng một tài khoản. App chạy nền (foreground
          service), khi có cuộc gọi có thể ghi micro và gửi kèm số / hướng cuộc gọi qua API dưới đây.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {err}
          {String(err).includes('voice_recordings') || String(err).includes('relation') ? (
            <p className="mt-2 text-xs leading-relaxed">
              Chạy migration SQL trên Supabase:{' '}
              <code className="bg-white/80 px-1 rounded">database/61_voice_recordings.sql</code>
              {String(err).includes('phone_number') || String(err).includes('column') ? (
                <>
                  {' '}
                  và nếu thiếu cột cuộc gọi:{' '}
                  <code className="bg-white/80 px-1 rounded">database/62_voice_recordings_call_fields.sql</code>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}

      <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-4 sm:p-5 space-y-3 shadow-sm">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-violet-600" />
          API cho mobile (cùng backend với web)
        </h2>
        <ul className="text-xs sm:text-sm text-gray-700 space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <code className="bg-white/90 px-1 rounded border border-violet-100">POST {`{BASE}/api/auth/login`}</code> — JSON{' '}
            <code className="bg-white/90 px-1 rounded">email</code>, <code className="bg-white/90 px-1 rounded">password</code>{' '}
            → lấy <code className="bg-white/90 px-1 rounded">token</code>.
          </li>
          <li>
            <code className="bg-white/90 px-1 rounded border border-violet-100">POST {`{BASE}/api/voice-recordings`}</code> —{' '}
            <code className="bg-white/90 px-1 rounded">multipart/form-data</code>, header{' '}
            <code className="bg-white/90 px-1 rounded">Authorization: Bearer …</code>.
          </li>
          <li>
            Field bắt buộc: <code className="bg-white/90 px-1 rounded">audio</code> (file). Tuỳ chọn:{' '}
            <code className="bg-white/90 px-1 rounded">source</code>, <code className="bg-white/90 px-1 rounded">device_label</code>,{' '}
            <code className="bg-white/90 px-1 rounded">notes</code>, <code className="bg-white/90 px-1 rounded">phone_number</code>,{' '}
            <code className="bg-white/90 px-1 rounded">direction</code> (inbound | outbound | unknown),{' '}
            <code className="bg-white/90 px-1 rounded">call_started_at</code>, <code className="bg-white/90 px-1 rounded">call_ended_at</code> (ISO
            8601), <code className="bg-white/90 px-1 rounded">external_call_id</code> (tránh trùng khi upload lại).
          </li>
          <li>
            <code className="bg-white/90 px-1 rounded">GET {`{BASE}/api/voice-recordings`}</code> — danh sách; dùng chung với trang này.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-gray-900">Tải lên / ghi mới (web)</h2>
        <p className="text-xs text-gray-500">
          Các ô dưới đây được gửi kèm file giống app — để thử metadata cuộc gọi từ trình duyệt.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Số điện thoại (tuỳ chọn)</label>
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+84…"
              className="mt-1 w-full h-9 px-3 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Hướng cuộc gọi</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white"
            >
              <option value="">— Không gửi —</option>
              <option value="inbound">Gọi đến</option>
              <option value="outbound">Gọi đi</option>
              <option value="unknown">Không rõ</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Bắt đầu cuộc gọi (ISO, tuỳ chọn)</label>
            <input
              value={callStartedAt}
              onChange={(e) => setCallStartedAt(e.target.value)}
              placeholder="2026-04-15T10:00:00.000Z"
              className="mt-1 w-full h-9 px-3 border rounded-lg text-sm font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Kết thúc cuộc gọi (ISO, tuỳ chọn)</label>
            <input
              value={callEndedAt}
              onChange={(e) => setCallEndedAt(e.target.value)}
              placeholder="2026-04-15T10:05:00.000Z"
              className="mt-1 w-full h-9 px-3 border rounded-lg text-sm font-mono text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500 uppercase">ID cuộc gọi phía thiết bị (tuỳ chọn, chống trùng)</label>
            <input
              value={externalCallId}
              onChange={(e) => setExternalCallId(e.target.value)}
              placeholder="VD: calllog_12345"
              className="mt-1 w-full h-9 px-3 border rounded-lg text-sm font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Nhãn thiết bị (tuỳ chọn)</label>
            <input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="VD: Samsung A54…"
              className="mt-1 w-full h-9 px-3 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Ghi chú (tuỳ chọn)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tóm tắt cuộc gọi…"
              className="mt-1 w-full h-9 px-3 border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.amr" className="hidden" onChange={onPickFile} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Chọn file ghi âm
          </button>
          {!recording ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void startMic()}
              className="h-10 px-4 rounded-lg border border-violet-300 text-violet-800 text-sm font-medium hover:bg-violet-50 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <Circle className="h-4 w-4 text-red-500 fill-red-500" />
              Ghi từ micro
            </button>
          ) : (
            <button
              type="button"
              onClick={stopMic}
              className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 flex items-center gap-2 cursor-pointer"
            >
              <Square className="h-4 w-4" />
              Dừng &amp; tải lên
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-10 px-4 rounded-lg border text-gray-700 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-3">Đã đồng bộ ({list.length})</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Đang tải…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có bản ghi. App mobile sau khi đăng nhập sẽ hiện ở đây.</p>
        ) : (
          <ul className="space-y-4">
            {list.map((r) => (
              <li
                key={r.id}
                className="border border-gray-100 rounded-lg p-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-gray-900 break-all">{r.file_name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span>{formatDateTime(r.created_at)}</span>
                    {r.phone_number ? (
                      <span className="font-medium text-gray-800">Số: {r.phone_number}</span>
                    ) : null}
                    {r.direction ? <span>{dirLabel(r.direction)}</span> : null}
                    {r.source ? <span>Nguồn: {r.source}</span> : null}
                    {r.device_label ? <span>{r.device_label}</span> : null}
                  </div>
                  {(r.call_started_at || r.call_ended_at) && (
                    <p className="text-xs text-gray-500">
                      {r.call_started_at ? `Bắt đầu: ${formatDateTime(r.call_started_at)}` : null}
                      {r.call_started_at && r.call_ended_at ? ' · ' : null}
                      {r.call_ended_at ? `Kết thúc: ${formatDateTime(r.call_ended_at)}` : null}
                    </p>
                  )}
                  {r.external_call_id ? (
                    <p className="text-xs font-mono text-gray-500 break-all">ID: {r.external_call_id}</p>
                  ) : null}
                  {r.notes ? <p className="text-xs text-gray-600 mt-1 line-clamp-3">{r.notes}</p> : null}
                  <audio controls className="mt-2 w-full max-w-md h-9" src={recordingAudioUrl(r.storage_path)} preload="none" />
                </div>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  className="shrink-0 h-9 px-3 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 flex items-center gap-1 cursor-pointer self-start"
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
