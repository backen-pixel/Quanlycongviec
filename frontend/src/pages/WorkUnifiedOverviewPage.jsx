import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { formatDate } from '../lib/utils';
import {
  RefreshCw, Building2, Plus, Users, FileText, Package, ChevronLeft, ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 20;

const FORECAST_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'on_track', label: 'Đúng tiến độ' },
  { key: 'at_risk', label: 'Nguy cơ trễ' },
  { key: 'late', label: 'Trễ hạn' },
];

const FORECAST_BADGE_CLS = {
  on_track: 'bg-emerald-50 text-emerald-700',
  at_risk: 'bg-amber-50 text-amber-700',
  late: 'bg-red-50 text-red-700',
  unknown: 'bg-gray-100 text-gray-500',
};

function forecastLabel(it) {
  if (it.forecast === 'late') return `Trễ hạn ${it.delay_days || 0} ngày`;
  if (it.forecast === 'at_risk') return 'Nguy cơ trễ';
  if (it.forecast === 'on_track') return 'Đúng tiến độ';
  return 'Chưa có hạn';
}

export default function WorkUnifiedOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [forecastFilter, setForecastFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
  }, []);

  useEffect(() => { setPage(1); }, [stageFilter, forecastFilter, companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (stageFilter) params.stage = stageFilter;
      if (forecastFilter !== 'all') params.forecast = forecastFilter;
      if (canPickCompany && companyId) params.company_id = companyId;
      const res = await api.get('/management/work-unified', { params });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu dự án');
    } finally {
      setLoading(false);
    }
  }, [stageFilter, forecastFilter, canPickCompany, companyId]);

  useEffect(() => { load(); }, [load]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'tất cả công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  const stages = data?.stages || [];
  const items = data?.items || [];
  const stats = data?.stats || { total: 0, on_track: 0, at_risk: 0, late: 0 };
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#111827' }}>Work Unified</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Danh sách toàn bộ dự án của {companyName}, xuyên suốt từ lúc chốt khách hàng đến khi bàn giao
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canPickCompany && companies.length > 0 && (
            <div className="relative">
              <Building2 className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <Link
            to="/projects/create"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Tạo dự án
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Vòng đời một dự án — 3 tầng dữ liệu
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Users className="h-4 w-4 text-blue-600" /> Khách hàng</p>
            <p className="text-xs text-gray-500 mt-1">Hồ sơ liên hệ, tồn tại xuyên suốt mọi quan hệ — quản lý bên CRM. Một khách hàng có thể có nhiều deal theo thời gian.</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><FileText className="h-4 w-4 text-violet-600" /> Deal / Cơ hội</p>
            <p className="text-xs text-gray-500 mt-1">Một thương vụ cụ thể, có giá trị & báo giá riêng — quản lý bên Dự toán &amp; Báo giá. Khi được duyệt và chốt, Deal sinh ra một dự án.</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Package className="h-4 w-4 text-emerald-600" /> Dự án</p>
            <p className="text-xs text-gray-500 mt-1">Sinh ra khi Deal chốt, đi qua các công đoạn thi công bên dưới — quản lý ngay tại Work Unified.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
          {stages.length} công đoạn
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setStageFilter('')}
            className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
              !stageFilter ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Tất cả
          </button>
          {stages.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => setStageFilter(s.slug)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                stageFilter === s.slug ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stageFilter === s.slug ? 'bg-white' : 'bg-blue-400'}`} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Đang thực hiện</p>
          <p className="text-2xl font-bold mt-1.5 text-gray-900">{loading ? '…' : stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Đúng tiến độ</p>
          <p className="text-2xl font-bold mt-1.5 text-emerald-600">{loading ? '…' : stats.on_track}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Nguy cơ trễ</p>
          <p className="text-2xl font-bold mt-1.5 text-amber-600">{loading ? '…' : stats.at_risk}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Trễ hạn</p>
          <p className="text-2xl font-bold mt-1.5 text-red-600">{loading ? '…' : stats.late}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 p-2 border-b border-gray-100 overflow-x-auto">
          {FORECAST_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setForecastFilter(t.key)}
              className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                forecastFilter === t.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label} · {t.key === 'all' ? stats.total : stats[t.key] || 0}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm table-fixed">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[8%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5 font-semibold">Dự án</th>
                <th className="px-4 py-2.5 font-semibold">Khách hàng → Deal</th>
                <th className="px-4 py-2.5 font-semibold">Công đoạn hiện tại</th>
                <th className="px-4 py-2.5 font-semibold">Tiến độ</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold">Người phụ trách</th>
                <th className="px-4 py-2.5 font-semibold">Hạn bàn giao</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Không có dự án phù hợp bộ lọc.</td></tr>
              ) : (
                pageItems.map((it) => (
                  <tr key={it.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 align-top">
                      <Link to={`/management/work-unified/${it.id}`} className="text-sm font-semibold text-blue-700 hover:underline truncate block" title={it.name}>
                        {it.code}
                      </Link>
                      <p className="text-xs text-gray-500 truncate mt-0.5" title={it.name}>{it.name}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm text-gray-800 truncate" title={it.customer_name || ''}>{it.customer_name || '—'}</p>
                      {it.deal_code && (
                        <p className="text-xs text-violet-600 truncate mt-0.5" title={it.deal_title || ''}>{it.deal_code}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-0.5 mb-1">
                        {it.flow.map((s) => (
                          <span
                            key={s.key}
                            title={s.label}
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              s.status === 'done' ? 'bg-emerald-500' : s.status === 'current' ? 'bg-blue-500' : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-gray-600 truncate">{it.current_stage_label || '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700 font-medium">{it.progress_pct}%</td>
                    <td className="px-4 py-3 align-top">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${FORECAST_BADGE_CLS[it.forecast]}`}>
                        {forecastLabel(it)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600 truncate">{it.assignee_name || '—'}</td>
                    <td className="px-4 py-3 align-top text-gray-600 whitespace-nowrap">{it.deadline ? formatDate(it.deadline) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && items.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Hiển thị <span className="font-medium text-gray-700">{pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, items.length)}</span> trong tổng số{' '}
              <span className="font-medium text-gray-700">{items.length}</span> dự án
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Trang trước"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600 px-1">
                Trang <span className="font-medium text-gray-800">{page}</span> / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Trang sau"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
