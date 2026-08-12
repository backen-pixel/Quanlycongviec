import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, X, Receipt, ExternalLink, RefreshCw, Building2, Factory,
  Download, AlertTriangle, FileText, ShoppingCart,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import { isAccountingUser } from '../lib/crossWorkshopProduction';

const FINANCIAL_FILTERS = [
  { id: '', label: 'Tất cả TT' },
  { id: 'no_quote', label: 'Chưa BG' },
  { id: 'quoted', label: 'Có BG, chưa ĐH' },
  { id: 'ordered', label: 'Có ĐH, chưa HĐ' },
  { id: 'invoiced', label: 'Đã HĐ' },
  { id: 'sx_done_not_invoiced', label: 'SX xong, chưa HĐ' },
];

const FINANCIAL_TONE = {
  no_quote: 'gray',
  quoted: 'blue',
  ordered: 'amber',
  invoiced: 'green',
};

function StatusBadge({ label, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tones[tone] || tones.gray}`}>
      {label}
    </span>
  );
}

function KpiCard({ label, value, sub, active, onClick, tone = 'default' }) {
  const toneClasses = {
    default: active ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-gray-200 bg-white',
    warn: active ? 'border-red-400 bg-red-50 ring-1 ring-red-200' : 'border-red-200 bg-red-50/40',
  };
  const clickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`rounded-xl border px-4 py-3 shadow-sm text-left transition-all ${toneClasses[tone] || toneClasses.default} ${clickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-extrabold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </button>
  );
}

function DocCell({ total, code, docId, viewHref, createHref }) {
  if (docId && viewHref) {
    return (
      <div className="text-right">
        <Link to={viewHref} className="font-medium text-indigo-700 hover:underline tabular-nums">
          {formatVND(total || 0)}
        </Link>
        {code && <p className="text-[10px] text-gray-400">{code}</p>}
      </div>
    );
  }
  if (total != null) {
    return (
      <div className="text-right tabular-nums text-gray-700">
        {formatVND(total)}
        {code && <p className="text-[10px] text-gray-400">{code}</p>}
      </div>
    );
  }
  return (
    <div className="text-right">
      <Link to={createHref} className="text-[11px] font-semibold text-indigo-600 hover:underline">
        + Tạo
      </Link>
    </div>
  );
}

