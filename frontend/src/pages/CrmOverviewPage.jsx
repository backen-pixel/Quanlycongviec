import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { getInitials, avatarColor, formatDate } from '../lib/utils';
import { RefreshCw, Building2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 20;

const TAB_DEFS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'potential', label: 'Tiềm năng' },
  { key: 'consulting', label: 'Đang tư vấn' },
  { key: 'won', label: 'Đã chốt' },
  { key: 'old', label: 'Khách cũ' },
];

const BUCKET_BADGE_CLS = {
  potential: 'bg-gray-100 text-gray-700',
  consulting: 'bg-blue-50 text-blue-700',
  won: 'bg-emerald-50 text-emerald-700',
  old: 'bg-purple-50 text-purple-700',
};

export default function CrmOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
  }, []);

  useEffect(() => { setPage(1); }, [status, companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { status, page, page_size: PAGE_SIZE };
      if (canPickCompany && companyId) params.company_id = companyId;
      const res = await api.get('/management/crm-overview', { params });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu CRM');
    } finally {
      setLoading(false);
    }
  }, [status, page, canPickCompany, companyId]);

  useEffect(() => { load(); }, [load]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'tất cả công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  const tabs = data?.tabs || { all: 0, potential: 0, consulting: 0, won: 0, old: 0 };
  const stats = [
    { key: 'total', label: 'Tổng khách hàng', value: data?.stats?.total, cls: 'text-gray-900' },
    { key: 'new', label: 'Khách mới tháng này', value: data?.stats?.new_this_month, cls: 'text-gray-900' },
    { key: 'consulting', label: 'Đang tư vấn', value: data?.stats?.consulting, cls: 'text-blue-600' },
    { key: 'conversion', label: 'Tỷ lệ chuyển đổi', value: data ? `${data.stats.conversion_rate}%` : null, cls: 'text-emerald-600' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#111827' }}>CRM</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Quản lý khách hàng và cơ hội bán hàng của {companyName}
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
            to="/customers"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Thêm khách hàng
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1.5 ${s.cls}`}>{loading ? '…' : (s.value ?? 0)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 p-2 border-b border-gray-100 overflow-x-auto">
          {TAB_DEFS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                status === t.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label} · {tabs[t.key] ?? 0}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[26%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5 font-semibold">Khách hàng</th>
                <th className="px-4 py-2.5 font-semibold">Nguồn</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold">Dự án / nhu cầu liên quan</th>
                <th className="px-4 py-2.5 font-semibold">Người phụ trách</th>
                <th className="px-4 py-2.5 font-semibold">Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Đang tải...</td></tr>
              ) : (data?.items || []).length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Không có khách hàng nào.</td></tr>
              ) : (
                (data?.items || []).map((it) => {
                  const name = it.customer?.full_name || it.title || it.code;
                  return (
                    <tr key={it.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-2.5">
                          <div
                            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                            style={{ backgroundColor: avatarColor(name) }}
                          >
                            {getInitials(name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{name}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {[it.phone, it.customer?.address].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 align-top text-gray-600 truncate"
                        title={it.source_name || ''}
                      >
                        {it.source_name || '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${BUCKET_BADGE_CLS[it.bucket]}`}>
                          {it.bucket_label}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 align-top text-gray-600 truncate"
                        title={it.project ? `${it.project.code} · ${it.project.name}` : (it.title || '')}
                      >
                        {it.project ? `${it.project.code} · ${it.project.name}` : (it.title || '—')}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-600 truncate">{it.assignee?.full_name || '—'}</td>
                      <td className="px-4 py-3 align-top text-gray-400 whitespace-nowrap">{formatDate(it.updated_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && (data?.total || 0) > 0 && (() => {
          const total = data.total;
          const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
          const pageStart = (page - 1) * PAGE_SIZE + 1;
          const pageEnd = Math.min(page * PAGE_SIZE, total);
          return (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Hiển thị <span className="font-medium text-gray-700">{pageStart}-{pageEnd}</span> trong tổng số{' '}
                <span className="font-medium text-gray-700">{total}</span> khách hàng
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
          );
        })()}
      </div>
    </div>
  );
}
