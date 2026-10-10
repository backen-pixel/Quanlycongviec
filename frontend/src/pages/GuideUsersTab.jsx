/**
 * TAB "NGƯỜI DÙNG" — ai đang dùng Trợ lý hướng dẫn, dùng bao nhiêu, dùng vào việc gì.
 *
 * Dữ liệu từ GET /copilotkit/usage/users (bảng tổng) và /usage/users/:id (chi tiết một người),
 * gộp từ hai bảng đang ghi sẵn mỗi lượt hỏi — xem backend/src/helpers/guideUserUsage.js.
 *
 * Chỉ hiện TOKEN, không quy ra tiền: DB chỉ lưu tổng token, không tách input / output / cache, mà
 * giá mỗi loại chênh nhau nhiều lần. Chi phí chính xác từng lượt xem ở tab "Chi phí" của bảng
 * Hành động trong khung chat.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, RefreshCw, Users, MessageSquare, Hash, AlertTriangle, X, ChevronDown, ChevronRight,
} from 'lucide-react';
import api from '../lib/api';
import { TOOL_META } from '../features/guide/lib/toolRegistry';

const PRESETS = [
  { key: 'today', label: 'Hôm nay', days: 1 },
  { key: '7d', label: '7 ngày', days: 7 },
  { key: '30d', label: '30 ngày', days: 30 },
  { key: '90d', label: '90 ngày', days: 90 },
];

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD — cùng mốc với cột `day` ở backend. */
function vnToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function shiftDay(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const num = (n) => (Number(n) || 0).toLocaleString('vi-VN');

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function dayLabel(day) {
  const [, m, d] = String(day).split('-');
  return `${Number(d)}/${Number(m)}`;
}

function toolLabel(tool) {
  const meta = TOOL_META[tool];
  return meta ? `${meta.icon} ${meta.label}` : tool;
}

const COLUMNS = [
  { key: 'full_name', label: 'Người dùng', sort: (u) => (u.full_name || u.email || '').toLowerCase() },
  { key: 'questions', label: 'Câu hỏi', num: true },
  { key: 'active_days', label: 'Ngày dùng', num: true },
  { key: 'threads', label: 'Hội thoại', num: true },
  { key: 'tokens', label: 'Token', num: true },
  { key: 'avg_steps', label: 'Bước TB', num: true },
  { key: 'failed_turns', label: 'Lượt có lỗi', num: true },
  { key: 'last_at', label: 'Lần cuối', sort: (u) => String(u.last_at || '') },
];

function Tile({ icon, label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</div>
      <div className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{value}</div>
      {hint ? <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div> : null}
    </div>
  );
}

function StatusChip({ status }) {
  const bad = ['failed', 'empty', 'cancelled'].includes(status);
  const run = status === 'running' || status === 'waiting';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
      bad ? 'bg-red-50 text-red-700' : run ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
    }`}
    >
      {status || 'done'}
    </span>
  );
}

function UserDetail({ userId, range, onClose, showToast }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [openTurn, setOpenTurn] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/copilotkit/usage/users/${userId}`, { params: range })
      .then(({ data: d }) => { if (alive) setData(d); })
      .catch((e) => showToast?.(e?.response?.data?.reason || e?.response?.data?.error || 'Không tải được chi tiết người dùng', 'err'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, range, showToast]);

  const maxQ = useMemo(() => Math.max(1, ...(data?.series || []).map((x) => x.questions)), [data]);

  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold text-gray-900 truncate">
            {data?.user?.full_name || data?.user?.email || 'Người dùng'}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {[data?.user?.email, data?.user?.role, data?.user?.company_name].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" aria-label="Đóng chi tiết">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : !data?.ok ? (
        <div className="text-sm text-red-600">{data?.reason || 'Không đọc được dữ liệu.'}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <Tile label="Câu hỏi" value={num(data.totals.questions)} />
            <Tile label="Ngày dùng" value={num(data.totals.active_days)} />
            <Tile label="Hội thoại" value={num(data.totals.threads)} />
            <Tile label="Token" value={num(data.totals.tokens)} />
            <Tile label="Bước TB / câu" value={data.totals.avg_steps} />
            <Tile label="Lượt có lỗi" value={num(data.totals.failed_turns)} hint={`${data.totals.failed_rate}%`} />
            <Tile label="Có nhật ký" value={num(data.totals.logged_turns)} hint="lượt có câu hỏi/trả lời" />
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Số câu hỏi theo ngày</div>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 h-28 min-w-full" style={{ minWidth: `${(data.series.length) * 18}px` }}>
                {data.series.map((x) => (
                  <div key={x.day} className="flex-1 flex flex-col items-center justify-end h-full min-w-[14px]"
                    title={`${dayLabel(x.day)}: ${x.questions} câu · ${num(x.tokens)} token${x.failed ? ` · ${x.failed} lượt lỗi` : ''}`}
                  >
                    <div
                      className={`w-full rounded-t ${x.failed ? 'bg-amber-400' : 'bg-indigo-500'} ${x.questions ? '' : 'opacity-20'}`}
                      style={{ height: `${Math.max(x.questions ? 6 : 2, (x.questions / maxQ) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1" style={{ minWidth: `${(data.series.length) * 18}px` }}>
                {data.series.map((x, i) => (
                  <div key={x.day} className="flex-1 min-w-[14px] text-center text-[9px] text-gray-400">
                    {data.series.length <= 14 || i % Math.ceil(data.series.length / 14) === 0 ? dayLabel(x.day) : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2">Màn hình hỏi nhiều nhất</div>
              {data.top_paths.length ? (
                <ul className="space-y-1">
                  {data.top_paths.map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-2 text-xs">
                      <code className="truncate text-gray-700">{p.key}</code>
                      <span className="tabular-nums text-gray-500 shrink-0">{p.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <div className="text-xs text-gray-400">Chưa có nhật ký.</div>}
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2">Tool trợ lý đã dùng cho người này</div>
              {data.tools.length ? (
                <ul className="space-y-1">
                  {data.tools.map((t) => (
                    <li key={t.tool} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-700">{toolLabel(t.tool)}</span>
                      <span className="tabular-nums shrink-0 text-gray-500">
                        {t.count}{t.failed ? <span className="text-red-600"> · {t.failed} lỗi</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <div className="text-xs text-gray-400">Chưa gọi tool nào.</div>}
              {data.models.length ? (
                <div className="flex flex-wrap gap-1 mt-3">
                  {data.models.map((m) => (
                    <span key={m.key} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{m.key} · {m.count}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">
              Câu hỏi gần nhất{data.recent.length ? ` (${data.recent.length})` : ''}
            </div>
            {data.recent.length ? (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {data.recent.map((t) => {
                  const k = `${t.thread_id}#${t.turn_no}`;
                  const open = openTurn === k;
                  return (
                    <li key={k} className="px-3 py-2">
                      <button type="button" onClick={() => setOpenTurn(open ? null : k)} className="w-full text-left flex items-start gap-2 cursor-pointer">
                        {open ? <ChevronDown className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-900 break-words">{t.question}</div>
                          <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2 mt-0.5">
                            <span>{when(t.created_at)}</span>
                            {t.path ? <code>{t.path}</code> : null}
                            <span>{t.step_count} bước</span>
                            {t.has_failed_step ? <span className="text-red-600 inline-flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" />có bước lỗi</span> : null}
                            {t.model ? <span>{t.model}</span> : null}
                          </div>
                        </div>
                      </button>
                      {open ? (
                        <div className="mt-2 ml-6 space-y-2">
                          {t.steps?.length ? (
                            <ol className="space-y-1">
                              {t.steps.map((s, i) => (
                                <li key={i} className="text-xs flex items-center gap-2">
                                  <span className="text-gray-400 tabular-nums w-4 text-right">{i + 1}</span>
                                  <span className="text-gray-700 truncate">{s.summary || toolLabel(s.tool)}</span>
                                  <StatusChip status={s.status} />
                                </li>
                              ))}
                            </ol>
                          ) : null}
                          <div className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-2 max-h-64 overflow-y-auto">
                            {t.answer || '(không có câu trả lời trong nhật ký)'}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : <div className="text-xs text-gray-400">Không có câu hỏi nào trong nhật ký ở khoảng thời gian này.</div>}
          </div>
        </>
      )}
    </div>
  );
}

export default function GuideUsersTab({ showToast }) {
  const [preset, setPreset] = useState('7d');
  const [range, setRange] = useState(() => ({ from: shiftDay(vnToday(), -6), to: vnToday() }));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'questions', dir: 'desc' });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/copilotkit/usage/users', { params: range });
      setData(d);
      if (!d?.ok) showToast?.(d?.reason || 'Không đọc được thống kê', 'err');
    } catch (e) {
      showToast?.(e?.response?.data?.reason || e?.response?.data?.error || 'Không tải được thống kê người dùng', 'err');
    } finally {
      setLoading(false);
    }
  }, [range, showToast]);

  useEffect(() => { load(); }, [load]);

  const pickPreset = (p) => {
    setPreset(p.key);
    const to = vnToday();
    setRange({ from: shiftDay(to, -(p.days - 1)), to });
  };

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[1];
    const val = col.sort || ((u) => Number(u[col.key]) || 0);
    return (data?.users || [])
      .filter((u) => !t || `${u.full_name} ${u.email} ${u.company_name}`.toLowerCase().includes(t))
      .sort((a, b) => {
        const x = val(a); const y = val(b);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return sort.dir === 'asc' ? c : -c;
      });
  }, [data, search, sort]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => pickPreset(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${preset === p.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <input type="date" value={range.from} max={range.to}
            onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, from: e.target.value })); }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
            aria-label="Từ ngày"
          />
          <span>→</span>
          <input type="date" value={range.to} min={range.from}
            onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, to: e.target.value })); }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
            aria-label="Đến ngày"
          />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, email, công ty…"
            className="w-full border border-gray-200 rounded-lg pl-8 pr-2 py-1.5 text-sm"
          />
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải lại
        </button>
      </div>

      {data?.ok && !data.sources?.quota_enforcing ? (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Hạn mức ngày đang tắt: lượt hỏi mới không được ghi token, số câu hỏi của các lượt đó lấy từ nhật ký hỏi đáp.
        </div>
      ) : null}
      {data?.truncated ? (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Khoảng thời gian quá nhiều dữ liệu, số liệu đã bị cắt bớt — hãy thu hẹp khoảng ngày.
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Tile icon={<Users className="h-3.5 w-3.5" />} label="Người dùng" value={num(data?.totals?.users)} />
        <Tile icon={<MessageSquare className="h-3.5 w-3.5" />} label="Câu hỏi" value={num(data?.totals?.questions)} />
        <Tile icon={<Hash className="h-3.5 w-3.5" />} label="Token" value={num(data?.totals?.tokens)} />
        <Tile label="Bước TB / câu" value={data?.totals?.avg_steps ?? 0} />
        <Tile icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Lượt có lỗi" value={num(data?.totals?.failed_turns)} hint={`${data?.totals?.failed_rate ?? 0}% lượt có nhật ký`} />
        <Tile label="Khoảng ngày" value={`${dayLabel(range.from)} → ${dayLabel(range.to)}`} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={`px-3 py-2 font-semibold whitespace-nowrap ${c.num ? 'text-right' : 'text-left'}`}>
                    <button type="button" onClick={() => toggleSort(c.key)} className="cursor-pointer hover:text-gray-900">
                      {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 font-semibold text-left whitespace-nowrap">Màn hình hay hỏi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={COLUMNS.length + 1} className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin text-indigo-500 inline" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 1} className="py-10 text-center text-gray-400 text-sm">Không có ai dùng trợ lý trong khoảng thời gian này.</td></tr>
              ) : rows.map((u) => (
                <tr key={u.user_id} onClick={() => setSelected(u.user_id)}
                  className={`cursor-pointer hover:bg-indigo-50/40 ${selected === u.user_id ? 'bg-indigo-50' : ''}`}
                >
                  <td className="px-3 py-2 min-w-[180px]">
                    <div className="font-medium text-gray-900 truncate">{u.full_name || u.email || u.user_id.slice(0, 8)}</div>
                    <div className="text-[11px] text-gray-500 truncate">{[u.email, u.company_name].filter(Boolean).join(' · ')}</div>
                    {u.last_question ? <div className="text-[11px] text-gray-400 truncate max-w-[260px]" title={u.last_question}>“{u.last_question}”</div> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{num(u.questions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(u.active_days)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(u.threads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(u.tokens)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.avg_steps}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${u.failed_turns ? 'text-red-600' : ''}`}>
                    {num(u.failed_turns)}{u.logged_turns ? <span className="text-[10px] text-gray-400"> ({u.failed_rate}%)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-xs text-gray-600">{when(u.last_at)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[220px]">
                    {u.top_paths?.length ? u.top_paths.map((p) => <div key={p.key} className="truncate"><code>{p.key}</code> · {p.count}</div>) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <UserDetail key={`${selected}|${range.from}|${range.to}`} userId={selected} range={range} onClose={() => setSelected(null)} showToast={showToast} />
      ) : (
        <p className="text-xs text-gray-400">Bấm vào một người để xem chi tiết: số câu theo ngày, màn hình hay hỏi, tool trợ lý đã dùng và từng câu hỏi kèm câu trả lời.</p>
      )}
    </div>
  );
}
