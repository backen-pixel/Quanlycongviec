import { Link } from 'react-router-dom';
import {
  Link2, ScanLine, Trash2, UserPlus, UserRound, MoreVertical, Play, Shield, Inbox, FileText, Loader2,
} from 'lucide-react';
import { formatDateTime } from '../../lib/utils';
import VoiceSpotifyPlayer from './VoiceSpotifyPlayer';

const COVER_GRADIENTS = [
  'from-violet-600 via-fuchsia-500 to-orange-400',
  'from-indigo-600 via-purple-500 to-pink-500',
  'from-emerald-500 via-teal-500 to-cyan-500',
  'from-amber-500 via-orange-500 to-rose-500',
  'from-blue-600 via-violet-500 to-purple-600',
  'from-rose-500 via-red-500 to-amber-500',
];

function pickGradient(id) {
  const s = String(id || '0');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash + s.charCodeAt(i) * (i + 1)) % COVER_GRADIENTS.length;
  return COVER_GRADIENTS[hash];
}

function dirLabel(d) {
  if (d === 'inbound') return 'Gọi đến';
  if (d === 'outbound') return 'Gọi đi';
  if (d === 'unknown') return 'Không rõ';
  return d || '';
}

function leadTypeLabel(type) {
  if (type === 'deal') return 'Deal';
  if (type === 'lead') return 'Lead';
  return type || 'CRM';
}

function recordingHasCustomer(r) {
  return !!(r?.customer_id || r?.customer?.id);
}

function recordingHasLead(r) {
  return !!(r?.lead_id || r?.lead?.id);
}

function isLinked(r) {
  return recordingHasLead(r);
}

