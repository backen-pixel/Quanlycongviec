import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, X, Receipt, ExternalLink, RefreshCw, Building2, Factory,
  Download, AlertTriangle, FileSpreadsheet, Truck,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import { getFileOpenAnchorProps } from '../lib/publicFileUrl';
import { isAccountingUser } from '../lib/crossWorkshopProduction';
import { ChecklistMeter } from '../components/accounting/AccountingChecklist';

const FINANCIAL_FILTERS = [
  { id: '', label: 'Tất cả' },
  { id: 'no_quote', label: 'Chưa BG' },
  { id: 'quoted', label: 'Có BG, chưa ĐH' },
  { id: 'ordered', label: 'Có ĐH, chưa HĐ' },
  { id: 'invoiced', label: 'Đã HĐ' },
  { id: 'sx_done_not_invoiced', label: 'SX xong, chưa HĐ' },
];

const TODO_LABELS = {
  quotation: 'Chưa có báo giá',
  quotation_file: 'Chưa có file Excel báo giá',
  order: 'Chưa có đơn hàng',
  order_matches_deal: 'Đơn hàng lệch giá deal CRM',
  deposit: 'Đã thu cọc nhưng ghi chưa nhận',
  payment_proof: 'Khoản thu thiếu mã giao dịch',
  invoice: 'SX xong, chưa xuất hóa đơn',
  vc_cost: 'Đã bàn giao VC/LĐ, chưa nhập phí',
  phat_sinh_cost: 'Có việc phát sinh chưa ghi phí',
  collected: 'SX / lắp xong, chưa thu đủ tiền',
};

const VC_FILTERS = [
  { id: '', label: 'Tất cả' },
  { id: 'none', label: 'Chưa bàn giao VC/LĐ' },
  { id: 'active', label: 'Đang VC/LĐ' },
  { id: 'done', label: 'Lắp xong' },
];

function shortDate(v) {
  return v ? formatDate(String(v).slice(0, 10)) : null;
}

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
    default: active ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200' : 'border-gray-200 bg-white',
    warn: active ? 'border-red-400 bg-red-50 ring-1 ring-red-200' : 'border-red-200 bg-red-50/40',
  };
  const clickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`rounded-xl border px-3.5 py-2.5 shadow-sm text-left transition-all ${toneClasses[tone] || toneClasses.default} ${clickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-extrabold text-gray-900 mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </button>
  );
}

function FilterChip({ active, onClick, children, tone = 'teal' }) {
  const on = tone === 'amber'
    ? 'bg-amber-600 border-amber-600 text-white'
    : 'bg-teal-700 border-teal-700 text-white';
  const off = tone === 'amber'
    ? 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50'
    : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${active ? on : off}`}
    >
      {children}
    </button>
  );
}

function quoteFileOf(deal) {
  if (deal.quotation_file_name || deal.quotation_file_url) {
    return {
      name: deal.quotation_file_name || 'File Excel báo giá',
      url: deal.quotation_file_url || null,
      origin: 'imported',
    };
  }
  const files = deal.workshop_quote_files || [];
  const sheet = files.find((f) => f.is_sheet) || files[0];
  if (!sheet) return null;
  return { name: sheet.file_name, url: sheet.file_url, origin: 'workshop' };
}

function FileLink({ name, url }) {
  const props = url ? getFileOpenAnchorProps(url, { fileName: name }) : null;
  if (!props) {
    return <p className="font-medium text-gray-800 line-clamp-2 break-words" title={name}>{name}</p>;
  }
  return (
    <a {...props} className="font-medium text-blue-700 hover:underline line-clamp-2 break-words" title={name}>
      {name}
    </a>
  );
}

const STEP_TONE = {
  done: { bar: 'bg-emerald-500', dot: 'bg-emerald-500 text-white', text: 'text-emerald-700' },
  active: { bar: 'bg-amber-400', dot: 'bg-amber-400 text-white', text: 'text-amber-700' },
  warn: { bar: 'bg-red-400', dot: 'bg-red-500 text-white', text: 'text-red-600' },
  idle: { bar: 'bg-gray-200', dot: 'bg-gray-200 text-gray-500', text: 'text-gray-400' },
};

