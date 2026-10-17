import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Loader2, Activity, Search, ChevronRight, ChevronDown,
  AlertTriangle, Database, MessageSquare, CheckCircle2, Clock, Users, Hourglass,
  Sparkles, Inbox, Orbit, X, ExternalLink, UserRound, Share2,
} from 'lucide-react';
import api from '../lib/api';

/* ──────────────────────────────────────────────────────────────────────────────
 * Báo cáo hành vi & khó khăn người dùng.
 * Nguồn: user_activity_log (thao tác trên UI) · activity_logs (CRUD thật phía server)
 *      · crm_lead_comments / project_comments / crm_assignment_comments (trao đổi)
 *      · guide_chat_log (khó khăn) · unified_tasks_v (quá hạn / hoàn thành)
 *
 * Quy ước màu: mọi thanh "độ lớn" dùng CHUNG một màu teal, đậm nhạt theo giá trị — các thanh đều
 * đo cùng một đại lượng nên tô nhiều màu chỉ làm người đọc tưởng là nhóm khác nhau. Hổ phách =
 * thời gian chờ, đỏ = khó khăn/quá hạn. Mọi màu luôn kèm số hoặc nhãn chữ, không bắt phân biệt
 * bằng màu đơn thuần. Xem docs/architecture/ke-hoach-thu-thap-hanh-vi-nguoi-dung.md
 * ────────────────────────────────────────────────────────────────────────────── */

const PERIODS = [
  { days: 1, label: 'Hôm nay' },
  { days: 7, label: '7 ngày' },
  { days: 14, label: '14 ngày' },
  { days: 30, label: '30 ngày' },
];

const SIGNAL_LABEL = {
  failed_step: 'Trợ lý làm hỏng bước',
  repeated_question: 'Hỏi lại từ 3 lượt',
};

const ACTION_LABEL = {
  view: 'Xem', filter: 'Lọc', search: 'Tìm kiếm', sort: 'Sắp xếp', navigate: 'Chuyển trang',
  click: 'Bấm', create: 'Tạo mới', update: 'Sửa', delete: 'Xoá', export: 'Xuất file',
  open_modal: 'Mở hộp thoại', submit_form: 'Gửi biểu mẫu', chat_open: 'Mở trợ lý',
  chat_send: 'Hỏi trợ lý',
  // activity_logs (server) dùng thì quá khứ — khác taxonomy của user_activity_log
  created: 'Tạo', updated: 'Sửa', deleted: 'Xoá', status_changed: 'Đổi trạng thái',
  stage_changed: 'Đổi giai đoạn', approval_requested: 'Xin duyệt', restored: 'Khôi phục',
};

const VIA_LABEL = {
  app: 'Trả lời trong phần mềm',
  meta_inbox: 'Trả lời bằng app Facebook',
  other_app: 'App bên thứ ba',
  auto_reply: 'Tự động trả lời',
  tool: 'Công cụ gửi ảnh',
  sync_unknown: 'Đồng bộ ngược, không rõ nguồn',
  '(chưa ghi nguồn)': 'Tin cũ, chưa ghi nguồn',
};

const MODULE_LABEL = {
  crm: 'CRM', tasks: 'Công việc', projects: 'Dự án', kpi: 'KPI', reports: 'Báo cáo',
  messenger: 'Tin nhắn', admin: 'Quản trị', production: 'Sản xuất', logistics: 'Vận chuyển',
  management: 'Quản lý', accounting: 'Kế toán', purchasing: 'Mua hàng', calc: 'Tính toán',
  social: 'Mạng nội bộ', drive: 'Lưu trữ file', knowledge: 'Đào tạo / kiến thức',
};

const SORTS = [
  { key: 'active_events', label: 'Thao tác nhiều nhất' },
  { key: 'crud', label: 'Sửa dữ liệu nhiều nhất' },
  { key: 'comments', label: 'Bình luận nhiều nhất' },
  { key: 'idle_minutes', label: 'Chờ lâu nhất' },
  { key: 'attention', label: 'Cần chú ý nhất' },
  { key: 'done_tasks', label: 'Hoàn thành nhiều nhất' },
];

const fmtNum = (n) => (n || 0).toLocaleString('vi-VN');

/** Tổng bình luận của 1 người — `comments` tách 2 nhóm nội bộ/khách hàng nên phải cộng lại. */
const commentTotal = (r) => (r.comments?.internal?.total || 0) + (r.comments?.customer?.total || 0);

function fmtMinutes(min) {
  if (!min) return '0 phút';
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}g ${m}p` : `${h} giờ`;
}

/** Bản ngắn dùng trong ô bảng, tránh làm cột phình ngang. */
function fmtMinutesShort(min) {
  if (!min) return '—';
  if (min < 60) return `${min}p`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}g${m}` : `${h}g`;
}

function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  return `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)} ${d.toISOString().slice(11, 16)}`;
}

const fmtHour = (iso) => (iso ? fmtStamp(iso).slice(-5) : '--:--');
const isoDaysAgo = (days) => new Date(Date.now() - days * 864e5).toISOString();
const difficultyCount = (r) => (r.difficulty_signals || []).reduce((s, x) => s + x.count, 0);
/** Gộp 2 tín hiệu xấu thành 1 cột — quản lý cần biết "ai cần để mắt", không cần tách ngay ở bảng. */
const attentionCount = (r) => difficultyCount(r) + (r.overdue_tasks || 0);

/** Chữ cái đầu cho ảnh đại diện — chỉ là ký tự, không suy đoán gì về người dùng. */
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const last = parts[parts.length - 1] || '';
  const first = parts.length > 1 ? parts[parts.length - 2] : '';
  return ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
}

/** Hạng mục nào là đường dẫn màn hình thì mới gắn được nút mở. */
const isScreenPath = (key) => typeof key === 'string' && key.startsWith('/');

/** Nút mở màn hình — mở tab mới để không mất báo cáo đang xem. */
function OpenScreenLink({ path, className = '' }) {
  if (!isScreenPath(path)) return null;
  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Mở ${path} ở tab mới`}
      className={`shrink-0 w-6 h-6 grid place-items-center rounded-md text-slate-300 hover:text-teal-700 hover:bg-teal-50 transition-colors ${className}`}
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}

/* ── Thanh độ lớn ──────────────────────────────────────────────────────────── */
function Bar({ value, max, tone = 'teal' }) {
  const pct = max > 0 ? Math.max(value > 0 ? 5 : 0, Math.round((value / max) * 100)) : 0;
  const fill = {
    teal: 'bg-gradient-to-r from-teal-400 to-teal-600',
    amber: 'bg-gradient-to-r from-amber-300 to-amber-500',
    rose: 'bg-gradient-to-r from-rose-300 to-rose-500',
  }[tone];
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mt-1.5">
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Ô nhiệt của ma trận người × giờ ───────────────────────────────────────── */
function HeatCell({ value, max, title, className = '' }) {
  const t = max > 0 ? value / max : 0;
  return (
    <div
      className={`rounded ${className} transition-transform hover:scale-125`}
      style={{ background: value ? `color-mix(in oklab, #0d9488 ${Math.round(12 + t * 88)}%, #ffffff)` : '#f1f5f9' }}
      title={title}
    />
  );
}