function sttBadge(status) {
  const s = String(status || 'idle');
  const map = {
    done: { label: 'Có văn bản', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pending: { label: 'Chờ STT', className: 'bg-amber-50 text-amber-800 border-amber-200' },
    processing: { label: 'Đang STT', className: 'bg-sky-50 text-sky-800 border-sky-200' },
    failed: { label: 'STT lỗi', className: 'bg-red-50 text-red-700 border-red-200' },
    skipped: { label: 'Không STT', className: 'bg-slate-50 text-slate-600 border-slate-200' },
    idle: { label: 'STT idle', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  };
  return map[s] || map.idle;
}

function canTranscribe(r) {
  if (r?.prospect_class === 'prospect_lead') return true;
  if (r?.lead?.type === 'lead') return true;
  return false;
}

export default function VoiceRecordingCard({
  recording: r,
  audioUrl,
  companyViewer,
  relinkingRowId,
  transcribingRowId,
  onAttach,
  onRelink,
  onBootstrap,
  onRemove,
  onTranscribe,
}) {
  const linked = isLinked(r);
  const gradient = pickGradient(r.id);
  const staffName = r.uploader?.full_name || r.uploader?.email;
  const badge = sttBadge(r.stt_status);
  const transcript = r.transcript != null ? String(r.transcript).trim() : '';
  const showTranscribeBtn =
    canTranscribe(r) &&
    (!transcript || r.stt_status === 'failed') &&
    r.stt_status !== 'processing' &&
    r.stt_status !== 'pending';

  return (
    <article className="group rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] hover:shadow-[0_16px_40px_rgba(124,58,237,0.12)] hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex gap-3 sm:gap-4">
        {/* Cover 90x90 — thu còn 56px ở mobile: ảnh chỉ là trang trí (sóng âm tĩnh),
            nhưng mang badge trạng thái nên không bỏ hẳn. Nhường chỗ cho phần chữ:
            140px → ~187px, đỡ bị xuống dòng liên tục. */}
        <div className="relative shrink-0 self-start">
          <div
            className={`w-14 h-14 sm:w-[90px] sm:h-[90px] rounded-2xl bg-gradient-to-br ${gradient} shadow-lg flex items-center justify-center overflow-hidden`}
          >
            <div className="absolute inset-0 bg-black/10" />
            <div className="relative flex items-end justify-center gap-[3px] h-10 px-2 pb-3 opacity-90">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-white/80"
                  style={{ height: `${30 + Math.sin(i * 0.9) * 18 + Math.cos(i * 0.4) * 12}px` }}
                />
              ))}
            </div>
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              <span className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                <Play size={18} className="text-violet-700 ml-0.5" fill="currentColor" />
              </span>
            </span>
          </div>
          <span
            className={`absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border shadow-sm whitespace-nowrap ${
              linked
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {linked ? <Shield size={10} /> : <Inbox size={10} />}
            {linked ? 'Đã gắn' : 'Chưa gắn'}
          </span>
        </div>

        {/* Meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate" title={r.file_name}>
                {r.file_name}
              </h3>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                <span>{formatDateTime(r.call_started_at || r.created_at)}</span>
                {companyViewer && staffName ? (
                  <span className="text-violet-600 font-medium">NV: {staffName}</span>
                ) : null}
                {r.source ? <span>Nguồn: {r.source}</span> : null}
                {r.direction ? <span>{dirLabel(r.direction)}</span> : null}
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${badge.className}`}
                  title={r.stt_error || undefined}
                >
                  {badge.label}
                </span>
                {r.prospect_class === 'prospect_lead' ? (
                  <span className="text-violet-600 font-medium">Lead tiềm năng</span>
                ) : null}
              </div>
              {r.phone_number ? (
                <p className="mt-1 text-[11px] text-slate-600">
                  SĐT: <span className="font-mono font-medium text-slate-800">{r.phone_number}</span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 shrink-0"
              title="Tuỳ chọn"
              onClick={() => onAttach?.(r)}
            >
              <MoreVertical size={16} />
            </button>
          </div>

          {(r.customer || r.lead) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] rounded-xl bg-violet-50/70 border border-violet-100 px-2.5 py-1.5">
              {r.customer ? (
                <Link to={`/customers/${r.customer.id}`} className="text-violet-700 hover:underline font-medium inline-flex items-center gap-1">
                  <UserRound size={12} />
                  {r.customer.full_name}
                </Link>
              ) : null}
              {r.lead ? (
                <Link to={`/crm/leads/${r.lead.id}`} className="text-violet-600 hover:underline">
                  {leadTypeLabel(r.lead.type)}: {r.lead.code || r.lead.title}
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Player */}
      <div className="mt-3">
        <VoiceSpotifyPlayer src={audioUrl} />
      </div>

      {transcript ? (
        <details className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-emerald-800 inline-flex items-center gap-1.5">
            <FileText size={12} />
            Văn bản cuộc gọi
          </summary>
          <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{transcript}</p>
        </details>
      ) : null}

      {/* Actions — 2 rows */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAttach?.(r)}
          className="h-9 px-2.5 rounded-xl border border-violet-200/80 bg-violet-50/50 text-violet-700 text-xs font-medium hover:bg-violet-100 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Link2 size={14} className="shrink-0" />
          Gắn KH / Lead
        </button>
        <button
          type="button"
          onClick={() => onRelink?.(r.id)}
          disabled={relinkingRowId != null}
          className="h-9 px-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/50 text-emerald-800 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <ScanLine size={14} className={`shrink-0 ${relinkingRowId === r.id ? 'animate-pulse' : ''}`} />
          {relinkingRowId === r.id ? 'Đang quét…' : 'Quét gắn Lead'}
        </button>
        <button
          type="button"
          onClick={() => onBootstrap?.(r)}
          className="h-9 px-2.5 rounded-xl border border-amber-200/80 bg-amber-50/50 text-amber-900 text-xs font-medium hover:bg-amber-100 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <UserPlus size={14} className="shrink-0" />
          {recordingHasLead(r)
            ? 'Tạo thêm Lead/Deal'
            : recordingHasCustomer(r)
              ? 'Tạo Lead/Deal'
              : 'Tạo KH + Lead/Deal'}
        </button>
        <button
          type="button"
          onClick={() => onRemove?.(r.id)}
          className="h-9 px-2.5 rounded-xl border border-red-200/80 bg-red-50/40 text-red-600 text-xs font-medium hover:bg-red-100 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 size={14} className="shrink-0" />
          Xóa
        </button>
        {showTranscribeBtn ? (
          <button
            type="button"
            onClick={() => onTranscribe?.(r.id, r.stt_status === 'failed')}
            disabled={transcribingRowId != null || !onTranscribe}
            title="Chỉ Lead tiềm năng"
            className="col-span-2 h-9 px-2.5 rounded-xl border border-sky-200/80 bg-sky-50/50 text-sky-900 text-xs font-medium hover:bg-sky-100 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            {transcribingRowId === r.id ? (
              <Loader2 size={14} className="shrink-0 animate-spin" />
            ) : (
              <FileText size={14} className="shrink-0" />
            )}
            {r.stt_status === 'failed' ? 'Thử lại chuyển văn bản' : 'Chuyển thành văn bản'}
          </button>
        ) : !canTranscribe(r) && linked && !transcript ? (
          <p className="col-span-2 text-[11px] text-slate-500 text-center">
            Chỉ STT cho Lead tiềm năng (không áp dụng Deal / chưa gắn)
          </p>
        ) : null}
      </div>
    </article>
  );
}
