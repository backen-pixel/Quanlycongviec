import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatVND, formatDate } from '../lib/utils';
import {
  LayoutDashboard, Search, Filter, RefreshCw, Target, Factory, Truck,
  CheckSquare, AlertTriangle, ChevronRight, Building2, X, Calendar,
} from 'lucide-react';

const PHASE_OPTIONS = [
  { value: '', label: 'Mọi giai đoạn' },
  { value: 'crm', label: 'Đang CRM' },
  { value: 'sx', label: 'Đã vào SX' },
  { value: 'vc', label: 'Đang VC' },
];

function PipelineStrip({ title, icon: Icon, color, stages }) {
  const max = Math.max(...(stages || []).map((s) => s.count || 0), 1);
  if (!stages?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${color}`} />
        {title}
      </h3>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {stages.map((s) => (
          <div key={s.id} className="shrink-0 min-w-[72px] max-w-[120px]">
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-1">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(((s.count || 0) / max) * 100, s.count > 0 ? 12 : 0)}%`,
                  backgroundColor: s.color || '#3b82f6',
                }}
              />
            </div>
            <p className="text-[10px] text-gray-500 truncate" title={s.name}>
              {s.icon ? `${s.icon} ` : ''}{s.name}
            </p>
            <p className="text-xs font-bold text-gray-800">{s.count || 0}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiTile({ label, value, sub, color, bg }) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ManagementDashboard() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [overview, setOverview] = useState(null);
  const [deals, setDeals] = useState([]);
  const [total, setTotal] = useState(0);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(false);

  const [companyId, setCompanyId] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [phase, setPhase] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      api.get('/companies').then((r) => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
    }
  }, [isAdmin]);

  const filterParams = useMemo(() => {
    const p = {};
    if (companyId) p.company_id = companyId;
    if (searchQ) p.q = searchQ;
    if (phase) p.phase = phase;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    return p;
  }, [companyId, searchQ, phase, dateFrom, dateTo]);

  const loadOverview = useCallback(async () => {
    try {
      const params = {};
      if (companyId) params.company_id = companyId;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const { data } = await api.get('/management/overview', { params });
      setOverview(data);
    } catch {
      setOverview(null);
    }
  }, [companyId, dateFrom, dateTo]);

  const loadDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const { data } = await api.get('/management/deals', {
        params: { ...filterParams, page_size: 80 },
      });
      setDeals(data.deals || []);
      setTotal(data.total || 0);
    } catch {
      setDeals([]);
      setTotal(0);
    }
    setDealsLoading(false);
  }, [filterParams]);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOverview(), loadDeals()]);
    setLoading(false);
  }, [loadOverview, loadDeals]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const applySearch = () => setSearchQ(searchInput.trim());

  const kpis = overview?.kpis;

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="h-7 w-7 text-blue-600" />
            Tổng hợp Quản lý
          </h1>
          <p className="text-sm text-gray-500 mt-1">CRM · Sản xuất · Vận chuyển — một màn hình</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium cursor-pointer ${
              showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            <Filter className="h-4 w-4" />
            Bộ lọc
          </button>
          <button
            type="button"
            onClick={() => void reloadAll()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <Link
            to="/work/unified"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <CheckSquare className="h-4 w-4" />
            Tổng hợp NV
          </Link>
        </div>
      </div>

      {(showFilters || companyId || phase || dateFrom || dateTo) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            {isAdmin && companies.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Công ty</label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-sm min-w-[160px]"
                >
                  <option value="">Tất cả</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Giai đoạn</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="h-9 px-3 rounded-lg border border-gray-200 text-sm"
              >
                {PHASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 px-3 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="h-9 px-3 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Tìm deal</label>
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                    placeholder="Mã, tên deal…"
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <button type="button" onClick={applySearch}
                  className="h-9 px-3 rounded-lg bg-gray-900 text-white text-sm font-medium cursor-pointer">
                  Tìm
                </button>
              </div>
            </div>
            {(companyId || phase || dateFrom || dateTo || searchQ) && (
              <button
                type="button"
                onClick={() => {
                  setCompanyId('');
                  setPhase('');
                  setDateFrom('');
                  setDateTo('');
                  setSearchQ('');
                  setSearchInput('');
                }}
                className="h-9 px-2 text-red-600 hover:bg-red-50 rounded-lg text-sm flex items-center gap-1 cursor-pointer"
              >
                <X className="h-4 w-4" /> Xóa lọc
              </button>
            )}
          </div>
        </div>
      )}

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiTile label="Lead CRM" value={kpis.crm_leads} bg="bg-purple-50 border-purple-100" color="text-purple-700" />
          <KpiTile label="Deal CRM" value={kpis.crm_deals} sub={`${kpis.crm_won} thắng`} bg="bg-emerald-50 border-emerald-100" color="text-emerald-700" />
          <KpiTile label="Đang SX" value={kpis.sx_active} sub={kpis.sx_overdue ? `${kpis.sx_overdue} trễ` : undefined} bg="bg-orange-50 border-orange-100" color="text-orange-700" />
          <KpiTile label="Đang VC" value={kpis.vc_active} sub={kpis.vc_overdue ? `${kpis.vc_overdue} trễ` : undefined} bg="bg-amber-50 border-amber-100" color="text-amber-700" />
          <KpiTile label="NV mở" value={kpis.open_tasks} bg="bg-blue-50 border-blue-100" color="text-blue-700" />
          <KpiTile label="NV quá hạn" value={kpis.overdue_tasks} bg="bg-red-50 border-red-100" color="text-red-700" />
        </div>
      )}

      {overview?.pipelines && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PipelineStrip title="Pipeline Deal CRM" icon={Target} color="text-emerald-600" stages={overview.pipelines.crm_deal} />
          <PipelineStrip title="Pipeline Sản xuất" icon={Factory} color="text-orange-600" stages={overview.pipelines.sx} />
          <PipelineStrip title="Pipeline Vận chuyển" icon={Truck} color="text-amber-600" stages={overview.pipelines.vc} />
          <PipelineStrip title="Pipeline Lead CRM" icon={Target} color="text-purple-600" stages={overview.pipelines.crm_lead} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">
            Danh sách Deal tổng hợp
            <span className="ml-2 text-gray-400 font-normal">({total})</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2.5 font-semibold">Deal / KH</th>
                <th className="px-4 py-2.5 font-semibold">CRM</th>
                <th className="px-4 py-2.5 font-semibold">SX</th>
                <th className="px-4 py-2.5 font-semibold">VC</th>
                <th className="px-4 py-2.5 font-semibold">NV / TL</th>
                <th className="px-4 py-2.5 font-semibold text-right">Giá trị</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dealsLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Đang tải…</td></tr>
              )}
              {!dealsLoading && deals.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Không có deal phù hợp bộ lọc</td></tr>
              )}
              {deals.map((d) => {
                const crmStage = d.stage;
                const sxStage = d.project?.sx_stage;
                const vcStage = d.project?.vc_stage;
                const overdue = d.deadline && new Date(d.deadline) < new Date() && !crmStage?.is_won;
                return (
                  <tr key={d.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 min-w-[200px]">
                      <Link to={`/management/deals/${d.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                        {d.code && <span className="text-blue-600 mr-1">{d.code}</span>}
                        {d.title}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">{d.customer?.full_name || '—'}</p>
                      {d.project?.code && (
                        <p className="text-[10px] text-gray-400 mt-0.5">DA: {d.project.code}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {crmStage ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${crmStage.color || '#94a3b8'}22`, color: crmStage.color || '#64748b' }}>
                          {crmStage.name}
                        </span>
                      ) : '—'}
                      {overdue && <AlertTriangle className="inline h-3.5 w-3.5 text-red-500 ml-1" />}
                    </td>
                    <td className="px-4 py-3">
                      {d.project_id ? (
                        sxStage ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-medium">
                            {sxStage.name}
                          </span>
                        ) : (
                          <span className="text-xs text-orange-600">Tiếp nhận</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {vcStage ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                          {vcStage.name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <span title="Nhiệm vụ CRM">{d.task_stats?.crm_done}/{d.task_stats?.crm_total} NV</span>
                      <span className="mx-1 text-gray-300">·</span>
                      <span title="Tài liệu">{d.document_count} TL</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {d.value ? formatVND(d.value) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/management/deals/${d.id}`}
                        className="inline-flex items-center text-blue-600 hover:text-blue-800">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
