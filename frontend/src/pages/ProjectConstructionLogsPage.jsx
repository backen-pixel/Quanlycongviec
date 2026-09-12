import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, History, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { exportProjectConstructionLogsExcel } from '../lib/projectConstructionLogsExcel';
import {
  WORK_UNIFIED_REGION_NONE,
  filterWorkUnifiedStaff,
  loadWorkUnifiedEmployees,
} from '../components/WorkUnifiedFilterFields';

const TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'tasks', label: 'Log nhiệm vụ' },
  { id: 'phat_sinh', label: 'Log phát sinh' },
  { id: 'project', label: 'Log dự án' },
  { id: 'crm', label: 'Log CRM / hoạt động' },
  { id: 'comments', label: 'Log bình luận' },
];

const PAGE_SIZE = 60;

const KIND_TONE = {
  tasks: 'bg-blue-50 text-blue-800 border-blue-200',
  phat_sinh: 'bg-rose-50 text-rose-800 border-rose-200',
  project: 'bg-teal-50 text-teal-800 border-teal-200',
  crm: 'bg-violet-50 text-violet-800 border-violet-200',
  comments: 'bg-amber-50 text-amber-800 border-amber-200',
};

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function kindLabel(kind) {
  return TABS.find((t) => t.id === kind)?.label || kind;
}