export default function AccountingDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [deals, setDeals] = useState([]);
  const [total, setTotal] = useState(0);
  const [workshops, setWorkshops] = useState([]);
  const [clientCompany, setClientCompany] = useState(null);
  const [filterWorkshop, setFilterWorkshop] = useState('');
  const [filterFinancial, setFilterFinancial] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [filterWorkshop, filterFinancial, searchDebounced]);

  const queryParams = useMemo(() => {
    const p = {
      page,
      limit,
      ...(filterWorkshop ? { workshop_company_id: filterWorkshop } : {}),
      ...(searchDebounced ? { search: searchDebounced } : {}),
    };
    if (filterFinancial === 'sx_done_not_invoiced') {
      p.sx_done_not_invoiced = 'true';
    } else if (filterFinancial) {
      p.financial_status = filterFinancial;
    }
    // Admin công ty: truyền company_id để API xác định phạm vi kế toán
    if (!isAccountingUser(user) && user?.company_id) {
      p.client_company_id = user.company_id;
    }
    return p;
  }, [page, limit, filterWorkshop, filterFinancial, searchDebounced, user]);

  const summaryParams = useMemo(() => {
    const p = filterWorkshop ? { workshop_company_id: filterWorkshop } : {};
    if (!isAccountingUser(user) && user?.company_id) {
      p.client_company_id = user.company_id;
    }
    return p;
  }, [filterWorkshop, user]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const workshopParams = (!isAccountingUser(user) && user?.company_id)
        ? { client_company_id: user.company_id }
        : {};
      const [summaryRes, dealsRes, workshopsRes] = await Promise.all([
        api.get('/accounting/summary', { params: summaryParams }),
        api.get('/accounting/deals', { params: queryParams }),
        api.get('/accounting/workshops', { params: workshopParams }),
      ]);
      setSummary(summaryRes.data);
      setDeals(dealsRes.data.deals || []);
      setTotal(dealsRes.data.total || 0);
      setClientCompany(summaryRes.data.client_company || dealsRes.data.client_company || null);
      setWorkshops(workshopsRes.data.workshops || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryParams, summaryParams, user]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, loadData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = { ...queryParams };
      delete exportParams.page;
      delete exportParams.limit;
      const res = await api.get('/accounting/export', {
        params: exportParams,
        responseType: 'blob',
      });
      const coLabel = (clientCompany?.short_name || clientCompany?.name || 'ketoan')
        .replace(/[^\w\-]+/g, '_');
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ketoan-deals-${coLabel}-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Xuất file thất bại');
    } finally {
      setExporting(false);
    }
  };

  const workshopChips = useMemo(() => {
    const breakdown = summary?.workshop_breakdown || [];
    const byId = new Map(breakdown.map((w) => [String(w.workshop_company_id || '_all'), w]));
    const chips = [{ id: '', name: 'Tất cả', count: summary?.total_deals || 0 }];
    for (const ws of workshops) {
      const b = byId.get(String(ws.id));
      chips.push({
        id: ws.id,
        name: ws.short_name || ws.name,
        count: b?.deal_count || 0,
        isOwn: ws.is_own_company,
      });
    }
    return chips;
  }, [summary, workshops]);

  const financialCounts = useMemo(() => {
    const bd = summary?.financial_breakdown || {};
    return {
      no_quote: bd.no_quote?.count || 0,
      quoted: bd.quoted?.count || 0,
      ordered: bd.ordered?.count || 0,
      invoiced: bd.invoiced?.count || 0,
      sx_done_not_invoiced: summary?.count_sx_done_not_invoiced || 0,
    };
  }, [summary]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const companyLabel = clientCompany?.short_name || clientCompany?.name || 'Công ty';

  if (!isAccountingUser(user) && user?.role !== 'admin' && user?.role !== 'manager' && user?.role !== 'sales_admin' && user?.role !== 'platform_admin') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-amber-800 font-medium">Module Kế toán chỉ dành cho tài khoản kế toán công ty hoặc admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Receipt className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Module Kế toán</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Tổng hợp deal sản xuất — {companyLabel}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Deal thuộc công ty bạn, phân loại theo xưởng và trạng thái tài chính
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
            Xuất Excel
          </button>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {(summary?.count_sx_done_not_invoiced || 0) > 0 && filterFinancial !== 'sx_done_not_invoiced' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong>{summary.count_sx_done_not_invoiced}</strong> deal đã SX xong nhưng chưa xuất HĐ
              ({formatVND(summary.sx_done_not_invoiced_value || 0)} còn phải thu ước tính)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilterFinancial('sx_done_not_invoiced')}
            className="text-xs font-semibold text-amber-800 underline cursor-pointer hover:text-amber-900"
          >
            Xem danh sách
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Tổng deal SX"
          value={loading ? '…' : (summary?.total_deals ?? 0)}
          sub={filterWorkshop ? 'Theo xưởng đã chọn' : 'Mọi xưởng'}
          active={!filterFinancial}
          onClick={() => setFilterFinancial('')}
        />
        <KpiCard
          label="Đã xuất HĐ"
          value={loading ? '…' : formatVND(summary?.total_invoiced_value || 0)}
          sub={`${financialCounts.invoiced} deal`}
          active={filterFinancial === 'invoiced'}
          onClick={() => setFilterFinancial('invoiced')}
        />
        <KpiCard
          label="Còn phải thu"
          value={loading ? '…' : formatVND(summary?.total_outstanding_value || 0)}
          sub={`${summary?.count_not_invoiced ?? 0} deal chưa HĐ`}
          active={filterFinancial === 'ordered'}
          onClick={() => setFilterFinancial('ordered')}
        />
        <KpiCard
          label="SX xong, chưa HĐ"
          value={loading ? '…' : (summary?.count_sx_done_not_invoiced ?? 0)}
          sub={loading ? '' : formatVND(summary?.sx_done_not_invoiced_value || 0)}
          tone="warn"
          active={filterFinancial === 'sx_done_not_invoiced'}
          onClick={() => setFilterFinancial('sx_done_not_invoiced')}
        />
        <KpiCard
          label="Chi phí xưởng"
          value={loading ? '…' : formatVND(summary?.total_production_value || 0)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 shrink-0 flex items-center gap-1">
          <Factory className="h-3.5 w-3.5" />
          SX tại:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {workshopChips.map((c) => {
            const active = filterWorkshop === c.id;
            return (
              <button
                key={c.id || 'all'}
                type="button"
                onClick={() => setFilterWorkshop(c.id)}
                className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                {active && <span className="mr-1">✓</span>}
                {c.name}
                {!loading && (
                  <span className={`ml-1.5 tabular-nums ${active ? 'text-indigo-100' : 'text-gray-400'}`}>
                    ({c.count})
                  </span>
                )}
                {c.isOwn && !active && (
                  <Building2 className="inline h-3 w-3 ml-1 -mt-0.5 text-indigo-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 shrink-0">Trạng thái TT:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {FINANCIAL_FILTERS.map((f) => {
            const active = filterFinancial === f.id;
            const count = f.id ? (financialCounts[f.id] ?? null) : summary?.total_deals;
            return (
              <button
                key={f.id || 'all-fin'}
                type="button"
                onClick={() => setFilterFinancial(f.id)}
                className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {active && <span className="mr-1">✓</span>}
                {f.label}
                {!loading && count != null && (
                  <span className={`ml-1.5 tabular-nums ${active ? 'text-emerald-100' : 'text-gray-400'}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Tìm mã deal, khách hàng, mã dự án..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">
            {loading ? 'Đang tải...' : `${total} deal`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                ←
              </button>
              <span className="text-gray-500 tabular-nums">{page}/{totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                →
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <th className="py-2.5 px-3">Deal / Khách</th>
                <th className="py-2.5 px-3">SX tại</th>
                <th className="py-2.5 px-3">Cột SX</th>
                <th className="py-2.5 px-3">TT</th>
                <th className="py-2.5 px-3 text-right">Deal CRM</th>
                <th className="py-2.5 px-3 text-right">Chi phí xưởng</th>
                <th className="py-2.5 px-3 text-right">BG</th>
                <th className="py-2.5 px-3 text-right">ĐH</th>
                <th className="py-2.5 px-3 text-right">HĐ</th>
                <th className="py-2.5 px-3 text-right">Còn thu</th>
                <th className="py-2.5 px-3">Cập nhật</th>
                <th className="py-2.5 px-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-400">Đang tải dữ liệu...</td>
                </tr>
              )}
              {!loading && deals.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-400">
                    Không có deal phù hợp bộ lọc hiện tại.
                  </td>
                </tr>
              )}
              {!loading && deals.map((d) => (
                <tr
                  key={d.id}
                  className={`transition-colors hover:bg-indigo-50/30 ${d.sx_production_done && d.financial_status !== 'invoiced' ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="py-3 px-3">
                    <Link to={`/ketoan/deals/${d.id}`} className="font-semibold text-indigo-700 hover:underline">
                      {d.code || d.title}
                    </Link>
                    <p className="text-gray-800 truncate max-w-[14rem]" title={d.title}>{d.title}</p>
                    <p className="text-xs text-gray-500">{d.customer_name}{d.customer_phone ? ` · ${d.customer_phone}` : ''}</p>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-medium text-gray-800">{d.workshop_name || '—'}</span>
                    {d.project_code && <p className="text-xs text-gray-500">{d.project_code}</p>}
                  </td>
                  <td className="py-3 px-3">
                    {d.sx_stage_name ? (
                      <StatusBadge label={d.sx_stage_name} tone="purple" />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                    {d.sx_production_done && (
                      <p className="text-[10px] text-amber-600 font-semibold mt-0.5">SX xong</p>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge
                      label={d.financial_status_label || '—'}
                      tone={FINANCIAL_TONE[d.financial_status] || 'gray'}
                    />
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-indigo-700">
                    {formatVND(d.estimated_value || 0)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-orange-700">
                    {formatVND(d.production_value || 0)}
                  </td>
                  <td className="py-3 px-3">
                    <DocCell
                      total={d.quotation_total}
                      code={d.quotation_code}
                      docId={d.quotation_id}
                      viewHref={d.quotation_id ? `/crm/quotations/${d.quotation_id}` : null}
                      createHref={`/crm/quotations/new?lead_id=${encodeURIComponent(d.id)}`}
                    />
                  </td>
                  <td className="py-3 px-3">
                    <DocCell
                      total={d.order_total}
                      code={d.order_code}
                      docId={d.order_id}
                      viewHref={d.order_id ? `/crm/orders/${d.order_id}` : null}
                      createHref="/crm/orders"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <DocCell
                      total={d.invoice_total}
                      code={d.invoice_code}
                      docId={d.invoice_id}
                      viewHref={d.invoice_id ? `/crm/invoices/${d.invoice_id}` : null}
                      createHref="/crm/invoices/new"
                    />
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-amber-700">
                    {(d.outstanding_amount || 0) > 0 ? formatVND(d.outstanding_amount) : '—'}
                  </td>
                  <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(d.updated_at)}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <Link
                        to={`/ketoan/deals/${d.id}`}
                        title="Chi tiết kế toán"
                        className="p-1.5 rounded-lg text-teal-600 hover:text-teal-800 hover:bg-teal-50"
                      >
                        <Receipt className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/crm/leads/${d.id}`}
                        title="Mở deal CRM"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      {d.project_id && (
                        <Link
                          to={`/sx/projects/${d.project_id}`}
                          title="Mở dự án SX"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                        >
                          <Factory className="h-4 w-4" />
                        </Link>
                      )}
                      {!d.invoice_id && d.financial_status !== 'invoiced' && (
                        <Link
                          to="/crm/invoices/new"
                          title="Tạo hóa đơn"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                        >
                          <Receipt className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> BG = Báo giá</span>
        <span className="inline-flex items-center gap-1"><ShoppingCart className="h-3.5 w-3.5" /> ĐH = Đơn hàng</span>
        <span className="inline-flex items-center gap-1"><Receipt className="h-3.5 w-3.5" /> HĐ = Hóa đơn</span>
        <span>Còn thu = ĐH (hoặc giá trị SX) trừ HĐ đã xuất</span>
      </div>
    </div>
  );
}
