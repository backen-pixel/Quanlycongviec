import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { formatVND, formatDate } from '../lib/utils';
import { RefreshCw, Building2, Plus, Download, ArrowRightLeft, Search, Calendar, X } from 'lucide-react';

const STATUS_LABELS = {
  draft: 'Nháp',
  sent: 'Đã gửi',
  accepted: 'Khách duyệt',
  converted: 'Đã chốt',
  rejected: 'Từ chối',
  expired: 'Hết hạn',
};

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'sent', label: 'Đã gửi' },
  { key: 'accepted', label: 'Khách duyệt' },
  { key: 'converted', label: 'Đã chốt' },
  { key: 'rejected', label: 'Từ chối' },
  { key: 'expired', label: 'Hết hạn' },
];

function normalizeSearchText(s) {
  return String(s || '').toLowerCase();
}

function pad2(n) { return String(n).padStart(2, '0'); }

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function yearMonthOf(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

const STATUS_BADGE_CLS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-700',
  accepted: 'bg-amber-50 text-amber-700',
  converted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

export default function QuotesOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(currentYearMonth);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 1000 };
      if (canPickCompany && companyId) params.company_id = companyId;
      const res = await api.get('/crm/quotations', { params });
      const list = Array.isArray(res.data) ? res.data : [];
      setQuotes(list);
      setSelectedId((prev) => (list.some((q) => q.id === prev) ? prev : (list[0]?.id || null)));
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu báo giá');
    } finally {
      setLoading(false);
    }
  }, [canPickCompany, companyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    api.get(`/crm/quotations/${selectedId}`)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'tất cả công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  // Phạm vi theo tháng + tìm kiếm (chưa lọc theo tab trạng thái) — dùng để tính số đếm trên từng tab.
  const monthAndSearchScoped = useMemo(() => {
    const term = normalizeSearchText(search.trim());
    return quotes.filter((q) => {
      if (month && yearMonthOf(q.created_at) !== month) return false;
      if (!term) return true;
      const haystack = normalizeSearchText([
        q.code, q.title, q.customer_name, q.customer?.full_name,
      ].filter(Boolean).join(' '));
      return haystack.includes(term);
    });
  }, [quotes, search, month]);

  const statusCounts = useMemo(() => {
    const counts = { all: monthAndSearchScoped.length };
    for (const q of monthAndSearchScoped) counts[q.status] = (counts[q.status] || 0) + 1;
    return counts;
  }, [monthAndSearchScoped]);

  const filteredQuotes = useMemo(() => {
    if (statusFilter === 'all') return monthAndSearchScoped;
    return monthAndSearchScoped.filter((q) => q.status === statusFilter);
  }, [monthAndSearchScoped, statusFilter]);

  // Thống kê tính theo danh sách đang lọc (tháng + tab trạng thái + tìm kiếm) — phản ánh đúng những gì đang hiển thị.
  const stats = useMemo(() => {
    let valueThisMonth = 0;
    let pending = 0;
    let converted = 0;
    for (const q of filteredQuotes) {
      valueThisMonth += Number(q.total) || 0;
      if (q.status === 'sent') pending += 1;
      if (q.status === 'converted') converted += 1;
    }
    const closeRate = filteredQuotes.length > 0 ? Math.round((converted / filteredQuotes.length) * 100) : 0;
    return { valueThisMonth, pending, closeRate };
  }, [filteredQuotes]);

  useEffect(() => {
    if (!filteredQuotes.some((q) => q.id === selectedId)) {
      setSelectedId(filteredQuotes[0]?.id || null);
    }
  }, [filteredQuotes, selectedId]);

  const handleDownloadPdf = async () => {
    if (!selectedId || pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/crm/quotations/${selectedId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${detail?.code || 'bao-gia'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.response?.data?.error || 'Không tải được PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!selectedId || converting) return;
    if (!window.confirm(`Chuyển báo giá ${detail?.code || ''} sang đơn hàng?`)) return;
    setConverting(true);
    try {
      const res = await api.post(`/crm/quotations/${selectedId}/convert-to-order`);
      alert(`Đã tạo đơn hàng ${res.data?.code || ''}`);
      await load();
    } catch (e) {
      alert(e?.response?.data?.error || 'Không chuyển được thành đơn hàng');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#111827' }}>Dự toán & Báo giá</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Tạo, gửi và theo dõi báo giá cho khách hàng của {companyName}
          </p>
          {(statusFilter !== 'all' || search.trim() || month) && (
            <p className="text-xs text-gray-500 mt-1">
              Số liệu dưới đây đang tính theo bộ lọc: <span className="font-medium text-gray-700">
                {month ? `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}` : 'Tất cả thời gian'}
                {statusFilter !== 'all' ? ` · ${STATUS_TABS.find((t) => t.key === statusFilter)?.label}` : ''}
                {search.trim() ? ` · "${search.trim()}"` : ''}
              </span> ({filteredQuotes.length} báo giá)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 pl-8 pr-7 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
            />
            {month && (
              <button
                type="button"
                onClick={() => setMonth('')}
                title="Xem tất cả thời gian"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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
            to="/crm/quotations/new"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Tạo báo giá
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Tổng giá trị báo giá {month ? `tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}` : '(tất cả thời gian)'}
          </p>
          <p className="text-2xl font-bold mt-1.5 text-gray-900">{loading ? '…' : formatVND(stats.valueThisMonth)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Đang chờ khách duyệt</p>
          <p className="text-2xl font-bold mt-1.5 text-amber-600">{loading ? '…' : `${stats.pending} báo giá`}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Tỷ lệ chốt đơn</p>
          <p className="text-2xl font-bold mt-1.5 text-emerald-600">{loading ? '…' : `${stats.closeRate}%`}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 space-y-2.5">
            <div className="relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã, tên khách, tiêu đề báo giá..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatusFilter(t.key)}
                  className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                    statusFilter === t.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t.label} · {statusCounts[t.key] || 0}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Đang tải...</p>
            ) : filteredQuotes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                {quotes.length === 0 ? 'Chưa có báo giá nào.' : 'Không có báo giá phù hợp bộ lọc.'}
              </p>
            ) : (
              filteredQuotes.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedId(q.id)}
                  className={`w-full text-left px-4 py-3 cursor-pointer transition-colors ${
                    selectedId === q.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {q.code} · {q.customer?.full_name || q.customer_name || 'Chưa gán KH'}
                    </p>
                    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[q.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[q.status] || q.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{q.title || '—'}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-400">{formatDate(q.created_at)}</p>
                    <p className="text-sm font-semibold text-gray-700">{formatVND(q.total)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
          {detailLoading ? (
            <p className="text-sm text-gray-400 text-center py-12">Đang tải...</p>
          ) : !detail ? (
            <p className="text-sm text-gray-400 text-center py-12">Chọn một báo giá để xem chi tiết.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-900">{detail.code} · {detail.title || ''}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Khách hàng: {detail.customer?.full_name || detail.customer_name || '—'} · Người tạo: {detail.creator?.full_name || '—'}
                    {detail.valid_until && <> · Hiệu lực đến {formatDate(detail.valid_until)}</>}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE_CLS[detail.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[detail.status] || detail.status}
                </span>
              </div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[38%]" />
                    <col className="w-[12%]" />
                    <col className="w-[10%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="py-2 font-semibold">Mô tả</th>
                      <th className="py-2 font-semibold">ĐVT</th>
                      <th className="py-2 font-semibold">SL</th>
                      <th className="py-2 font-semibold">Đơn giá</th>
                      <th className="py-2 font-semibold text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).length === 0 ? (
                      <tr><td colSpan={5} className="py-6 text-center text-gray-400">Không có dòng mục nào.</td></tr>
                    ) : detail.items.map((it) => (
                      <tr key={it.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 truncate" title={it.name || it.description}>{it.name || it.description || '—'}</td>
                        <td className="py-2 text-gray-600">{it.unit || '—'}</td>
                        <td className="py-2 text-gray-600">{it.quantity}</td>
                        <td className="py-2 text-gray-600 truncate">{formatVND(it.unit_price)}</td>
                        <td className="py-2 text-right font-medium text-gray-800">{formatVND(it.amount ?? (it.quantity * it.unit_price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 space-y-1 text-sm text-right">
                <p className="text-gray-500">Tạm tính <span className="inline-block w-32 text-gray-700 font-medium">{formatVND(detail.subtotal)}</span></p>
                <p className="text-gray-500">VAT ({detail.tax_rate || 0}%) <span className="inline-block w-32 text-gray-700 font-medium">{formatVND(detail.tax_amount)}</span></p>
                <p className="text-gray-900 font-bold text-base">Tổng cộng <span className="inline-block w-32">{formatVND(detail.total)}</span></p>
              </div>

              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  Tải PDF
                </button>
                {(detail.status === 'accepted' || detail.status === 'sent') && (
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={converting}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Chuyển thành đơn hàng
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