/* ── Dải 24 giờ ────────────────────────────────────────────────────────────── */
function HourStrip({ hours, compact = false }) {
  const max = Math.max(1, ...hours);
  return (
    <div className={`flex items-end gap-[2px] ${compact ? 'h-7' : 'h-20'}`}>
      {hours.map((v, h) => (
        <div
          key={h}
          className="flex-1 rounded-t-[3px] bg-gradient-to-t from-teal-600 to-teal-400 min-h-[2px]"
          style={{ height: `${Math.max(v ? 10 : 3, (v / max) * 100)}%`, opacity: v ? 0.45 + 0.55 * (v / max) : 0.14 }}
          title={`${String(h).padStart(2, '0')}:00 — ${fmtNum(v)} thao tác`}
        />
      ))}
    </div>
  );
}

/**
 * Tiêu đề nhóm trong lưới thẻ (chạy hết chiều ngang) — tách rõ việc nội bộ (đồng nghiệp) khỏi
 * việc có khách hàng, vì gộp chung từng khiến "bình luận Dự án" nhìn như "giao tiếp khách hàng".
 */
function SectionHeading({ label, hint }) {
  return (
    <div className="col-span-full flex items-baseline gap-2 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {hint && <span className="text-[11px] text-slate-400">· {hint}</span>}
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

/* ── Ô số tổng ─────────────────────────────────────────────────────────────── */
function Tile({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const ink = {
    slate: 'text-slate-900', teal: 'text-teal-700', amber: 'text-amber-700', rose: 'text-rose-700',
  }[tone];
  const chip = {
    slate: 'bg-slate-100 text-slate-500 ring-slate-200/60',
    teal: 'bg-teal-50 text-teal-600 ring-teal-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  }[tone];
  return (
    <div className="group bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-sm hover:shadow-md hover:ring-slate-300 transition-all p-4">
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-xl grid place-items-center ring-1 ${chip} group-hover:scale-105 transition-transform`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-[13px] font-medium text-slate-500 leading-tight">{label}</span>
      </div>
      <div className={`mt-2.5 text-[26px] leading-none font-bold tabular-nums tracking-tight ${ink}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1.5 leading-tight">{sub}</div>}
    </div>
  );
}

function Card({ title, icon: Icon, right, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-slate-400" />} {title}
        </span>
        {right && <span className="text-xs text-slate-400 tabular-nums shrink-0">{right}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
      <Inbox className="w-4 h-4 text-slate-300" /> {text}
    </div>
  );
}

function RankList({ rows, tone = 'teal', unit = '', empty = 'Chưa có dữ liệu', onPick }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const clickable = !!onPick && !r.noDrill;
        return (
          <div
            key={r.key}
            className="group grid grid-cols-[1fr_auto_auto] gap-x-2 items-baseline rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-50"
          >
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onPick(r) : undefined}
              className={`min-w-0 text-left ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              title={clickable ? `Xem chi tiết: ${r.label}` : r.key}
            >
              <div className={`text-[13px] truncate ${clickable ? 'text-slate-600 group-hover:text-teal-700' : 'text-slate-600'}`}>
                {r.label}
              </div>
              <Bar value={r.value} max={max} tone={tone} />
            </button>
            <div className="text-sm font-semibold text-slate-900 tabular-nums self-center">
              {fmtNum(r.value)}{unit && <span className="text-[11px] font-normal text-slate-400"> {unit}</span>}
            </div>
            <div className="self-center">
              <OpenScreenLink path={r.key} className={isScreenPath(r.key) ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : ''} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Ma trận CRUD: hàng = đối tượng, cột = hành động ───────────────────────── */
function CrudMatrix({ matrix, onPick }) {
  const actions = [...new Set(matrix.map((m) => m.action))];
  const entities = [...new Set(matrix.map((m) => m.entity))];
  const lookup = new Map(matrix.map((m) => [`${m.action}::${m.entity}`, m.events]));
  const max = Math.max(1, ...matrix.map((m) => m.events));
  if (!matrix.length) {
    return (
      <Empty text="Không có bản ghi. Nhật ký máy chủ chỉ ghi cho dự án, công việc và phê duyệt — thao tác CRM chưa được ghi." />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-sm tabular-nums border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left font-medium text-slate-400 text-[11px] uppercase tracking-wide pr-2">Đối tượng</th>
            {actions.map((a) => (
              <th key={a} className="px-1 font-medium text-slate-500 text-[11px] text-center whitespace-nowrap">
                {ACTION_LABEL[a] || a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((e) => (
            <tr key={e}>
              <td className="text-[13px] text-slate-700 pr-2 whitespace-nowrap">{e}</td>
              {actions.map((a) => {
                const v = lookup.get(`${a}::${e}`) || 0;
                const t = v / max;
                return (
                  <td key={a} className="p-0">
                    <div
                      onClick={v && onPick ? () => onPick({ action: a, entity: e, events: v }) : undefined}
                      className={`w-12 h-8 grid place-items-center rounded-lg text-xs font-semibold transition-transform hover:scale-105 ${v && onPick ? 'cursor-pointer' : ''}`}
                      style={{
                        background: v ? `color-mix(in oklab, #0d9488 ${Math.round(12 + t * 88)}%, #ffffff)` : '#f8fafc',
                        color: t > 0.5 ? '#ffffff' : '#334155',
                      }}
                      title={v ? `${ACTION_LABEL[a] || a} · ${e} · ${fmtNum(v)} lần — bấm để xem chi tiết` : ''}
                    >
                      {v || ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Dòng nhật ký gần nhất ─────────────────────────────────────────────────── */
function LogList({ lines, empty }) {
  if (!lines.length) return <Empty text={empty} />;
  return (
    <div className="relative max-h-60 overflow-y-auto pl-3">
      <div className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-slate-200" />
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="relative flex items-baseline gap-2 text-[13px]">
            <span className="absolute -left-3 top-1.5 w-1.5 h-1.5 rounded-full bg-slate-300" />
            <span className="text-[11px] text-slate-400 tabular-nums shrink-0 w-10">{fmtHour(l.at)}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] shrink-0">{l.tag}</span>
            <span className="text-slate-600 truncate" title={l.text}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Khung hội thoại với khách (bong bóng chat) ────────────────────────────── */
function ChatThread({ rows }) {
  if (!rows.length) return <Empty text="Chưa có tin nhắn nào với khách này" />;
  return (
    <div className="space-y-2">
      {rows.map((m, i) => {
        const mine = m.direction === 'outbound';
        return (
          <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-[13px] ${
              mine ? 'bg-teal-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
            }`}>
              {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
              {!m.text && m.attachment_url && (
                <a href={m.attachment_url} target="_blank" rel="noopener noreferrer"
                  className={`underline ${mine ? 'text-white' : 'text-teal-700'}`}>
                  [{m.message_type || 'tệp đính kèm'}]
                </a>
              )}
              {!m.text && !m.attachment_url && <span className="italic opacity-70">[{m.message_type}]</span>}
              <div className={`text-[10px] mt-1 ${mine ? 'text-teal-100' : 'text-slate-400'}`}>
                {fmtStamp(m.at)}{mine && m.sender ? ` · ${m.sender}` : ''}
                {mine && !m.sender ? ' · không rõ người gửi' : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Hộp xem dòng thô đứng sau một con số ──────────────────────────────────── */
function DrillModal({ open, onClose, title, subtitle, query, days }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Mở hội thoại 1 khách ngay trong hộp này — {title, query} — bấm "Quay lại" để về danh sách.
  const [sub, setSub] = useState(null);

  const active = sub || { title, subtitle, query };

  useEffect(() => { setSub(null); }, [query]);

  useEffect(() => {
    if (!open || !active.query) return;
    let alive = true;
    setLoading(true);
    setError('');
    api.get('/analytics/behavior-insight/events', { params: { ...active.query, date_from: isoDaysAgo(days), limit: 300 } })
      .then((res) => { if (alive) setRows(res.data?.rows || []); })
      .catch((err) => { if (alive) setError(err.response?.data?.error || 'Không tải được chi tiết'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, active.query, days]);

  if (!open) return null;

  const isCustomers = active.query?.source === 'channel_customers';
  const isChat = active.query?.source === 'chat';
  const isComments = active.query?.source === 'comments';
  const isPhatSinh = active.query?.source === 'phat_sinh';
  const isPlainList = !isCustomers && !isChat && !isComments && !isPhatSinh;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 w-full max-w-3xl max-h-[82vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
          <div className="min-w-0 flex items-start gap-2">
            {sub && (
              <button onClick={() => setSub(null)} className="text-slate-400 hover:text-slate-700 shrink-0 mt-0.5" title="Quay lại danh sách khách">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{active.title}</div>
              <div className="text-xs text-slate-500 truncate">{active.subtitle}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading && (
            <div className="py-10 text-center text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Đang đọc nhật ký…
            </div>
          )}
          {error && <div className="px-3 py-2 rounded-lg bg-rose-50 ring-1 ring-rose-200 text-rose-700 text-sm">{error}</div>}
          {!loading && !error && !rows.length && !isChat && <Empty text="Không còn dòng nào trong kỳ đang xem" />}

          {!loading && !error && isChat && <ChatThread rows={rows} />}

          {/* Danh sách khách của 1 page/OA — bấm 1 dòng để mở hội thoại */}
          {!loading && !error && isCustomers && rows.length > 0 && (
            <div className="divide-y divide-slate-100">
              {rows.map((c) => (
                <button
                  key={c.contact_id}
                  type="button"
                  onClick={() => setSub({
                    title: c.name,
                    subtitle: `${c.channel}${c.phone ? ' · ' + c.phone : ''} — nội dung trao đổi`,
                    query: { source: 'chat', channel: c.channel, contact_id: c.contact_id, user_id: active.query.user_id },
                  })}
                  className="w-full text-left py-2 flex items-baseline gap-3 hover:bg-slate-50 rounded-lg px-1.5 -mx-1.5"
                >
                  <span className="text-xs text-slate-400 tabular-nums shrink-0 w-24">{fmtStamp(c.at)}</span>
                  <span className="text-[13px] text-slate-800 min-w-0 flex-1 truncate">
                    {c.name}
                    {c.phone && <span className="text-slate-400 text-[11px] ml-1">{c.phone}</span>}
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                    {fmtNum(c.inbound)} đến / {fmtNum(c.outbound)} đi
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Nội dung bình luận — hiện nguyên văn kèm tên dự án / lead đang nói tới */}
          {!loading && !error && isComments && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((c, i) => (
                <div key={i} className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <span className="text-[11px] text-slate-400 tabular-nums">{fmtStamp(c.at)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white ring-1 ring-slate-200 text-[10px] text-slate-600">{c.source}</span>
                    {c.ref_label && <span className="text-[11px] text-teal-700 truncate">{c.ref_label}</span>}
                  </div>
                  <div className="text-[13px] text-slate-800 whitespace-pre-wrap break-words">{c.text || <span className="italic text-slate-400">(trống)</span>}</div>
                </div>
              ))}
            </div>
          )}

          {/* Danh sách nhiệm vụ phát sinh */}
          {!loading && !error && isPhatSinh && rows.length > 0 && (
            <div className="divide-y divide-slate-100">
              {rows.map((t, i) => (
                <div key={i} className="py-2 text-[13px]">
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs text-slate-400 tabular-nums shrink-0 w-24">{fmtStamp(t.at)}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] shrink-0">{t.kind}</span>
                    <span className="text-slate-800 min-w-0 flex-1 truncate" title={t.text}>{t.text || '—'}</span>
                    {t.overdue
                      ? <span className="text-[11px] text-rose-700 font-medium shrink-0">Quá hạn</span>
                      : <span className="text-[11px] text-slate-400 shrink-0">{t.status}</span>}
                  </div>
                  {t.deadline && (
                    <div className="ml-24 mt-0.5 text-[11px] text-slate-400">
                      Hạn: {fmtStamp(t.deadline)}
                      {t.completed_at ? ` · Xong: ${fmtStamp(t.completed_at)}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && isPlainList && rows.length > 0 && (
            <>
              <div className="text-xs text-slate-400 mb-2">
                {fmtNum(rows.length)} dòng gần nhất{rows.length >= 300 ? ' (trần 300 dòng)' : ''}
              </div>
              <div className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <div key={i} className="py-2 text-[13px]">
                    <div className="flex items-baseline gap-3">
                      <span className="text-xs text-slate-400 tabular-nums shrink-0 w-24">{fmtStamp(r.at)}</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] shrink-0">
                        {ACTION_LABEL[r.action] || r.action || (r.failed ? 'Lỗi bước' : 'Hỏi trợ lý')}
                      </span>
                      <span className="text-slate-700 min-w-0 flex-1 truncate" title={r.entity_label || r.text || r.path || r.entity}>
                        {r.entity_label || r.text || r.path || r.entity || '—'}
                      </span>
                      <OpenScreenLink path={r.path} />
                    </div>
                    {/* Dòng nhật ký máy chủ (source=audit): thêm dự án + các trường đã đổi — backend
                        đã tính sẵn (resolveAuditEntities), chỉ còn thiếu chỗ vẽ ra. */}
                    {r.project && (
                      <div className="ml-24 mt-0.5 text-[11px] text-teal-700 truncate">
                        📁 {[r.project.code, r.project.name].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {Array.isArray(r.changes) && r.changes.length > 0 && (
                      <div className="ml-24 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        {r.changes.map((c, ci) => (
                          <span key={ci} className="text-[11px] text-slate-500">
                            <span className="font-medium text-slate-600">{c.field}:</span> {c.from}
                            <span className="mx-1 text-slate-300">→</span>
                            <span className="text-slate-800 font-medium">{c.to}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Chi tiết một người ────────────────────────────────────────────────────── */
function UserDetail({ row, days }) {
  const h = row.habit || {};
  const crud = row.crud || {};
  // Tách theo Ý NGHĨA chứ không chỉ theo bảng: 'internal' (Dự án + Phân công) là trao đổi giữa
  // nhân viên, 'customer' (Lead/Deal) là trao đổi gắn với khách hàng — gộp chung dễ hiểu lầm hai
  // việc khác nhau là một. Xem computeCommentByUser trong userBehaviorInsight.js.
  const internalCmt = row.comments?.internal || {};
  const customerCmt = row.comments?.customer || {};
  const ps = row.phat_sinh || {};
  const byDay = h.by_day || [];
  const maxDay = Math.max(1, ...byDay.map((d) => d.events));
  const [drill, setDrill] = useState(null); // {title, subtitle, query}

  const openDrill = (title, subtitle, query) =>
    setDrill({ title: `${row.name} · ${title}`, subtitle, query: { user_id: row.user_id, ...query } });

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white border-t border-slate-200 p-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      <Card title="Thói quen thao tác" icon={Activity} right={`${fmtNum(row.active_events)} lần`}>
        <RankList
          rows={(h.actions || []).map((a) => ({
            key: a.action_type, label: ACTION_LABEL[a.action_type] || a.action_type, value: a.events,
          }))}
          unit="lần"
          onPick={(r) => openDrill(r.label, `${fmtNum(r.value)} lần trong kỳ đang xem`, { action_type: r.key })}
        />
      </Card>

      <Card title="Phân hệ và màn hình hay dùng" icon={Sparkles} right={`${(h.top_screens || []).length} màn hình`}>
        <RankList
          rows={(h.modules || []).map((m) => ({
            key: m.module, label: MODULE_LABEL[m.module] || m.module, value: m.events,
          }))}
          unit="lần"
          onPick={(r) => openDrill(`Phân hệ ${r.label}`, `${fmtNum(r.value)} thao tác`, { module: r.key })}
        />
        <div className="h-px bg-slate-100 my-3" />
        <RankList
          rows={(h.top_screens || []).slice(0, 5).map((x) => ({ key: x.path, label: x.path, value: x.events }))}
          unit="lần"
          onPick={(r) => openDrill(`Màn hình ${r.label}`, `${fmtNum(r.value)} lần vào`, { path: r.key })}
        />

        {/* "(không rõ)" là gì — nói thẳng ra màn hình nào, thay vì bắt người xem tự đoán. */}
        {(h.unknown_paths || []).length > 0 && (
          <>
            <div className="h-px bg-slate-100 my-3" />
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">
              “(không rõ)” là các màn hình này
            </div>
            <RankList
              rows={(h.unknown_paths || []).map((x) => ({ key: x.path, label: x.path, value: x.events }))}
              unit="lần"
              onPick={(r) => openDrill(`Màn hình ${r.label}`, `${fmtNum(r.value)} lần vào`, { path: r.key })}
            />
            <div className="mt-2 text-[11px] text-slate-400 leading-5">
              Các màn hình này chưa được đặt tên phân hệ lúc ghi log nên bị gộp vào “(không rõ)”.
              Từ 17/10/2026 danh sách tên đã mở rộng, nên log <strong className="text-slate-500">mới</strong> sẽ
              có tên đúng — con số này giảm dần chứ không mất ngay.
            </div>
          </>
        )}
      </Card>

      <Card title="Nhịp làm việc" icon={Clock} right={h.peak_hour == null ? '—' : `Cao điểm ${String(h.peak_hour).padStart(2, '0')}:00`}>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Theo giờ trong ngày (giờ Việt Nam)</div>
        <HourStrip hours={h.hours || new Array(24).fill(0)} />
        <div className="flex justify-between text-[11px] text-slate-400 mt-1">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mt-4 mb-1.5">Theo ngày</div>
        <div className="flex items-end gap-1 h-12">
          {byDay.map((d) => (
            <div
              key={d.date}
              className="flex-1 rounded-t-[3px] bg-gradient-to-t from-teal-600 to-teal-400"
              style={{ height: `${Math.max(8, (d.events / maxDay) * 100)}%` }}
              title={`${d.date} — ${fmtNum(d.events)} thao tác`}
            />
          ))}
          {!byDay.length && <Empty text="Chưa có dữ liệu" />}
        </div>
        <dl className="grid grid-cols-2 gap-y-2 mt-4 text-[13px]">
          <dt className="text-slate-500">Phiên / ngày có mặt</dt>
          <dd className="text-right text-slate-900 font-medium tabular-nums">{fmtNum(h.sessions)} / {fmtNum(h.days_active)}</dd>
          <dt className="text-slate-500">Thao tác quan trọng</dt>
          <dd className="text-right text-slate-900 font-medium tabular-nums">{fmtNum(h.important_events)}</dd>
          <dt className="text-slate-500">Việc xong / quá hạn</dt>
          <dd className="text-right text-slate-900 font-medium tabular-nums">{fmtNum(row.done_tasks)} / {fmtNum(row.overdue_tasks)}</dd>
          <dt className="text-slate-500">Lần cuối thấy</dt>
          <dd className="text-right text-slate-900 font-medium tabular-nums">{fmtStamp(h.last_at)}</dd>
        </dl>
      </Card>

      <SectionHeading label="Giao tiếp nội bộ" hint="Dự án + Phân công — giữa nhân viên, không liên quan khách hàng" />

      <Card title="Sửa dữ liệu thật (nhật ký máy chủ)" icon={Database} right={`${fmtNum(crud.total)} lần`} className="xl:col-span-2">
        <CrudMatrix
          matrix={crud.matrix || []}
          onPick={(c) => openDrill(
            `${ACTION_LABEL[c.action] || c.action} · ${c.entity}`,
            `${fmtNum(c.events)} lần ghi nhận trong nhật ký máy chủ`,
            { source: 'audit', action_type: c.action },
          )}
        />
        {(crud.recent || []).length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mt-4 mb-2">Gần nhất</div>
            <LogList
              empty=""
              lines={(crud.recent || []).map((e) => ({
                at: e.at, tag: ACTION_LABEL[e.action] || e.action || '?', text: e.description || e.entity,
              }))}
            />
          </>
        )}
      </Card>

      <Card title="Bình luận nội bộ (Dự án / Phân công)" icon={MessageSquare} right={`${fmtNum(internalCmt.total)} bình luận`}>
        <dl className="grid grid-cols-3 gap-2 mb-3">
          {[
            { k: 'Tổng', v: fmtNum(internalCmt.total) },
            { k: 'Trả lời', v: fmtNum(internalCmt.replies) },
            { k: 'Độ dài TB', v: fmtNum(internalCmt.avg_chars) },
          ].map((x) => (
            <div key={x.k} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">{x.k}</dt>
              <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{x.v}</dd>
            </div>
          ))}
        </dl>
        <RankList
          rows={(internalCmt.by_source || []).map((s) => ({ key: s.source, label: s.source, value: s.events }))}
          unit="bình luận"
          empty="Không có bình luận nội bộ trong kỳ"
          onPick={() => openDrill('Bình luận nội bộ', 'Nội dung trao đổi trong dự án / phân công',
            { source: 'comments', module: 'internal' })}
        />
        {internalCmt.total > 0 && (
          <button
            type="button"
            onClick={() => openDrill('Bình luận nội bộ', 'Nội dung trao đổi trong dự án / phân công',
              { source: 'comments', module: 'internal' })}
            className="mt-2 text-[12px] text-teal-700 hover:underline cursor-pointer"
          >
            Đọc nội dung bình luận →
          </button>
        )}
        {internalCmt.total > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mt-4 mb-1.5">Giờ hay bình luận</div>
            <HourStrip hours={internalCmt.hours || new Array(24).fill(0)} compact />
          </>
        )}
      </Card>

      <SectionHeading label="Giao tiếp khách hàng" hint="Lead/Deal + tin nhắn Facebook/Zalo — gắn với khách hàng cụ thể" />

      <Card
        title="Khách đã trao đổi"
        icon={UserRound}
        right={`${fmtNum(row.customers?.total)} khách`}
      >
        <dl className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-[11px] text-slate-500">Qua bình luận Lead/Deal</dt>
            <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{fmtNum(row.customers?.comment_customers)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-[11px] text-slate-500">Tin nhắn đã gửi</dt>
            <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{fmtNum(row.customers?.messages)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2" title="Chỉ tính được từ sau khi bật ghi nhận người trả lời bình luận Facebook (migration 725) — số này sẽ thấp hơn thực tế với dữ liệu cũ.">
            <dt className="text-[11px] text-slate-500">Bình luận FB đã trả lời</dt>
            <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{fmtNum(row.fb_comments_replied)}</dd>
          </div>
        </dl>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Tự tay gửi tin (theo người bấm gửi)</div>
        <RankList
          rows={(row.customers?.channels || []).map((c) => ({
            key: `${c.channel}-${c.name}`, label: `${c.channel} · ${c.name}`, value: c.customers,
          }))}
          unit="khách"
          empty="Chưa quy được tin nhắn Facebook/Zalo nào cho người này — xem ghi chú ở thẻ “Khách đổ về theo kênh”"
        />

        {/* Kênh được CẤU HÌNH phụ trách (facebook_pages/zalo_oa_accounts.default_lead_owner_id).
            Để riêng khỏi phần trên: "được giao phụ trách" không đồng nghĩa "đã tự tay làm". */}
        {(row.customers?.owned_channels || []).length > 0 && (
          <>
            <div className="h-px bg-slate-100 my-3" />
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">
              Kênh được giao phụ trách (theo thiết lập trang)
            </div>
            <dl className="grid grid-cols-3 gap-2 mb-2">
              {[
                { k: 'Khách của kênh', v: fmtNum(row.customers.owned_customers) },
                { k: 'Khách nhắn đến', v: fmtNum(row.customers.owned_inbound) },
                { k: 'Tin trả lời đi', v: fmtNum(row.customers.owned_outbound) },
              ].map((x) => (
                <div key={x.k} className="rounded-xl bg-indigo-50/60 px-3 py-2">
                  <dt className="text-[11px] text-indigo-700/70">{x.k}</dt>
                  <dd className="text-lg font-bold text-indigo-900 tabular-nums leading-tight">{x.v}</dd>
                </div>
              ))}
            </dl>
            <RankList
              rows={(row.customers.owned_channels || []).map((c) => ({
                key: `${c.channel}||${c.name}`, label: `${c.channel} · ${c.name}`, value: c.customers,
              }))}
              unit="khách"
              onPick={(r) => {
                const [ch, nm] = String(r.key).split('||');
                openDrill(`Khách của ${nm}`, `${fmtNum(r.value)} khách — bấm một khách để đọc nội dung trao đổi`,
                  { source: 'channel_customers', channel: ch, channel_name: nm });
              }}
            />
            <div className="mt-2 text-[11px] text-slate-400 leading-5">
              Đây là <strong className="text-slate-500">phạm vi trách nhiệm</strong> theo thiết lập trang Facebook/Zalo,
              không phải khối lượng người này tự tay làm. Nếu “khách của kênh” lớn mà “tự tay gửi tin” bằng 0,
              nghĩa là kênh có khách nhưng người phụ trách chưa trả lời trong phần mềm.
            </div>
          </>
        )}
      </Card>

      <Card title="Bình luận Lead/Deal" icon={MessageSquare} right={`${fmtNum(customerCmt.total)} bình luận`}>
        <dl className="grid grid-cols-3 gap-2 mb-3">
          {[
            { k: 'Tổng', v: fmtNum(customerCmt.total) },
            { k: 'Trả lời', v: fmtNum(customerCmt.replies) },
            { k: 'Độ dài TB', v: fmtNum(customerCmt.avg_chars) },
          ].map((x) => (
            <div key={x.k} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">{x.k}</dt>
              <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{x.v}</dd>
            </div>
          ))}
        </dl>
        {customerCmt.total > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Giờ hay bình luận</div>
            <HourStrip hours={customerCmt.hours || new Array(24).fill(0)} compact />
          </>
        )}
        {!customerCmt.total && <Empty text="Không có bình luận Lead/Deal trong kỳ" />}
        {customerCmt.total > 0 && (
          <button
            type="button"
            onClick={() => openDrill('Bình luận Lead/Deal', 'Nội dung trao đổi gắn với khách hàng',
              { source: 'comments', module: 'customer' })}
            className="mt-3 text-[12px] text-teal-700 hover:underline cursor-pointer"
          >
            Đọc nội dung bình luận →
          </button>
        )}
      </Card>

      <SectionHeading label="Khác" />

      {/* Nhiệm vụ phát sinh — bảng gốc crm_assignments có phat_sinh_kind, KHÔNG lấy qua
          unified_tasks_v (view bỏ mất cột đánh dấu). Vì vậy số ở đây độc lập với "Việc xong/quá hạn". */}
      <Card title="Nhiệm vụ phát sinh" icon={Orbit} right={`${fmtNum(ps.total)} việc`}>
        <dl className="grid grid-cols-3 gap-2 mb-3">
          {[
            { k: 'Đang mở', v: fmtNum(ps.open), tone: 'text-slate-900' },
            { k: 'Quá hạn', v: fmtNum(ps.overdue), tone: ps.overdue ? 'text-rose-700' : 'text-slate-900' },
            { k: 'Đã xong', v: fmtNum(ps.done), tone: 'text-slate-900' },
          ].map((x) => (
            <div key={x.k} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">{x.k}</dt>
              <dd className={`text-lg font-bold tabular-nums leading-tight ${x.tone}`}>{x.v}</dd>
            </div>
          ))}
        </dl>
        <RankList
          rows={(ps.by_kind || []).map((k) => ({ key: k.kind, label: k.kind, value: k.events }))}
          unit="việc"
          empty="Không có nhiệm vụ phát sinh trong kỳ"
          onPick={() => openDrill('Nhiệm vụ phát sinh', `${fmtNum(ps.total)} việc — xem danh sách`, { source: 'phat_sinh' })}
        />
        {ps.total > 0 && (
          <button
            type="button"
            onClick={() => openDrill('Nhiệm vụ phát sinh', `${fmtNum(ps.total)} việc — xem danh sách`, { source: 'phat_sinh' })}
            className="mt-2 text-[12px] text-teal-700 hover:underline cursor-pointer"
          >
            Xem danh sách việc phát sinh →
          </button>
        )}
      </Card>

      <Card title="Thời gian hoàn thành việc" icon={CheckCircle2} right={`${fmtNum(row.done_tasks)} đã xong`}>
        <dl className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-[11px] text-slate-500">Đúng/sớm hạn</dt>
            <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">
              {fmtNum(row.done_on_time)}
              {row.early_days_avg > 0 && <span className="text-[11px] font-normal text-slate-400 ml-1">sớm TB {row.early_days_avg}d</span>}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-[11px] text-slate-500">Trễ hạn (đã xong)</dt>
            <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">
              {fmtNum(row.done_late)}
              {row.late_days_avg > 0 && <span className="text-[11px] font-normal text-rose-500 ml-1">trễ TB {row.late_days_avg}d</span>}
            </dd>
          </div>
        </dl>
        {row.overdue_tasks > 0 && (
          <div className="flex items-start gap-2 text-[12px] text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Đang quá hạn <strong>{fmtNum(row.overdue_tasks)}</strong> việc — trễ trung bình{' '}
              <strong>{row.overdue_days_avg}</strong> ngày tính đến hôm nay.
            </span>
          </div>
        )}
        {!row.done_tasks && !row.overdue_tasks && <Empty text="Không có việc nào hoàn thành hoặc quá hạn trong kỳ" />}
        {row.done_no_deadline > 0 && (
          <div className="text-[11px] text-slate-400 mt-2">{fmtNum(row.done_no_deadline)} việc đã xong không có hạn — không tính sớm/trễ.</div>
        )}
      </Card>

      <Card title="Màn hình chờ lâu nhất" icon={Hourglass} right={fmtMinutes(row.idle_minutes)}>
        <RankList
          tone="amber"
          unit="phút"
          empty="Không có khoảng chờ nào quá 2 phút"
          rows={(row.top_idle_paths || []).map((p) => ({ key: p.path, label: p.path, value: p.minutes }))}
          onPick={(r) => openDrill(`Chờ trên ${r.label}`, `${fmtNum(r.value)} phút chờ — xem các thao tác quanh khoảng đó`, { path: r.key })}
        />
      </Card>

      <Card title="Khó khăn ghi nhận" icon={AlertTriangle} right={`${fmtNum(difficultyCount(row))} tín hiệu`}>
        {(row.difficulty_signals || []).length === 0 && <Empty text="Không có tín hiệu nào" />}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {(row.difficulty_signals || []).map((s, i) => (
            <div key={i} className="group rounded-xl bg-rose-50/40 ring-1 ring-rose-100 px-3 py-2 hover:bg-rose-50 hover:ring-rose-200 transition-colors">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => openDrill(`Khó khăn tại ${s.path}`, `${fmtNum(s.count)} tín hiệu — xem toàn bộ câu hỏi`, { source: 'guide', path: s.path })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2 text-[11px] flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-rose-700 font-medium ring-1 ring-rose-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {SIGNAL_LABEL[s.kind] || s.kind}
                    </span>
                    <span className="text-slate-400">×{s.count}</span>
                    <span className="text-slate-500 truncate" title={s.path}>{s.path}</span>
                  </div>
                  {s.sample_question && (
                    <div className="mt-1.5 text-[13px] text-slate-600 line-clamp-2 italic">“{s.sample_question}”</div>
                  )}
                </button>
                <OpenScreenLink path={s.path} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Thao tác gần nhất trên giao diện"
        icon={Activity}
        right={
          <button
            onClick={() => openDrill('Toàn bộ thao tác', 'Tối đa 300 dòng gần nhất trong kỳ', {})}
            className="text-teal-700 hover:underline"
          >
            Xem tất cả
          </button>
        }
      >
        <LogList
          empty="Không có thao tác nào"
          lines={(h.recent || []).map((e) => ({
            at: e.at,
            tag: ACTION_LABEL[e.action] || e.action || '?',
            text: e.label || `${MODULE_LABEL[e.module] || e.module || ''} ${e.path}`.trim(),
          }))}
        />
      </Card>

      <DrillModal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title}
        subtitle={drill?.subtitle}
        query={drill?.query}
        days={days}
      />
    </div>
  );
}

/* ── Bảng chính ────────────────────────────────────────────────────────────── */
const COLS = 'minmax(210px,1.5fr) 96px 88px 92px 96px 88px 88px 104px 124px 36px';

const Th = ({ children, right }) => (
  <div className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${right ? 'text-right' : ''}`}>
    {children}
  </div>
);

function BehaviorInsightContent() {
  const [data, setData] = useState({ items: [], range: null, sources: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('active_events');
  const [openId, setOpenId] = useState(null);
  // Xem khách / hội thoại của 1 kênh từ bảng mức công ty — {title, subtitle, query}
  const [channelDrill, setChannelDrill] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/analytics/behavior-insight', { params: { date_from: isoDaysAgo(d) } });
      setData({ items: res.data?.items || [], range: res.data?.range || null, sources: res.data?.sources || null });
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được báo cáo');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = data.items.filter((r) => !kw || (r.name || '').toLowerCase().includes(kw));
    const val = (r) => ({
      active_events: r.active_events,
      crud: r.crud?.total || 0,
      comments: commentTotal(r),
      idle_minutes: r.idle_minutes,
      attention: attentionCount(r),
      done_tasks: r.done_tasks || 0,
    }[sortKey] || 0);
    return [...list].sort((a, b) => val(b) - val(a));
  }, [data.items, q, sortKey]);

  const totals = useMemo(() => {
    const t = { people: rows.length, events: 0, crud: 0, comments: 0, active: 0, idle: 0, difficulty: 0, overdue: 0, done: 0 };
    for (const r of rows) {
      t.events += r.active_events;
      t.crud += r.crud?.total || 0;
      t.comments += commentTotal(r);
      t.active += r.habit?.active_minutes || 0;
      t.idle += r.idle_minutes;
      t.difficulty += difficultyCount(r);
      t.overdue += r.overdue_tasks;
      t.done += r.done_tasks || 0;
    }
    return t;
  }, [rows]);

  const max = useMemo(() => ({
    events: Math.max(1, ...rows.map((r) => r.active_events)),
    crud: Math.max(1, ...rows.map((r) => r.crud?.total || 0)),
    comments: Math.max(1, ...rows.map((r) => commentTotal(r))),
    idle: Math.max(1, ...rows.map((r) => r.idle_minutes)),
    customers: Math.max(1, ...rows.map((r) => r.customers?.total || 0)),
    hour: Math.max(1, ...rows.flatMap((r) => r.habit?.hours || [0])),
  }), [rows]);

  /** user_id -> tên, để bảng kênh hiện tên người phụ trách thay vì uuid. */
  const nameOf = useMemo(
    () => new Map((data.items || []).map((r) => [r.user_id, r.name])),
    [data.items],
  );

  const issues = data.sources?.comment_issues || [];

  return (
    <div className="min-h-screen bg-slate-50 bg-[radial-gradient(60rem_30rem_at_70%_-10%,rgba(13,148,136,0.08),transparent)]">
      <div className="max-w-[1400px] mx-auto p-6 space-y-5">
        {/* Tiêu đề + chọn kỳ */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/management/work-unified"
              className="w-9 h-9 rounded-xl grid place-items-center bg-white ring-1 ring-slate-200 text-slate-400 hover:text-slate-700 hover:ring-slate-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-[22px] leading-tight font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-teal-50 ring-1 ring-teal-100 grid place-items-center">
                  <Activity className="w-4 h-4 text-teal-600" />
                </span>
                Hành vi &amp; khó khăn người dùng
              </h1>
              <p className="text-[13px] text-slate-500 mt-1">
                Mỗi dòng là một nhân viên — bấm vào để xem chi tiết thói quen, dữ liệu đã sửa và khó khăn.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-white ring-1 ring-slate-200 p-1 gap-1 shadow-sm">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => { setDays(p.days); setOpenId(null); }}
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all ${
                    days === p.days
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >{p.label}</button>
              ))}
            </div>
            <Link
              to="/management/behavior-galaxy"
              className="px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 shadow-sm text-[13px] font-medium text-slate-600 hover:text-teal-700 hover:ring-teal-200 inline-flex items-center gap-2 transition-colors"
            >
              <Orbit className="w-4 h-4" /> Thiên hà 3D
            </Link>
            <button
              onClick={() => load(days)}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 shadow-sm text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:ring-slate-300 inline-flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Tải lại
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-rose-50 ring-1 ring-rose-200 text-rose-700 text-sm">{error}</div>
        )}

        {/* Cảnh báo dữ liệu đọc chưa trọn vẹn — không giấu thành số 0 */}
        {(data.sources?.truncated || issues.length > 0) && (
          <div className="px-4 py-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-800 text-[13px] space-y-1">
            {data.sources?.truncated && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Dữ liệu chạm trần {fmtNum(data.sources.row_limit)} dòng nên thiếu phần cũ nhất — chọn kỳ ngắn hơn để số liệu đủ.</span>
              </div>
            )}
            {issues.map((it, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Bình luận “{it.source}” đọc chưa đủ: {it.reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ô số tổng */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Tile icon={Users} label="Nhân viên" value={fmtNum(totals.people)} />
          <Tile
            icon={UserRound}
            label="Khách đã trao đổi"
            value={fmtNum(data.sources?.customers_total)}
            tone="teal"
            sub="Đếm riêng từng khách, không cộng trùng"
          />
          <Tile icon={Activity} label="Thao tác" value={fmtNum(totals.events)} tone="teal" />
          <Tile icon={Database} label="Sửa dữ liệu" value={fmtNum(totals.crud)} tone="teal" />
          <Tile icon={MessageSquare} label="Bình luận" value={fmtNum(totals.comments)} tone="teal" />
          <Tile icon={Clock} label="Thời gian làm" value={fmtMinutes(totals.active)} />
          <Tile icon={Hourglass} label="Thời gian chờ" value={fmtMinutes(totals.idle)} tone="amber" sub="Khoảng ngừng quá 2 phút" />
          <Tile icon={AlertTriangle} label="Cần chú ý" value={fmtNum(totals.difficulty + totals.overdue)} tone="rose" sub={`${fmtNum(totals.difficulty)} khó khăn · ${fmtNum(totals.overdue)} quá hạn`} />
          <Tile icon={CheckCircle2} label="Việc hoàn thành" value={fmtNum(totals.done)} tone="teal" />
        </div>

        {/* Tìm + sắp xếp */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm nhân viên…"
              className="pl-9 pr-3 py-2 text-[13px] rounded-xl ring-1 ring-slate-200 bg-white w-60 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="px-3 py-2 text-[13px] rounded-xl ring-1 ring-slate-200 bg-white shadow-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="ml-auto text-[11px] text-slate-400">
            {data.range?.from ? `Từ ${fmtStamp(data.range.from)} đến nay` : ''} · {fmtNum(rows.length)} nhân viên
          </div>
        </div>

        {/* Bảng */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className="grid border-b border-slate-200 bg-slate-50/80 backdrop-blur sticky top-0 z-10" style={{ gridTemplateColumns: COLS }}>
                <Th>Nhân viên</Th>
                <Th right>Khách</Th>
                <Th right>Thao tác</Th>
                <Th right>Sửa dữ liệu</Th>
                <Th right>Bình luận</Th>
                <Th right>Làm việc</Th>
                <Th right>Chờ</Th>
                <Th right>Cần chú ý</Th>
                <Th>Nhịp 24 giờ</Th>
                <Th />
              </div>

              {loading && (
                <div className="px-4 py-14 text-center text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Đang tổng hợp…
                </div>
              )}
              {!loading && !rows.length && (
                <div className="px-4 py-14 text-center text-slate-400 text-sm">
                  <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-300" /> Không có dữ liệu trong kỳ này
                </div>
              )}

              {!loading && rows.map((r, idx) => {
                const h = r.habit || {};
                const attention = attentionCount(r);
                const open = openId === r.user_id;
                return (
                  <div key={r.user_id} className="border-b border-slate-100 last:border-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(open ? null : r.user_id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : r.user_id); } }}
                      className={`grid items-center cursor-pointer border-l-2 transition-colors ${
                        open ? 'bg-teal-50/50 border-teal-500' : 'border-transparent hover:bg-slate-50/80 hover:border-slate-200'
                      }`}
                      style={{ gridTemplateColumns: COLS }}
                    >
                      <div className="px-3 py-3 min-w-0 flex items-center gap-2.5">
                        <span className="w-8 h-8 shrink-0 rounded-full bg-slate-100 ring-1 ring-slate-200 grid place-items-center text-[11px] font-bold text-slate-500">
                          {initials(r.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-slate-900 truncate leading-tight">
                            <span className="text-slate-300 tabular-nums mr-1.5">{idx + 1}</span>{r.name}
                          </span>
                          <span className="block text-[11px] text-slate-400 truncate">{r.role || r.email || ''}</span>
                        </span>
                      </div>
                      <div className="px-3 text-right">
                        <span className={`text-[13px] font-semibold tabular-nums ${r.customers?.total ? 'text-slate-900' : 'text-slate-300'}`}>
                          {r.customers?.total ? fmtNum(r.customers.total) : '—'}
                        </span>
                        <Bar value={r.customers?.total || 0} max={max.customers} />
                      </div>
                      <div className="px-3 text-right">
                        <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{fmtNum(r.active_events)}</span>
                        <Bar value={r.active_events} max={max.events} />
                      </div>
                      <div className="px-3 text-right">
                        <span className="text-[13px] text-slate-600 tabular-nums">{r.crud?.total ? fmtNum(r.crud.total) : '—'}</span>
                        <Bar value={r.crud?.total || 0} max={max.crud} />
                      </div>
                      <div className="px-3 text-right">
                        <span className="text-[13px] text-slate-600 tabular-nums">{commentTotal(r) ? fmtNum(commentTotal(r)) : '—'}</span>
                        <Bar value={commentTotal(r)} max={max.comments} />
                      </div>
                      <div className="px-3 text-right text-[13px] text-slate-600 tabular-nums">{fmtMinutesShort(h.active_minutes)}</div>
                      <div className="px-3 text-right">
                        <span className={`text-[13px] tabular-nums ${r.idle_minutes ? 'text-amber-700 font-medium' : 'text-slate-300'}`}>
                          {fmtMinutesShort(r.idle_minutes)}
                        </span>
                        <Bar value={r.idle_minutes} max={max.idle} tone="amber" />
                      </div>
                      <div className="px-3 text-right">
                        {attention ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 ring-1 ring-rose-200 text-rose-700 text-[13px] font-semibold"
                            title={`${fmtNum(difficultyCount(r))} tín hiệu khó khăn · ${fmtNum(r.overdue_tasks)} việc quá hạn`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {fmtNum(attention)}
                          </span>
                        ) : <span className="text-[13px] text-slate-300">—</span>}
                      </div>
                      <div className="px-3"><HourStrip hours={h.hours || new Array(24).fill(0)} compact /></div>
                      <div className="text-slate-300">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                    {open && <UserDetail row={r} days={days} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Khách đổ về theo từng fanpage / Zalo OA — mức công ty, không quy cho cá nhân được */}
        {!loading && (data.sources?.channels || []).length > 0 && (
          <Card
            title="Khách đổ về theo kênh"
            icon={Share2}
            right={`${fmtNum((data.sources.channels || []).reduce((n, c) => n + c.customers, 0))} khách · ${fmtNum((data.sources.channels || []).length)} trang`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[620px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="text-left font-semibold py-2">Trang / OA</th>
                    <th className="text-left font-semibold py-2 px-3">Người phụ trách</th>
                    <th className="text-right font-semibold py-2 px-3">Khách</th>
                    <th className="text-right font-semibold py-2 px-3">Đã thành Lead</th>
                    <th className="text-right font-semibold py-2 px-3">Khách nhắn</th>
                    <th className="text-right font-semibold py-2 px-3">Trả lời</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.sources.channels || []).map((c) => {
                    const maxC = Math.max(1, ...(data.sources.channels || []).map((x) => x.customers));
                    const rate = c.customers ? Math.round((c.leads / c.customers) * 100) : 0;
                    return (
                      <tr key={`${c.channel}-${c.name}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-3 min-w-0">
                          <button
                            type="button"
                            className="w-full text-left cursor-pointer group/ch"
                            title={`Xem khách của ${c.name}`}
                            onClick={() => setChannelDrill({
                              title: `Khách của ${c.name}`,
                              subtitle: `${fmtNum(c.customers)} khách — bấm một khách để đọc nội dung trao đổi`,
                              query: { source: 'channel_customers', channel: c.channel, channel_name: c.name },
                            })}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                c.channel === 'Zalo' ? 'bg-sky-50 text-sky-700' : 'bg-indigo-50 text-indigo-700'
                              }`}>{c.channel}</span>
                              <span className="text-slate-800 truncate group-hover/ch:text-teal-700" title={c.name}>{c.name}</span>
                            </div>
                            <Bar value={c.customers} max={maxC} />
                          </button>
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {c.owner_user_id
                            ? (nameOf.get(c.owner_user_id) || 'Nhân viên khác công ty')
                            : <span className="text-amber-700 text-[12px]">Chưa gán người phụ trách</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-900 tabular-nums">{fmtNum(c.customers)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          <span className="text-slate-900">{fmtNum(c.leads)}</span>
                          <span className="text-slate-400 text-[11px]"> ({rate}%)</span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 tabular-nums">{fmtNum(c.inbound)}</td>
                        <td className="py-2 px-3 text-right text-slate-600 tabular-nums">{fmtNum(c.outbound)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {Object.keys(data.sources?.outbound_by_via || {}).length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Tin trả lời đến từ đâu</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.sources.outbound_by_via)
                    .sort((a, b) => b[1] - a[1])
                    .map(([via, n]) => (
                      <span
                        key={via}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] ring-1 ${
                          via === 'app'
                            ? 'bg-teal-50 ring-teal-200 text-teal-800'
                            : via === 'meta_inbox' || via === '(chưa ghi nguồn)'
                              ? 'bg-amber-50 ring-amber-200 text-amber-800'
                              : 'bg-slate-50 ring-slate-200 text-slate-700'
                        }`}
                      >
                        {VIA_LABEL[via] || via}
                        <strong className="tabular-nums">{fmtNum(n)}</strong>
                      </span>
                    ))}
                </div>
                {!!(data.sources.outbound_by_via['(chưa ghi nguồn)'] || data.sources.outbound_by_via.meta_inbox) && (
                  <div className="mt-2 flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Tin trả lời bằng app Facebook/Zalo gốc <strong>không quy được cho ai</strong> — Facebook không
                      cho biết admin nào bấm gửi. Muốn báo cáo đủ, nhân viên phải trả lời trong phần mềm này.
                      Nhóm “Tin cũ, chưa ghi nguồn” là tin trước ngày 17/10/2026, sẽ tự giảm dần.
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Bình luận công khai Facebook (post/quảng cáo) — KHÁC tin nhắn Messenger ở thẻ trên.
            Zalo OA không có khái niệm bình luận công khai nên không có cột tương ứng. */}
        {!loading && data.sources?.facebook_comments?.total > 0 && (
          <Card
            title="Bình luận Facebook"
            icon={MessageSquare}
            right={`${fmtNum(data.sources.facebook_comments.total)} bình luận`}
          >
            <dl className="grid grid-cols-3 gap-2 mb-3">
              {[
                { k: 'Đã trả lời', v: fmtNum(data.sources.facebook_comments.replied) },
                { k: 'Chưa trả lời', v: fmtNum(data.sources.facebook_comments.unreplied) },
                { k: 'Biết rõ ai trả lời', v: fmtNum(data.sources.facebook_comments.attributed) },
              ].map((x) => (
                <div key={x.k} className="rounded-xl bg-slate-50 px-3 py-2">
                  <dt className="text-[11px] text-slate-500">{x.k}</dt>
                  <dd className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{x.v}</dd>
                </div>
              ))}
            </dl>
            <RankList
              rows={(data.sources.facebook_comments.by_page || []).map((p) => ({ key: p.name, label: p.name, value: p.count }))}
              unit="bình luận"
              empty="Không có bình luận trong kỳ"
            />
            <div className="mt-3 flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Chỉ biết <strong>nhân viên nào</strong> đã trả lời cho các bình luận trả lời từ sau khi tính năng này
                được bật (migration 725) — bình luận cũ hơn dù đã trả lời cũng không quy được cho ai.
              </span>
            </div>
          </Card>
        )}
        {!loading && data.sources?.facebook_comments_issue && (
          <div className="col-span-full flex items-start gap-2 text-[12px] text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Không đọc được bình luận Facebook: {data.sources.facebook_comments_issue}</span>
          </div>
        )}

        <DrillModal
          open={!!channelDrill}
          onClose={() => setChannelDrill(null)}
          title={channelDrill?.title}
          subtitle={channelDrill?.subtitle}
          query={channelDrill?.query}
          days={days}
        />

        {/* Ma trận người × giờ */}
        {!loading && rows.length > 0 && (
          <Card title="Khung giờ làm việc của cả nhóm" icon={Clock} right={`${fmtNum(Math.min(rows.length, 40))} người × 24 giờ`}>
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid gap-1" style={{ gridTemplateColumns: '180px repeat(24, 1fr)' }}>
                  <div />
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} className="text-[10px] text-slate-400 text-center">{i % 3 === 0 ? String(i).padStart(2, '0') : ''}</div>
                  ))}
                  {rows.slice(0, 40).map((r) => (
                    <HeatRow key={r.user_id} row={r} max={max.hour} onClick={() => setOpenId(openId === r.user_id ? null : r.user_id)} />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4 text-[11px] text-slate-400">
                  <span>Ít thao tác</span>
                  {[0.1, 0.3, 0.5, 0.7, 1].map((t) => (
                    <span key={t} className="w-7 h-3 rounded" style={{ background: `color-mix(in oklab, #0d9488 ${Math.round(12 + t * 88)}%, #ffffff)` }} />
                  ))}
                  <span>Nhiều thao tác</span>
                </div>
                {rows.length > 40 && (
                  <div className="text-[11px] text-slate-400 mt-2">
                    Đang hiện 40 / {fmtNum(rows.length)} người — dùng ô tìm kiếm để xem người còn lại.
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <p className="text-[11px] text-slate-400 leading-5 pb-2">
          <strong className="text-slate-500">Cách tính:</strong> “Chờ” là khoảng cách giữa hai thao tác quá 2 phút
          (cắt trần 15 phút mỗi lần). “Khó khăn” là khi trợ lý báo bước thực hiện hỏng, hoặc người dùng hỏi lại
          từ lượt thứ 3 trong cùng một cuộc. “Sửa dữ liệu” lấy từ nhật ký máy chủ — chỉ ghi cho dự án, công việc
          và phê duyệt, chưa ghi cho CRM. “Bình luận” gộp bình luận Lead/Deal, dự án và phân công.
        </p>
      </div>
    </div>
  );
}

/* Một hàng của ma trận — tách riêng để không lồng map trong grid */
function HeatRow({ row, max, onClick }) {
  const hours = row.habit?.hours || new Array(24).fill(0);
  return (
    <>
      <button onClick={onClick} className="text-[12px] text-slate-600 truncate text-left hover:text-teal-700 pr-2 transition-colors" title={row.name}>
        {row.name}
      </button>
      {hours.map((v, i) => (
        <HeatCell key={i} value={v} max={max} className="h-4" title={`${row.name} · ${String(i).padStart(2, '0')}:00 — ${fmtNum(v)} thao tác`} />
      ))}
    </>
  );
}

export default function BehaviorInsightPage() {
  return <BehaviorInsightContent />;
}