export default function ProjectConstructionLogsPage() {
  const { user } = useAuth();
  const canPickCompany = isAdminLike(user) && !isCompanyScopedAdmin(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = String(searchParams.get('project_id') || '').trim();
  const tab = TABS.some((t) => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'all';

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [regions, setRegions] = useState([]);
  const [regionId, setRegionId] = useState('');
  const [staff, setStaff] = useState([]);
  const [userId, setUserId] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [searching, setSearching] = useState(false);
  const autoPickKeyRef = useRef('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [textQ, setTextQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(0);

  const scopedCompanyId = useMemo(() => {
    if (canPickCompany) return companyId || '';
    return user?.company_id != null ? String(user.company_id) : '';
  }, [canPickCompany, companyId, user?.company_id]);

  const lockedCompanyLabel = useMemo(() => {
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    const c = companies.find((x) => String(x.id) === cid);
    return c?.short_name || c?.name || 'Công ty của bạn';
  }, [companies, user?.company_id]);

  const staffOptions = useMemo(
    () => filterWorkUnifiedStaff(staff, { companyId: scopedCompanyId, regionId }),
    [staff, scopedCompanyId, regionId],
  );

  const companyLabel = useMemo(() => {
    if (!canPickCompany) return lockedCompanyLabel;
    if (!companyId) return '';
    return companies.find((c) => String(c.id) === String(companyId))?.name || `Công ty #${companyId}`;
  }, [canPickCompany, companies, companyId, lockedCompanyLabel]);

  const regionLabel = useMemo(() => {
    if (!regionId) return '';
    if (regionId === WORK_UNIFIED_REGION_NONE) return 'Chưa gán khu vực';
    return regions.find((r) => String(r.id) === String(regionId))?.name || '';
  }, [regionId, regions]);

  const userLabel = useMemo(() => {
    if (!userId) return '';
    return staff.find((u) => String(u.id) === String(userId))?.full_name || '';
  }, [staff, userId]);

  const [project, setProject] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'tab') next.set('tab', tab);
    setSearchParams(next);
  };

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!scopedCompanyId && !canPickCompany) {
      setStaff([]);
      return undefined;
    }
    if (!scopedCompanyId && canPickCompany && companies.length === 0) {
      setStaff([]);
      return undefined;
    }
    loadWorkUnifiedEmployees({
      companyId: scopedCompanyId,
      companies,
      canPickCompany,
    }).then((rows) => {
      if (!cancelled) setStaff(rows);
    }).catch(() => {
      if (!cancelled) setStaff([]);
    });
    return () => { cancelled = true; };
  }, [canPickCompany, companies, scopedCompanyId]);

  useEffect(() => {
    const params = {};
    if (scopedCompanyId) params.company_id = scopedCompanyId;
    else if (canPickCompany && companies.length > 0) {
      params.company_ids = companies.map((c) => c.id).join(',');
    } else {
      setRegions([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/crm/company-regions', { params }).then((r) => {
      if (!cancelled) {
        setRegions((Array.isArray(r.data) ? r.data : []).filter((rg) => rg.is_active !== false));
      }
    }).catch(() => {
      if (!cancelled) setRegions([]);
    });
    return () => { cancelled = true; };
  }, [canPickCompany, companies, scopedCompanyId]);

  useEffect(() => {
    setRegionId('');
    setUserId('');
  }, [scopedCompanyId]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = textQ.trim();
      setDebouncedQ((prev) => {
        if (prev !== next) setPage(0);
        return next;
      });
    }, 280);
    return () => clearTimeout(t);
  }, [textQ]);

  useEffect(() => {
    if (!userId) return;
    const ok = staffOptions.some((u) => String(u.id) === String(userId));
    if (!ok) setUserId('');
  }, [staffOptions, userId]);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    const params = { page: 1, page_size: 40 };
    if (companyId) params.company_id = companyId;
    if (regionId) params.region_id = regionId;
    if (userId) params.user_id = userId;
    api.get('/management/work-unified', { params })
      .then((r) => {
        if (cancelled) return;
        const rows = (Array.isArray(r.data?.items) ? r.data.items : []).map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          customer_name: p.customer_name || p.customer?.full_name || null,
        }));
        setCatalog(rows);
      })
      .catch(() => { if (!cancelled) setCatalog([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [companyId, regionId, userId]);

  useEffect(() => {
    const q = projectQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = { q, limit: 20 };
      if (companyId) params.company_id = companyId;
      if (regionId) params.region_id = regionId;
      if (userId) params.user_id = userId;
      api.get('/management/work-unified/search', { params })
        .then((r) => {
          if (!cancelled) setSuggestions(Array.isArray(r.data?.items) ? r.data.items : []);
        })
        .catch(() => { if (!cancelled) setSuggestions([]); });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyId, projectQuery, regionId, userId]);

  const visibleProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (q.length >= 2 && suggestions.length) return suggestions;
    if (!q) return catalog;
    return catalog.filter((row) => (
      [row.code, row.name, row.customer_name].filter(Boolean).join(' ').toLowerCase().includes(q)
    ));
  }, [catalog, projectQuery, suggestions]);

  const loadLogs = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setItems([]);
      setCounts({});
      setTotal(0);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/management/project-logs', {
        params: {
          project_id: projectId,
          kind: tab,
          q: debouncedQ || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          region_id: regionId || undefined,
          user_id: userId || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      setProject(data?.project || null);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setCounts(data?.counts || {});
      setTotal(Number(data?.total) || 0);
    } catch (e) {
      setItems([]);
      setCounts({});
      setTotal(0);
      setError(e.response?.data?.error || e.message || 'Không tải được nhật ký');
    } finally {
      setLoading(false);
    }
  }, [projectId, tab, debouncedQ, dateFrom, dateTo, page, companyId, regionId, userId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const pickProject = (row) => {
    if (!row?.id) return;
    setProjectQuery(`${row.code || ''} ${row.name || ''}`.trim());
    setSuggestions([]);
    setPage(0);
    const next = new URLSearchParams(searchParams);
    next.set('project_id', row.id);
    next.set('tab', tab);
    setSearchParams(next);
  };

  useEffect(() => {
    if (!catalog.length) return;
    const inList = projectId && catalog.some((p) => String(p.id) === String(projectId));
    if (inList) return;
    if (projectId && !companyId && !regionId && !userId) return;
    const first = catalog[0];
    const key = `${companyId}|${regionId}|${userId}|${first.id}`;
    if (autoPickKeyRef.current === key) return;
    autoPickKeyRef.current = key;
    pickProject(first);
  }, [catalog, companyId, projectId, regionId, tab, userId]);

  const clearProject = () => {
    setProjectQuery('');
    setSuggestions([]);
    setProject(null);
    setItems([]);
    setCounts({});
    setParam('project_id', '');
  };

  const changeTab = (id) => {
    setPage(0);
    const next = new URLSearchParams(searchParams);
    if (projectId) next.set('project_id', projectId);
    next.set('tab', id);
    setSearchParams(next);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportReport = async () => {
    if (!projectId) return;
    setExporting(true);
    try {
      const { data } = await api.get('/management/project-logs', {
        params: {
          project_id: projectId,
          kind: tab,
          q: debouncedQ || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          region_id: regionId || undefined,
          user_id: userId || undefined,
          limit: 2000,
          offset: 0,
        },
      });
      await exportProjectConstructionLogsExcel({
        project: data?.project || project,
        items: Array.isArray(data?.items) ? data.items : [],
        counts: data?.counts || counts,
        kind: tab,
        filters: {
          date_from: dateFrom,
          date_to: dateTo,
          q: debouncedQ,
          company: companyLabel,
          region: regionLabel,
          user: userLabel,
        },
      });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không xuất được báo cáo');
    } finally {
      setExporting(false);
    }
  };

  const summaryCards = useMemo(() => ([
    { id: 'all', label: 'Tất cả', value: counts.all || 0, tone: 'slate' },
    { id: 'tasks', label: 'Nhiệm vụ', value: counts.tasks || 0, tone: 'blue' },
    { id: 'phat_sinh', label: 'Phát sinh', value: counts.phat_sinh || 0, tone: 'rose' },
    { id: 'project', label: 'Dự án', value: counts.project || 0, tone: 'teal' },
    { id: 'crm', label: 'CRM', value: counts.crm || 0, tone: 'violet' },
    { id: 'comments', label: 'Bình luận', value: counts.comments || 0, tone: 'amber' },
  ]), [counts]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 inline-flex items-center gap-2">
            <History className="h-5 w-5 text-teal-700" />
            Nhật ký công trình
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gom log nhiệm vụ, phát sinh Không gian chung, dự án, CRM và bình luận. Chọn công ty / khu vực / nhân viên là lọc ngay.
          </p>
        </div>
        <button
          type="button"
          disabled={!projectId || exporting || !total}
          onClick={exportReport}
          className="h-9 px-3 rounded-lg bg-teal-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-teal-800 disabled:opacity-40 cursor-pointer"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Xuất báo cáo
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
        <div className="relative">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Tìm công trình
          </label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder="Chọn hoặc gõ mã / tên công trình…"
              className="w-full h-10 pl-9 pr-9 border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
            {(projectQuery || projectId) && (
              <button
                type="button"
                onClick={clearProject}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-1 w-full rounded-xl border border-slate-200 bg-white max-h-64 overflow-y-auto">
            {searching && !visibleProjects.length ? (
              <p className="px-3 py-2 text-xs text-slate-400">Đang tải danh sách công trình…</p>
            ) : visibleProjects.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Không có công trình khớp bộ lọc.</p>
            ) : visibleProjects.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => pickProject(row)}
                className={`w-full text-left px-3 py-2 cursor-pointer border-b border-slate-100 last:border-0 ${
                  String(row.id) === String(projectId) ? 'bg-teal-50' : 'hover:bg-teal-50'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">
                  {row.code} <span className="font-normal text-slate-700">— {row.name}</span>
                </p>
                {row.customer_name ? (
                  <p className="text-[11px] text-slate-500">{row.customer_name}</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {project && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-teal-800">{project.code}</span>
            <span className="text-slate-800">{project.name}</span>
            {project.customer_name ? (
              <span className="text-slate-500">· {project.customer_name}</span>
            ) : null}
            <Link
              to={`/management/work-unified/${project.id}`}
              className="text-teal-700 hover:underline text-xs"
            >
              Mở Work Unified
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-xs text-slate-600">
            Công ty
            {canPickCompany && companies.length > 0 ? (
              <select
                value={companyId}
                onChange={(e) => {
                  setPage(0);
                  setCompanyId(e.target.value);
                  setRegionId('');
                  setUserId('');
                }}
                className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            ) : (
              <div className="mt-1 h-9 px-2 border border-indigo-200 bg-indigo-50/80 rounded-lg text-sm text-indigo-900 flex items-center truncate">
                {lockedCompanyLabel}
              </div>
            )}
          </label>
          <label className="text-xs text-slate-600">
            Khu vực
            <select
              value={regionId}
              onChange={(e) => { setPage(0); setRegionId(e.target.value); setUserId(''); }}
              className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Tất cả khu vực</option>
              <option value={WORK_UNIFIED_REGION_NONE}>Chưa gán khu vực</option>
              {regions.map((reg) => (
                <option key={reg.id} value={reg.id}>
                  {reg.name}{reg.code ? ` (${reg.code})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Nhân viên
            <select
              value={userId}
              onChange={(e) => { setPage(0); setUserId(e.target.value); }}
              className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Tất cả nhân viên</option>
              {staffOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}{u.position ? ` (${u.position})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <label className="text-xs text-slate-600">
            Từ ngày
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setPage(0); setDateFrom(e.target.value); }}
              className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Đến ngày
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setPage(0); setDateTo(e.target.value); }}
              className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm"
            />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">
            Lọc nội dung
            <div className="mt-1 flex gap-2">
              <input
                value={textQ}
                onChange={(e) => setTextQ(e.target.value)}
                placeholder="Gõ là lọc ngay trong tiêu đề, nội dung, người thao tác…"
                className="flex-1 h-9 px-2 border border-slate-200 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => void loadLogs()}
                className="h-9 w-9 rounded-lg border border-slate-200 inline-flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                title="Tải lại"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </label>
        </div>
      </section>

      {projectId ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {summaryCards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => changeTab(c.id)}
                className={`rounded-xl border p-3 text-left cursor-pointer ${
                  tab === c.id ? 'ring-2 ring-teal-300 border-teal-300' : 'border-slate-200 bg-white'
                }`}
              >
                <p className="text-xl font-bold tabular-nums">{c.value}</p>
                <p className="text-[11px] text-slate-500">{c.label}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => changeTab(t.id)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border cursor-pointer ${
                  tab === t.id
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {t.label}
                {counts[t.id] != null ? ` (${counts[t.id] || 0})` : ''}
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải nhật ký…
              </div>
            ) : error ? (
              <p className="p-6 text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="p-8 text-sm text-slate-500 text-center">
                Chưa có log {tab === 'all' ? '' : kindLabel(tab).toLowerCase()} trong khoảng lọc.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id} className="px-4 py-3 hover:bg-slate-50/80">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{formatDateTime(item.created_at)}</span>
                      <span className={`px-1.5 py-0.5 rounded border font-semibold ${KIND_TONE[item.kind] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                        {kindLabel(item.kind)}
                      </span>
                      <span className="font-medium text-slate-700">{item.event_label}</span>
                      {item.source_label ? <span>· {item.source_label}</span> : null}
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-1">{item.title}</p>
                    {item.description ? (
                      <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{item.description}</p>
                    ) : null}
                    {item.actor_name ? (
                      <p className="text-[11px] text-slate-500 mt-1">Người thao tác: {item.actor_name}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
                <span>{total} dòng · trang {page + 1}/{pageCount}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="h-8 px-3 rounded-lg border disabled:opacity-40 cursor-pointer"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 px-3 rounded-lg border disabled:opacity-40 cursor-pointer"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-slate-500 text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-white">
          {searching
            ? 'Đang tải danh sách công trình theo bộ lọc…'
            : 'Chọn công ty / khu vực hoặc bấm một mã công trình phía trên để xem nhật ký.'}
        </p>
      )}
    </div>
  );
}
