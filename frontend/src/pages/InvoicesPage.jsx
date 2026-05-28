import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Search, Receipt, DollarSign, Calendar, Download, Plus, Trash2, FileCheck, Loader2 } from 'lucide-react';

const PAY_MAP = { unpaid: 'Chưa TT', partial: 'TT 1 phần', paid: 'Đã TT đủ' };
const PAY_COLORS = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700' };

const MISA_BADGE = {
  not_sent:  { label: 'Chưa PH', cls: 'bg-gray-100 text-gray-500' },
  published: { label: 'Đã PH', cls: 'bg-blue-100 text-blue-700' },
  sent_email:{ label: 'Đã gửi', cls: 'bg-indigo-100 text-indigo-700' },
  cancelled: { label: 'Đã hủy', cls: 'bg-red-100 text-red-700' },
};


export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [misaLoadingId, setMisaLoadingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); const { data } = await api.get('/crm/invoices'); setInvoices(data || []); setLoading(false); };

  const downloadPdf = async (id, code) => {
    if (pdfLoadingId) return;
    setPdfLoadingId(id);
    try {
      const r = await api.get(`/crm/invoices/${id}/pdf`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      a.download = `${(code || 'hoa-don').replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { alert('Lỗi tải PDF'); }
    setPdfLoadingId(null);
  };

  const publishMisa = async (inv, e) => {
    e.stopPropagation();
    if (misaLoadingId) return;
    if (!confirm(`Phát hành HĐĐT cho ${inv.code}?`)) return;
    setMisaLoadingId(inv.id);
    try {
      const { data } = await api.post(`/crm/invoices/${inv.id}/misa-publish`);
      alert(`Phát hành thành công!\nSố HĐ MISA: ${data.invoiceNo || 'N/A'}`);
      load();
    } catch (e) { alert('Lỗi MISA: ' + (e.response?.data?.error || e.message)); }
    setMisaLoadingId(null);
  };

  const filtered = invoices.filter(i => {
    if (payFilter && i.payment_status !== payFilter) return false;
    if (dateFrom && i.created_at < dateFrom) return false;
    if (dateTo && i.created_at > dateTo + 'T23:59:59') return false;
    if (search) { const s = search.toLowerCase(); return (i.code||'').toLowerCase().includes(s) || (i.title||'').toLowerCase().includes(s) || (i.customer_name||'').toLowerCase().includes(s); }
    return true;
  });

  const totalAmount = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const totalDebt = totalAmount - totalPaid;
  const paySummary = {};
  invoices.forEach(i => { paySummary[i.payment_status] = (paySummary[i.payment_status] || 0) + 1; });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Receipt className="h-6 w-6 text-purple-600" /> Hóa đơn</h1><p className="text-sm text-gray-500 mt-1">{invoices.length} hóa đơn · Tổng {formatVND(totalAmount)}</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/crm/invoices/new')} className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"><Plus className="h-4 w-4" /> Tạo hóa đơn</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500 uppercase">Tổng hóa đơn</p><p className="text-xl font-bold text-gray-900">{formatVND(totalAmount)}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500 uppercase">Đã thu</p><p className="text-xl font-bold text-emerald-600">{formatVND(totalPaid)}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500 uppercase">Còn nợ</p><p className="text-xl font-bold text-red-600">{formatVND(totalDebt)}</p></div>
      </div>

      {/* Payment tabs */}
      <div className="flex gap-2 overflow-x-auto">
        <button onClick={() => setPayFilter('')} className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${!payFilter ? 'bg-purple-600 text-white border-purple-600' : 'hover:bg-gray-50'}`}>Tất cả ({invoices.length})</button>
        {Object.entries(PAY_MAP).map(([k, v]) => (paySummary[k] || 0) > 0 && (
          <button key={k} onClick={() => setPayFilter(payFilter === k ? '' : k)} className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap ${payFilter === k ? 'bg-purple-600 text-white border-purple-600' : PAY_COLORS[k]}`}>{v} ({paySummary[k]})</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã, tên, KH..." className="w-full h-10 pl-10 pr-3 border rounded-lg text-sm" /></div>
          <div className="flex items-center gap-1 text-xs text-gray-500"><Calendar className="h-3.5 w-3.5" />Từ</div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10 px-3 border rounded-lg text-sm" />
          <div className="text-xs text-gray-500">→</div>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10 px-3 border rounded-lg text-sm" />
          {(search || payFilter || dateFrom || dateTo) && <button onClick={() => { setSearch(''); setPayFilter(''); setDateFrom(''); setDateTo(''); }} className="text-xs text-red-500 hover:underline cursor-pointer">Xóa lọc</button>}
        </div>
        <div
          className="overflow-auto rounded-lg border border-gray-200 [scrollbar-width:thin]"
          style={{ maxHeight: 'calc(100vh - 360px)', minHeight: 240 }}
        >
        <table className="w-full text-sm">
          <thead className="bg-white/90 backdrop-blur sticky top-0 z-10 shadow-sm">
            <tr className="border-b text-left text-xs text-gray-600 uppercase">
              <th className="py-3 px-3 whitespace-nowrap">Mã</th>
              <th className="py-3 px-3 whitespace-nowrap">Tiêu đề</th>
              <th className="py-3 px-3 whitespace-nowrap">Khách hàng</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">Tổng tiền</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">Đã thu</th>
              <th className="py-3 px-3 text-right whitespace-nowrap">Còn nợ</th>
              <th className="py-3 px-3 whitespace-nowrap">TT</th>
              <th className="py-3 px-3 text-center whitespace-nowrap"><span className="flex items-center gap-1 justify-center"><FileCheck className="h-3.5 w-3.5" />HĐĐT</span></th>
              <th className="py-3 px-3 whitespace-nowrap">Người tạo</th>
              <th className="py-3 px-3 whitespace-nowrap">Ngày</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">PDF</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">Phát hành MISA</th>
              <th className="py-3 px-3"></th>
            </tr>
          </thead>
          <tbody>
          {filtered.map(i => {
            const debt = (i.total || 0) - (i.paid_amount || 0);
            const misaKey = i.misa_status || 'not_sent';
            const misaBadge = MISA_BADGE[misaKey] || MISA_BADGE.not_sent;
            return (
              <tr key={i.id} className="border-b hover:bg-slate-200/70 transition-colors cursor-pointer" onClick={() => navigate(`/crm/invoices/${i.id}`)}>
                <td className="py-3 px-3 font-bold text-purple-600">{i.code}</td>
                <td className="py-3 px-3 font-medium">{i.title || '-'}</td>
                <td className="py-3 px-3 text-gray-600">{i.customer_name || i.customer?.full_name || '-'}</td>
                <td className="py-3 px-3 text-right font-bold">{formatVND(i.total || 0)}</td>
                <td className="py-3 px-3 text-right text-emerald-600 font-medium">{formatVND(i.paid_amount || 0)}</td>
                <td className="py-3 px-3 text-right font-medium text-red-600">{debt > 0 ? formatVND(debt) : '—'}</td>
                <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${PAY_COLORS[i.payment_status] || ''}`}>{PAY_MAP[i.payment_status] || i.payment_status}</span></td>
                <td className="py-3 px-3 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${misaBadge.cls}`} title={i.misa_invoice_no ? `Số HĐ: ${i.misa_invoice_no}` : ''}>
                    {misaBadge.label}
                  </span>
                </td>
                <td className="py-3 px-3 text-gray-600 text-xs">{i.creator?.full_name || '—'}</td>
                <td className="py-3 px-3 text-gray-500">{formatDate(i.created_at)}</td>
                <td className="py-3 px-3 text-center">
                  <button onClick={e => { e.stopPropagation(); downloadPdf(i.id, i.code); }} disabled={pdfLoadingId === i.id} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer disabled:opacity-50" title="Tải PDF">
                    {pdfLoadingId === i.id ? <Loader2 className="h-4 w-4 animate-spin text-purple-500" /> : <Download className="h-4 w-4" />}
                  </button>
                </td>
                <td className="py-3 px-3 text-center">
                  {(!i.misa_status || i.misa_status === 'not_sent') && (
                    <button onClick={e => publishMisa(i, e)} disabled={misaLoadingId === i.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 disabled:opacity-50 cursor-pointer whitespace-nowrap">
                      {misaLoadingId === i.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                      {misaLoadingId === i.id ? 'Đang PH...' : 'Phát hành'}
                    </button>
                  )}
                  {i.misa_status === 'published' && <span className="text-xs text-blue-600 font-medium">✓ Đã PH</span>}
                  {i.misa_status === 'sent_email' && <span className="text-xs text-indigo-600 font-medium">✓ Đã gửi</span>}
                </td>
                <td className="py-3 px-3 text-center"><button onClick={e => { e.stopPropagation(); if(confirm('Xóa hóa đơn ' + i.code + '?')) api.delete('/crm/invoices/' + i.id).then(load).catch(() => alert('Lỗi xóa')); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer" title="Xóa"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            );
          })}
        </tbody></table>
          {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Không có hóa đơn phù hợp</p>}
        </div>
        {filtered.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 px-1">
            <span>Hiển thị <strong className="text-gray-700">{filtered.length}</strong> hóa đơn{(search || payFilter || dateFrom || dateTo) ? ' (đã lọc)' : ''}</span>
            {filtered.length > 8 && <span>Cuộn dọc để xem thêm</span>}
          </div>
        )}
      </div>
    </div>
  );
}
