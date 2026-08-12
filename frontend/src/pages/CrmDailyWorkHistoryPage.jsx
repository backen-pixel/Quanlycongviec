/**
 * Lịch sử công việc trong ngày trên hệ thống — tóm tắt + chi tiết timeline.
 * API: GET /api/crm/daily-reports/history?date=&user_id=
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  ArrowLeft, Activity, Calendar, MessageSquare, ArrowRightLeft,
  UserPlus, CheckSquare, Filter,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayISO = () => toISO(new Date());

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const fmtDMY = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

const KIND_META = {
  event: { label: 'Sự kiện', cls: 'bg-violet-100 text-violet-800', icon: Calendar },
  activity: { label: 'Tương tác', cls: 'bg-sky-100 text-sky-800', icon: Activity },
  comment: { label: 'Bình luận', cls: 'bg-amber-100 text-amber-800', icon: MessageSquare },
  stage_move: { label: 'Chuyển cột', cls: 'bg-indigo-100 text-indigo-800', icon: ArrowRightLeft },
  deal_won: { label: 'Thắng deal', cls: 'bg-emerald-100 text-emerald-800', icon: ArrowRightLeft },
  deal_lost: { label: 'Mất deal', cls: 'bg-red-100 text-red-800', icon: ArrowRightLeft },
  lead_created: { label: 'Tạo Lead', cls: 'bg-teal-100 text-teal-800', icon: UserPlus },
  deal_created: { label: 'Tạo Deal', cls: 'bg-teal-100 text-teal-800', icon: UserPlus },
  task_done: { label: 'Task xong', cls: 'bg-gray-100 text-gray-700', icon: CheckSquare },
};

function Avatar({ user, size = 'h-9 w-9' }) {
  const name = user?.full_name || '?';
  if (user?.avatar) {
    return <img src={user.avatar} alt={name} className={`${size} rounded-full object-cover shrink-0`} />;
  }
  const initials = name.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className={`${size} rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0`}>
      {initials || '?'}
    </span>
  );
}

export default function CrmDailyWorkHistoryPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || todayISO();
  const userId = params.get('user_id') || user?.id || user?.userId || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [kindFilter, setKindFilter] = useState('all');
  const [view, setView] = useState('summary'); // summary | detail

  const setDate = (d) => {
    const next = new URLSearchParams(params);
    next.set('date', d);
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get('/crm/daily-reports/history', {
        params: { date, ...(userId ? { user_id: userId } : {}) },
      });
      setData(res);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được lịch sử');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, userId]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary || {
    events: 0, activities: 0, comments: 0, stage_moves: 0,
    leads_created: 0, deals_created: 0, tasks_done: 0, interactions: 0,
  };

  const items = useMemo(() => {
    const all = data?.items || [];
    if (kindFilter === 'all') return all;
    if (kindFilter === 'interactions') {
      return all.filter((i) => i.kind === 'activity' || i.kind === 'comment');
    }
    if (kindFilter === 'stage') {
      return all.filter((i) => ['stage_move', 'deal_won', 'deal_lost'].includes(i.kind));
    }
    return all.filter((i) => i.kind === kindFilter);
  }, [data, kindFilter]);

  const summaryCards = [
    { key: 'events', label: 'Sự kiện', value: s.events, tone: 'text-violet-700' },
    { key: 'interactions', label: 'Tương tác', value: s.interactions, tone: 'text-sky-700' },
    { key: 'stage_moves', label: 'Chuyển cột', value: s.stage_moves, tone: 'text-indigo-700' },
    { key: 'leads_created', label: 'Lead tạo mới', value: s.leads_created, tone: 'text-teal-700' },
    { key: 'deals_created', label: 'Deal tạo mới', value: s.deals_created, tone: 'text-teal-700' },
    { key: 'tasks_done', label: 'Task hoàn thành', value: s.tasks_done, tone: 'text-gray-700' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/crm/daily-reports" className="mb-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Báo cáo hằng ngày
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
            <CalendarDays className="h-6 w-6 text-indigo-600" />
            Lịch sử công việc trong ngày
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Tóm tắt và chi tiết những gì đã làm trên hệ thống theo ngày.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate(addDaysISO(date, -1))} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
          <button type="button" onClick={() => setDate(addDaysISO(date, 1))} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDate(todayISO())} className="ml-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs hover:bg-gray-50">
            Hôm nay
          </button>
        </div>
      </div>

      {data?.user && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <Avatar user={data.user} />
          <div>
            <div className="font-semibold text-gray-900">{data.user.full_name}</div>
            <div className="text-xs text-gray-500">
              {data.user.department_name || '—'} · Ngày {fmtDMY(date)} · {data.total_items || 0} hoạt động
            </div>
          </div>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => setView('summary')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === 'summary' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Tóm tắt
        </button>
        <button
          type="button"
          onClick={() => setView('detail')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === 'detail' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Chi tiết
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải lịch sử…
        </div>
      ) : (
        <>
          {view === 'summary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {summaryCards.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setKindFilter(
                        c.key === 'interactions' ? 'interactions'
                          : c.key === 'stage_moves' ? 'stage'
                            : c.key === 'events' ? 'event'
                              : c.key === 'tasks_done' ? 'task_done'
                                : 'all',
                      );
                      setView('detail');
                    }}
                    className="rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-indigo-200 hover:bg-indigo-50/30"
                  >
                    <div className="text-xs text-gray-500">{c.label}</div>
                    <div className={`mt-1 text-2xl font-semibold tabular-nums ${c.tone}`}>{c.value}</div>
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800">
                  Hoạt động gần nhất trong ngày
                </div>
                <ul className="divide-y divide-gray-100">
                  {(data?.items || []).slice(0, 8).map((it) => {
                    const meta = KIND_META[it.kind] || KIND_META.activity;
                    return (
                      <li key={it.id} className="flex items-start gap-3 px-4 py-3">
                        <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900">{it.title}</div>
                          <div className="text-xs text-gray-500">{it.subtitle}</div>
                        </div>
                        <div className="shrink-0 text-xs tabular-nums text-gray-400">{fmtTime(it.occurred_at)}</div>
                      </li>
                    );
                  })}
                  {!data?.items?.length && (
                    <li className="px-4 py-10 text-center text-sm text-gray-500">Chưa có hoạt động trong ngày này</li>
                  )}
                </ul>
                {(data?.items || []).length > 8 && (
                  <button
                    type="button"
                    onClick={() => setView('detail')}
                    className="w-full border-t border-gray-100 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    Xem toàn bộ {data.total_items} hoạt động
                  </button>
                )}
              </div>
            </div>
          )}

          {view === 'detail' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Filter className="h-4 w-4 text-gray-400" />
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'event', label: 'Sự kiện' },
                  { id: 'interactions', label: 'Tương tác' },
                  { id: 'stage', label: 'Chuyển cột' },
                  { id: 'lead_created', label: 'Tạo Lead' },
                  { id: 'deal_created', label: 'Tạo Deal' },
                  { id: 'task_done', label: 'Task' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setKindFilter(f.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      kindFilter === f.id
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <ul className="divide-y divide-gray-100">
                  {items.map((it) => {
                    const meta = KIND_META[it.kind] || KIND_META.activity;
                    const Icon = meta.icon || Activity;
                    return (
                      <li key={it.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/60">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.cls}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{it.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500">{it.subtitle}</div>
                          {it.meta?.lead_id && (
                            <Link
                              to={`/crm?lead=${it.meta.lead_id}`}
                              className="mt-1 inline-block text-xs text-indigo-600 hover:underline"
                            >
                              Mở hồ sơ CRM
                            </Link>
                          )}
                        </div>
                        <div className="shrink-0 text-right text-xs text-gray-400">
                          <div className="tabular-nums font-medium text-gray-600">{fmtTime(it.occurred_at)}</div>
                        </div>
                      </li>
                    );
                  })}
                  {!items.length && (
                    <li className="px-4 py-12 text-center text-sm text-gray-500">Không có mục nào với bộ lọc này</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
