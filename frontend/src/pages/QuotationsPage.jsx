import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Plus, Search, FileText, Filter, ShoppingCart, Calendar, Download, Trash2, Loader2 } from 'lucide-react';
import ExcelQuotationImport from '../components/ExcelQuotationImport';

const STATUS_MAP = { draft: 'Nháp', sent: 'Đã gửi', accepted: 'Chấp nhận', rejected: 'Từ chối', expired: 'Hết hạn', converted: 'Đã chuyển ĐH' };
const STATUS_COLORS = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-amber-100 text-amber-700', converted: 'bg-purple-100 text-purple-700' };

export default function QuotationsPage() {
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [convertLoadingId, setConvertLoadingId] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); const { data } = await api.get('/crm/quotations'); setQuotes(data || []); setLoading(false); };

  const downloadPdf = async (id, code, e) => {
    e.stopPropagation();
    if (pdfLoadingId) return;
    setPdfLoadingId(id);
    try {
      const r = await api.get(`/crm/quotations/${id}/pdf`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      a.download = `${(code || 'bao-gia').replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { alert('Lỗi tải PDF'); }
    setPdfLoadingId(null);
  };

  const filtered = quotes.filter(q => {
    if (statusFilter && q.status !== statusFilter) return false;
    if (dateFrom && q.created_at < dateFrom) return false;
    if (dateTo && q.created_at > dateTo + 'T23:59:59') return false;
    if (search) { const s = search.toLowerCase(); return (q.code||'').toLowerCase().includes(s) || (q.title||'').toLowerCase().includes(s) || (q.customer_name||'').toLowerCase().includes(s); }
    return true;
  });

  const summary = { total: quotes.length, draft: 0, sent: 0, accepted: 0, rejected: 0, converted: 0, value: 0 };
  quotes.forEach(q => { summary[q.status] = (summary[q.status] || 0) + 1; summary.value += q.total || 0; });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileText className="h-6 w-6 text-blue-600" /> Báo giá</h1><p className="text-sm text-gray-500 mt-1">{summary.total} báo giá · {formatVND(summary.value)}</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExcelImport(true)} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">📥 Import Excel</button>
          <button data-tour="create-quotation" onClick={() => navigate('/crm/quotations/new')} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"><Plus className="h-4 w-4" /> Tạo báo giá</button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 overflow-x-auto">
        <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${!statusFilter ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}>Tất cả ({summary.total})</button>
        {Object.entries(STATUS_MAP).map(([k, v]) => summary[k] > 0 && (
          <button key={k} onClick={() => setStatusFilter(statusFilter === k ? '' : k)} className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap ${statusFilter === k ? 'bg-blue-600 text-white border-blue-600' : STATUS_COLORS[k]}`}>{v} ({summary[k]})</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã, tên, KH..." className="w-full h-10 pl-10 pr-3 border rounded-lg text-sm" />
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500"><Calendar className="h-3.5 w-3.5" />Từ</div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10 px-3 border rounded-lg text-sm" />
          <div className="text-xs text-gray-500">→</div>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10 px-3 border rounded-lg text-sm" />
          {(search || statusFilter || dateFrom || dateTo) && <button onClick={() => { setSearch(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); }} className="text-xs text-red-500 hover:underline cursor-pointer">Xóa lọc</button>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-gray-500 uppercase">
              <th className="py-3 px-3">Mã</th><th className="py-3 px-3">Tiêu đề</th><th className="py-3 px-3">Khách hàng</th>
              <th className="py-3 px-3 text-right">Tổng tiền</th><th className="py-3 px-3">Trạng thái</th><th className="py-3 px-3">Người tạo</th><th className="py-3 px-3">Ngày tạo</th><th className="py-3 px-3 text-center">PDF</th><th className="py-3 px-3"></th><th className="py-3 px-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/crm/quotations/${q.id}`)}>
                  <td className="py-3 px-3 font-bold text-blue-600">{q.code}</td>
                  <td className="py-3 px-3 font-medium text-gray-900">{q.title || '-'}</td>
                  <td className="py-3 px-3 text-gray-600">{q.customer_name || q.customer?.full_name || '-'}</td>
                  <td className="py-3 px-3 text-right font-bold text-gray-900">{formatVND(q.total || 0)}</td>
                  <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[q.status] || ''}`}>{STATUS_MAP[q.status] || q.status}</span></td>
                  <td className="py-3 px-3 text-xs">
                    <span className="text-gray-700 font-medium">{q.creator?.full_name || '—'}</span>
                    {q.approver?.full_name && q.approver.full_name !== q.creator?.full_name && (
                      <span className="block text-[10px] text-emerald-600" title="Đã kiểm tra & xác nhận">✓ {q.approver.full_name}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-gray-500">{formatDate(q.created_at)}</td>
                  <td className="py-3 px-3 text-center">
                    <button onClick={e => downloadPdf(q.id, q.code, e)} disabled={pdfLoadingId === q.id} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer disabled:opacity-50" title="Tải PDF">
                      {pdfLoadingId === q.id ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <Download className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="py-3 px-3">
                    {q.status !== 'converted' && (
                      <button onClick={e => { e.stopPropagation(); convertToOrder(q.id); }} disabled={convertLoadingId === q.id} className="text-xs text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50">
                        {convertLoadingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                        {convertLoadingId === q.id ? 'Đang tạo...' : '→ĐH'}
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center"><button onClick={e => { e.stopPropagation(); if(confirm('Xóa báo giá ' + q.code + '?')) api.delete('/crm/quotations/' + q.id).then(load).catch(() => alert('Lỗi xóa')); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer" title="Xóa"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Không có báo giá phù hợp</p>}
        </div>
      </div>

      {/* Excel Import Modal */}
      {showExcelImport && (
        <ExcelQuotationImport
          onImportDone={(data) => {
            setShowExcelImport(false);
            load();
            navigate(`/crm/quotations/${data.id}`);
          }}
          onClose={() => setShowExcelImport(false)}
        />
      )}
    </div>
  );

  async function convertToOrder(id) {
    if (convertLoadingId) return;
    if (!confirm('Chuyển báo giá thành đơn hàng?')) return;
    setConvertLoadingId(id);
    try { const { data } = await api.post(`/crm/quotations/${id}/convert-to-order`); alert(`Đã tạo đơn hàng ${data.code}`); load(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setConvertLoadingId(null);
  }
}
