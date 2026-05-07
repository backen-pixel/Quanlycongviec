import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/utils';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import {
  getStoredCrmFilterCompanyId,
  resolveDefaultCrmAdminCompanyId,
} from '../lib/crmCompanyFilter';
import { isCrmCompanyAdmin } from '../lib/crmAdminScope';
import {
  CalendarClock,
  Search,
  Phone,
  User,
  Layers,
  AlertTriangle,
  RefreshCw,
  Building2,
  Target,
  Filter,
  Tag,
} from 'lucide-react';

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toIso(d) {
  return startOfDay(d).toISOString().split('T')[0];
}

/** Khoảng ngày (YYYY-MM-DD) để lọc theo created_at, dạng bucket tuần quá khứ (không chồng lấn). */
function getCreatedAtAgeRange(preset) {
  const now = new Date();
  const today = startOfDay(now);
  switch (preset) {
    case 'w0': {
      // 0–6 ngày trước (tuần hiện tại, tính theo tuổi lead)
      return { from: toIso(addDays(today, -6)), to: toIso(today) };
    }
    case 'w1': {
      // 7–13 ngày trước
      return { from: toIso(addDays(today, -13)), to: toIso(addDays(today, -7)) };
    }
    case 'w2': {
      // 14–20 ngày trước
      return { from: toIso(addDays(today, -20)), to: toIso(addDays(today, -14)) };
    }
    case 'w3': {
      // 21–27 ngày trước
      return { from: toIso(addDays(today, -27)), to: toIso(addDays(today, -21)) };
    }
    case 'w4': {
      // 28–34 ngày trước
      return { from: toIso(addDays(today, -34)), to: toIso(addDays(today, -28)) };
    }
    case 'w8plus': {
      // >= 56 ngày trước
      return { from: null, to: toIso(addDays(today, -56)) };
    }
    default:
      return { from: '', to: '' };
  }
}

const TIME_PRESETS = [
  { key: 'all', label: 'Tất cả (không lọc theo tuổi lead)' },
  { key: 'w0', label: '0–6 ngày trước' },
  { key: 'w1', label: 'Tuần 1: 7–13 ngày trước' },
  { key: 'w2', label: 'Tuần 2: 14–20 ngày trước' },
  { key: 'w3', label: 'Tuần 3: 21–27 ngày trước' },
  { key: 'w4', label: 'Tuần 4: 28–34 ngày trước' },
  { key: 'w8plus', label: '>= 8 tuần trước' },
  { key: 'custom', label: 'Tùy chỉnh ngày' },
];