function Step({ no, title, status, tone = 'idle', children }) {
  const t = STEP_TONE[tone] || STEP_TONE.idle;
  return (
    <div className="bg-white min-w-0 flex flex-col">
      <div className={`h-1 ${t.bar}`} />
      <div className="px-3 pt-2.5 pb-3 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className={`h-5 w-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${t.dot}`}>{no}</span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{title}</span>
        </div>
        <p className={`text-sm font-bold leading-snug line-clamp-1 ${t.text}`} title={status}>{status}</p>
        <div className="text-xs text-gray-600 space-y-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function MoneyRow({ label, value, to, empty = '—', emptyTo, emptyClass = 'text-gray-400' }) {
  let right;
  if (value != null) {
    right = to
      ? <Link to={to} className="font-semibold text-gray-900 hover:text-teal-700 hover:underline tabular-nums">{formatVND(value)}</Link>
      : <span className="font-semibold text-gray-900 tabular-nums">{formatVND(value)}</span>;
  } else if (emptyTo) {
    right = <Link to={emptyTo} className={`font-semibold hover:underline ${emptyClass}`}>{empty}</Link>;
  } else {
    right = <span className={emptyClass}>{empty}</span>;
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      {right}
    </div>
  );
}

function DealIdentityCard({ deal }) {
  const file = quoteFileOf(deal);
  const namesDiffer = deal.names_differ === true;
  const vcActive = Boolean(deal.vc_phase) && deal.vc_phase !== 'none';
  const detailTo = `/ketoan/deals/${deal.id}`;
  const phatSinhTo = `${detailTo}?tab=finance#phat-sinh`;
  const outstanding = deal.outstanding_amount || 0;
  const missingLabels = (deal.checklist?.items || []).filter((i) => i.status === 'missing').map((i) => i.label);

  const crmTone = deal.order_id ? 'done' : 'active';
  const sxTone = deal.sx_production_done ? 'done' : (deal.sx_stage_name ? 'active' : 'idle');
  const docTone = { invoiced: 'done', ordered: 'active', quoted: 'active', no_quote: 'warn' }[deal.financial_status] || 'idle';
  const vcTone = deal.vc_done ? 'done' : (vcActive ? 'active' : 'idle');
  const vcDates = [
    deal.delivery_date ? `Giao ${shortDate(deal.delivery_date)}` : null,
    deal.install_date ? `Lắp ${shortDate(deal.install_date)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <article className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link to={detailTo} className="font-bold text-teal-700 hover:underline">{deal.code || 'Deal'}</Link>
            {deal.crm_stage_name && <StatusBadge label={deal.crm_stage_name} tone="gray" />}
            {namesDiffer && <StatusBadge label="Tên CRM khác tên xưởng" tone="amber" />}
          </div>
          <Link to={detailTo} className="mt-1 text-base font-bold text-gray-900 hover:text-teal-800 line-clamp-1" title={deal.title}>
            {deal.title || 'Chưa đặt tên deal'}
          </Link>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {[deal.customer_name, deal.customer_phone].filter(Boolean).join(' · ') || 'Chưa có khách hàng'}
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <Link to={detailTo} title={missingLabels.join(', ')} className="w-32">
            <ChecklistMeter checklist={deal.checklist} compact />
          </Link>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Còn phải thu</p>
            {outstanding > 0
              ? <p className="text-lg font-extrabold text-amber-600 tabular-nums leading-tight">{formatVND(outstanding)}</p>
              : <p className="text-sm font-bold text-emerald-600 leading-tight mt-0.5">Đã thu đủ</p>}
          </div>
          <div className="flex items-center gap-0.5">
            <Link to={`/crm/leads/${deal.id}`} title="Mở deal CRM" className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
              <ExternalLink className="h-4 w-4" />
            </Link>
            {deal.project_id && (
              <Link to={`/sx/projects/${deal.project_id}`} title="Mở dự án xưởng" className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50">
                <Factory className="h-4 w-4" />
              </Link>
            )}
            {deal.project_id && vcActive && (
              <Link to={`/vc/projects/${deal.project_id}`} title="Mở dự án VC/LĐ" className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50">
                <Truck className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
        <Step no={1} title="CRM" status={deal.order_id ? 'Đã chốt đơn' : 'Chưa chốt đơn'} tone={crmTone}>
          <MoneyRow label="Giá trị deal" value={deal.estimated_value || 0} />
          {deal.assignee_name && <p className="truncate text-gray-500">Phụ trách: {deal.assignee_name}</p>}
        </Step>

        <Step
          no={2}
          title="Xưởng"
          status={deal.sx_production_done ? 'Sản xuất xong' : (deal.sx_stage_name || 'Chưa vào sản xuất')}
          tone={sxTone}
        >
          <p className="truncate">
            <span className="font-semibold text-gray-800">{deal.project_code || 'Chưa có mã'}</span>
            {deal.workshop_name ? ` · ${deal.workshop_name}` : ''}
          </p>
          {namesDiffer && (
            <p className="text-amber-800 line-clamp-2" title={deal.project_name}>Tên xưởng: {deal.project_name}</p>
          )}
          <MoneyRow label="Chi phí xưởng" value={deal.production_value || 0} />
          {deal.phat_sinh_count > 0 ? (
            <>
              <MoneyRow
                label={`Phát sinh (${deal.phat_sinh_count} việc)`}
                value={deal.phat_sinh_missing_cost < deal.phat_sinh_count ? deal.extra_cost_total || 0 : null}
                to={phatSinhTo}
                empty="Chưa ghi phí"
                emptyTo={phatSinhTo}
                emptyClass="text-rose-600"
              />
              {deal.phat_sinh_missing_cost > 0 && deal.phat_sinh_missing_cost < deal.phat_sinh_count && (
                <p className="text-right text-[11px] text-rose-600">{deal.phat_sinh_missing_cost} việc chưa ghi phí</p>
              )}
            </>
          ) : (
            <MoneyRow label="Phát sinh" value={null} empty="Không có" />
          )}
        </Step>

        <Step no={3} title="Chứng từ" status={deal.financial_status_label || '—'} tone={docTone}>
          {file ? (
            <div className="flex items-start gap-1.5 min-w-0" title={file.origin === 'imported' ? 'Đã nhập vào báo giá CRM' : 'File đang nằm trên dự án xưởng'}>
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
              <FileLink name={file.name} url={file.url} />
            </div>
          ) : (
            <p className="text-gray-400">Chưa có file Excel báo giá</p>
          )}
          <MoneyRow
            label="Báo giá"
            value={deal.quotation_id ? deal.quotation_total || 0 : null}
            to={deal.quotation_id ? `/crm/quotations/${deal.quotation_id}` : null}
            empty="+ Tạo"
            emptyTo={`/crm/quotations/new?lead_id=${encodeURIComponent(deal.id)}`}
            emptyClass="text-indigo-600"
          />
          <MoneyRow label="Đơn hàng" value={deal.order_id ? deal.order_total || 0 : null} to={deal.order_id ? `/crm/orders/${deal.order_id}` : null} />
          <MoneyRow
            label="Hóa đơn"
            value={deal.invoice_id ? deal.invoice_total || 0 : null}
            to={deal.invoice_id ? `/crm/invoices/${deal.invoice_id}` : null}
            empty={deal.order_id ? '+ Xuất' : '—'}
            emptyTo={deal.order_id ? detailTo : null}
            emptyClass={deal.order_id ? 'text-purple-600' : 'text-gray-400'}
          />
        </Step>

        <Step
          no={4}
          title="Vận chuyển / Lắp đặt"
          status={vcActive ? (deal.vc_stage_name || deal.vc_phase_label) : 'Chưa bàn giao'}
          tone={vcTone}
        >
          <p className="truncate">
            {vcActive ? (deal.vc_company_name || 'Chưa rõ đơn vị VC') : 'Xưởng chưa chuyển sang VC/LĐ'}
          </p>
          {vcActive && <p className="text-gray-500">{vcDates || 'Chưa có ngày giao / lắp'}</p>}
          <MoneyRow
            label="Phí VC/LĐ"
            value={deal.logistics_cost}
            empty={vcActive ? 'Chưa nhập' : '—'}
            emptyTo={vcActive ? detailTo : null}
            emptyClass={vcActive ? 'text-amber-600' : 'text-gray-400'}
          />
        </Step>
      </div>
    </article>
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
  const [filterNameMismatch, setFilterNameMismatch] = useState(false);
  const [filterMissingDocs, setFilterMissingDocs] = useState(false);
  const [filterMissingItem, setFilterMissingItem] = useState('');
  const [filterVc, setFilterVc] = useState('');
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
  }, [filterWorkshop, filterFinancial, filterNameMismatch, filterMissingDocs, filterMissingItem, filterVc, searchDebounced]);

  const queryParams = useMemo(() => {
    const p = {
      page,
      limit,
      ...(filterWorkshop ? { workshop_company_id: filterWorkshop } : {}),
      ...(searchDebounced ? { search: searchDebounced } : {}),
      ...(filterNameMismatch ? { name_mismatch: 'true' } : {}),
      ...(filterMissingDocs ? { missing_docs: 'true' } : {}),
      ...(filterMissingItem ? { missing_item: filterMissingItem } : {}),
      ...(filterVc ? { vc_group: filterVc } : {}),
    };
    if (filterFinancial === 'sx_done_not_invoiced') {
      p.sx_done_not_invoiced = 'true';
    } else if (filterFinancial) {
      p.financial_status = filterFinancial;
    }
    if (!isAccountingUser(user) && user?.company_id) {
      p.client_company_id = user.company_id;
    }
    return p;
  }, [page, limit, filterWorkshop, filterFinancial, filterNameMismatch, filterMissingDocs, filterMissingItem, filterVc, searchDebounced, user]);

  const vcCounts = useMemo(() => {
    const out = { '': summary?.total_deals || 0 };
    for (const b of summary?.vc_breakdown || []) out[b.key] = b.count;
    return out;
  }, [summary]);

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

  if (!isAccountingUser(user) && user?.role !== 'admin' && user?.role !== 'ecosystem_admin' && user?.role !== 'manager' && user?.role !== 'sales_admin' && user?.role !== 'platform_admin') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-amber-800 font-medium">Module Kế toán chỉ dành cho tài khoản kế toán công ty hoặc admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-teal-700 mb-1">
            <Receipt className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Kế toán · {companyLabel}</span>
          </div>
          <h1 className="text-xl font-extrabold text-gray-900">Đối chiếu deal CRM, xưởng và VC/LĐ</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Mỗi deal hiện tên trên CRM, tên dự án xưởng, file báo giá và tình trạng vận chuyển / lắp đặt. Các tên có thể khác nhau.
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

      {!loading && (summary?.missing_by_item || []).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-bold">Việc kế toán cần làm</span>
              <span className="text-xs text-amber-800">
                {summary.count_missing_docs} deal còn thiếu hồ sơ
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <button type="button" onClick={() => setFilterMissingDocs(true)} className="text-amber-900 underline cursor-pointer">
                Xem các deal thiếu
              </button>
              <Link to="/ketoan/cong-no" className="text-amber-900 underline">Mở công nợ</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {summary.missing_by_item.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setFilterMissingItem((cur) => (cur === m.key ? '' : m.key))}
                className={`rounded-lg border px-3 py-2 text-left cursor-pointer ${filterMissingItem === m.key ? 'bg-amber-100 border-amber-400 ring-1 ring-amber-300' : 'bg-white border-amber-100 hover:border-amber-300'}`}
              >
                <p className="text-lg font-extrabold text-gray-900 tabular-nums">{m.count}</p>
                <p className="text-xs text-gray-600">{TODO_LABELS[m.key] || m.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
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
          sub={loading ? '' : `+ phát sinh ${formatVND(summary?.total_extra_cost || 0)}`}
        />
        <KpiCard
          label="Phí VC/LĐ"
          value={loading ? '…' : formatVND(summary?.total_logistics_cost || 0)}
          sub={`${vcCounts.active ?? 0} đang VC/LĐ · ${vcCounts.done ?? 0} lắp xong`}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm mã deal, tên CRM, tên xưởng, file báo giá, khách hàng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 shrink-0 flex items-center gap-1 w-16">
            <Factory className="h-3.5 w-3.5" />
            Xưởng
          </span>
          {workshopChips.map((c) => (
            <FilterChip key={c.id || 'all'} active={filterWorkshop === c.id} onClick={() => setFilterWorkshop(c.id)}>
              {c.name}
              {!loading && <span className="ml-1.5 tabular-nums opacity-80">({c.count})</span>}
              {c.isOwn && filterWorkshop !== c.id && <Building2 className="inline h-3 w-3 ml-1 -mt-0.5" />}
            </FilterChip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 shrink-0 w-16">Tiền</span>
          {FINANCIAL_FILTERS.map((f) => {
            const count = f.id ? (financialCounts[f.id] ?? null) : summary?.total_deals;
            return (
              <FilterChip key={f.id || 'all-fin'} active={filterFinancial === f.id} onClick={() => setFilterFinancial(f.id)}>
                {f.label}
                {!loading && count != null && <span className="ml-1.5 tabular-nums opacity-80">({count})</span>}
              </FilterChip>
            );
          })}
          <FilterChip tone="amber" active={filterMissingDocs} onClick={() => setFilterMissingDocs((v) => !v)}>
            Thiếu hồ sơ
            {!loading && <span className="ml-1.5 tabular-nums opacity-80">({summary?.count_missing_docs ?? 0})</span>}
          </FilterChip>
          <FilterChip tone="amber" active={filterNameMismatch} onClick={() => setFilterNameMismatch((v) => !v)}>
            Tên CRM khác tên xưởng
            {!loading && <span className="ml-1.5 tabular-nums opacity-80">({summary?.count_name_mismatch ?? 0})</span>}
          </FilterChip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 shrink-0 flex items-center gap-1 w-16">
            <Truck className="h-3.5 w-3.5" />
            VC/LĐ
          </span>
          {VC_FILTERS.map((f) => (
            <FilterChip key={f.id || 'all-vc'} active={filterVc === f.id} onClick={() => setFilterVc(f.id)}>
              {f.label}
              {!loading && vcCounts[f.id] != null && <span className="ml-1.5 tabular-nums opacity-80">({vcCounts[f.id]})</span>}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-700">
            {loading ? 'Đang tải...' : `${total} deal`}
          </p>
          {filterMissingItem && (
            <button
              type="button"
              onClick={() => setFilterMissingItem('')}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold cursor-pointer"
            >
              {TODO_LABELS[filterMissingItem] || filterMissingItem}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 rounded border border-gray-200 bg-white disabled:opacity-40 cursor-pointer hover:bg-gray-50"
            >
              ←
            </button>
            <span className="text-gray-500 tabular-nums">{page}/{totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 rounded border border-gray-200 bg-white disabled:opacity-40 cursor-pointer hover:bg-gray-50"
            >
              →
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">Đang tải dữ liệu...</div>
      )}
      {!loading && deals.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
          Không có deal phù hợp bộ lọc hiện tại.
        </div>
      )}
      {!loading && deals.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>Mỗi deal đi qua 4 bước:</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Xong</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Đang làm</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Thiếu</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-300" />Chưa tới</span>
          </div>
          <div className="space-y-3">
            {deals.map((d) => <DealIdentityCard key={d.id} deal={d} />)}
          </div>
        </>
      )}
    </div>
  );
}