export default function CrmFollowUpCarePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCompanyScopedAdmin = isCrmCompanyAdmin(user);

  const [companies, setCompanies] = useState([]);
  const [filterCompany, setFilterCompany] = useState(() => {
    if (typeof window === 'undefined') return '';
    return getStoredCrmFilterCompanyId() || '';
  });
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState('');
  const [stages, setStages] = useState([]);
  const [pipelineType, setPipelineType] = useState(() => {
    try {
      const t = localStorage.getItem('crm_pinned_tab');
      return t === 'deal' ? 'deal' : 'lead';
    } catch {
      return 'lead';
    }
  });
  const [stageId, setStageId] = useState('');
  const [timePreset, setTimePreset] = useState('w1');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [onlyOpenStages, setOnlyOpenStages] = useState(true);
  const [users, setUsers] = useState([]);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [sources, setSources] = useState([]);
  const [filterSourceId, setFilterSourceId] = useState('');

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: 'crm' } })
      .then((r) => setCompanies(r.data?.companies || []))
      .catch(() => setCompanies([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !companies.length || filterCompany) return;
    const cid = resolveDefaultCrmAdminCompanyId(companies);
    if (cid) setFilterCompany(cid);
  }, [isAdmin, companies, filterCompany]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/crm/pipelines');
        if (cancel) return;
        const list = Array.isArray(data) ? data : [];
        setPipelines(list);
      } catch {
        if (!cancel) setPipelines([]);
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    let cancel = false;
    const pid = pipelineId || null;
    (async () => {
      try {
        const { data } = await api.get('/crm/pipeline-stages', {
          params: pid ? { type: pipelineType, pipeline_id: pid } : { type: pipelineType },
        });
        if (cancel) return;
        setStages(Array.isArray(data) ? data : []);
      } catch {
        if (!cancel) setStages([]);
      }
    })();
    return () => { cancel = true; };
  }, [pipelineType, pipelineId]);

  useEffect(() => {
    if (!stageId) return;
    const ok = stages.some((s) => String(s.id) === String(stageId));
    if (!ok) setStageId('');
  }, [stageId, stages]);

  useEffect(() => {
    api.get('/users').then((r) => setUsers(r.data?.users || [])).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (!isAdmin) setFilterAssignee((prev) => prev || (user?.id ? String(user.id) : ''));
  }, [isAdmin, user?.id]);

  useEffect(() => {
    setFilterSourceId('');
  }, [filterCompany]);

  useEffect(() => {
    let cancel = false;
    const params = {};
    if (isAdmin && filterCompany) params.company_id = filterCompany;
    api
      .get('/crm/sources', { params })
      .then((r) => {
        if (!cancel) setSources(Array.isArray(r.data?.sources) ? r.data.sources : []);
      })
      .catch(() => {
        if (!cancel) setSources([]);
      });
    return () => { cancel = true; };
  }, [isAdmin, filterCompany]);

  const buildParams = useCallback(() => {
    const params = {
      type: pipelineType,
      limit: 2000,
      offset: 0,
      phone_filter: 'has_phone',
    };
    if (isAdmin && filterCompany) params.company_id = filterCompany;
    if (pipelineId) params.pipeline_id = pipelineId;
    if (stageId) params.stage_id = stageId;
    if (isAdmin && filterAssignee) params.assigned_to = filterAssignee;
    if (filterSourceId) params.source_id = filterSourceId;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

    if (timePreset === 'custom') {
      const df = customFrom && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? customFrom : null;
      const dt = customTo && /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : null;
      if (df) params.date_from = df;
      if (dt) params.date_to = dt;
    } else if (timePreset !== 'all') {
      const r = getCreatedAtAgeRange(timePreset);
      if (r.from) params.date_from = r.from;
      if (r.to) params.date_to = r.to;
    }

    return params;
  }, [
    pipelineType,
    isAdmin,
    filterCompany,
    pipelineId,
    stageId,
    filterAssignee,
    filterSourceId,
    debouncedSearch,
    timePreset,
    customFrom,
    customTo,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/leads', { params: buildParams() });
      setLeads(data?.data || []);
      setTotal(typeof data?.total === 'number' ? data.total : (data?.data || []).length);
    } catch (e) {
      console.error(e);
      setLeads([]);
      setTotal(0);
    }
    setLoading(false);
  }, [buildParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = leads;
    if (onlyOpenStages) {
      rows = rows.filter((l) => {
        const st = l.stage;
        return !st?.is_won && !st?.is_lost;
      });
    }
    return rows;
  }, [leads, onlyOpenStages]);

  const overdueCount = useMemo(() => {
    const t0 = startOfDay(new Date()).getTime();
    return filtered.filter((l) => {
      if (!l.next_follow_up) return false;
      return new Date(l.next_follow_up).getTime() < t0;
    }).length;
  }, [filtered]);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto px-3 sm:px-4 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="h-7 w-7 text-emerald-600 shrink-0" />
            CSKH — Lead theo tuổi & pipeline
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Lọc theo tuổi lead (dựa trên <span className="font-mono">created_at</span>) và theo cột pipeline để chăm sóc.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 cursor-pointer shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <Filter className="h-4 w-4" /> Bộ lọc
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {isAdmin && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Công ty</span>
              <select
                value={filterCompany}
                onChange={(e) => {
                  setFilterCompany(e.target.value);
                  setPipelineId('');
                }}
                className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="">Tất cả</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Loại pipeline</span>
            <select
              value={pipelineType}
              onChange={(e) => {
                setPipelineType(e.target.value);
                setStageId('');
              }}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="lead">Lead</option>
              <option value="deal">Deal</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Pipeline CRM</span>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Mặc định / tất cả (theo quyền)</option>
              {(filterCompany ? pipelines.filter((p) => String(p.company_id) === String(filterCompany)) : pipelines).map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' ★' : ''}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Cột giai đoạn</span>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Tất cả cột</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Tuổi lead (tính theo created_at)</span>
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              {TIME_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>

          {isAdmin && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 flex items-center gap-1"><User className="h-3.5 w-3.5" /> NV phụ trách</span>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="">Tất cả</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> Nguồn khách hàng</span>
            <select
              value={filterSourceId}
              onChange={(e) => setFilterSourceId(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Tất cả nguồn</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.icon ? `${s.icon} ` : '')}{s.name || s.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        {timePreset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => setShowDateRangePicker(true)}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50 cursor-pointer"
              title="Chọn ngày bắt đầu/kết thúc"
            >
              {customFrom && customTo ? `${customFrom} → ${customTo}` : 'Phạm vi tuỳ chỉnh'}
            </button>
          </div>
        )}

        <DateRangePickerPopover
          open={showDateRangePicker}
          title="Phạm vi tuỳ chỉnh"
          from={customFrom}
          to={customTo}
          onChange={({ from, to }) => {
            setCustomFrom(from);
            setCustomTo(to);
          }}
          onClose={() => setShowDateRangePicker(false)}
        />

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Tìm mã, tiêu đề, SĐT…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyOpenStages}
              onChange={(e) => setOnlyOpenStages(e.target.checked)}
              className="rounded border-gray-300"
            />
            Ẩn lead/deal đã chốt hoặc thua
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-600">
          Hiển thị <strong>{filtered.length}</strong>
          {total != null && ` / tổng server ${total}`} lead/deal
        </span>
        {onlyOpenStages && overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 text-red-600 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {overdueCount} quá hạn trong danh sách
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-10 w-10 border-3 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
          Không có lead/deal khớp bộ lọc. Thử nới «Khung thời gian» hoặc bỏ cột pipeline.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2.5">Lead / Deal</th>
                <th className="px-3 py-2.5">Khách</th>
                <th className="px-3 py-2.5">Nguồn</th>
                <th className="px-3 py-2.5">SĐT</th>
                <th className="px-3 py-2.5">Cột pipeline</th>
                <th className="px-3 py-2.5">Theo dõi tiếp</th>
                <th className="px-3 py-2.5">Phụ trách</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row) => {
                const st = row.stage;
                const assignee = row.assignee || row.lead_owner;
                const phone = row.display_phone || row.customer?.phone || row.phone;
                const src = row.source;
                const nf = row.next_follow_up;
                const nfMs = nf ? new Date(nf).getTime() : null;
                const today0 = startOfDay(new Date()).getTime();
                const overdue = nfMs != null && nfMs < today0;
                return (
                  <tr key={row.id} className="hover:bg-emerald-50/40">
                    <td className="px-3 py-2 align-top">
                      <Link
                        to={`/crm/leads/${row.id}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {row.code ? `${row.code} · ` : ''}{row.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-800">
                      {row.customer?.full_name || '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {src ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          {src.icon ? <span aria-hidden>{src.icon}</span> : null}
                          {src.name || '—'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {phone ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-700">
                          <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          {phone}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {st ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${st.color || '#64748b'}18`,
                            color: st.color || '#475569',
                          }}
                        >
                          {st.icon ? `${st.icon} ` : ''}{st.name}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {nf ? (
                        <span className={overdue ? 'text-red-600 font-semibold' : 'text-gray-800'}>
                          {formatDate(nf)}
                          {overdue && ' · quá hạn'}
                        </span>
                      ) : (
                        <span className="text-amber-700">Chưa hẹn</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {assignee?.full_name || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isCompanyScopedAdmin && (
        <p className="text-xs text-gray-500">
          Admin công ty: dữ liệu giới hạn theo phạm vi API (công ty / khu vực đã cấu hình).
        </p>
      )}
    </div>
  );
}
