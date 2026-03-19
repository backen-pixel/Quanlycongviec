import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Search, ShoppingCart, Receipt, Calendar, Download } from 'lucide-react';

const ORDER_STATUS = { draft: 'Nháp', confirmed: 'Xác nhận', processing: 'Đang SX', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
const ORDER_COLORS = { draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700', processing: 'bg-amber-100 text-amber-700', shipped: 'bg-indigo-100 text-indigo-700', delivered: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700' };
const PAY_STATUS = { unpaid: 'Chưa TT', partial: 'TT 1 phần', paid: 'Đã TT' };
const PAY_COLORS = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700' };

function downloadPdf(type, id, code) {
  api.get(`/crm/${type}/${id}/pdf`, { responseType: 'blob' })
    .then(r => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })); a.download = `${(code || type).replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`; a.click(); URL.revokeObjectURL(a.href); })
    .catch(() => alert('Lỗi tải PDF'));
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); const { data } = await api.get('/crm/orders'); setOrders(data || []); setLoading(false); };

  const filtered = orders.filter(o => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (payFilter && o.payment_status !== payFilter) return false;
    if (dateFrom && o.created_at < dateFrom) return false;
    if (dateTo && o.created_at > dateTo + 'T23:59:59') return false;
    if (search) { const s = search.toLowerCase(); return (o.code||'').toLowerCase().includes(s) || (o.title||'').toLowerCase().includes(s) || (o.customer_name||'').toLowerCase().includes(s); }
    return true;
  });

  const summary = {};
  orders.forEach(o => { summary[o.status] = (summary[o.status] || 0) + 1; });
  const totalValue = orders.reduce((s, o) => s + (o.total || 0), 0);

  const createInvoice = async (id) => {
    if (!confirm('Tạo hóa đơn từ đơn hàng này?')) return;
    try { const { data } = await api.post(`/crm/orders/${id}/create-invoice`); alert(`Đã tạo hóa đơn ${data.code}`); navigate('/crm/invoices'); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-emerald-600" /> Đơn hàng</h1><p className="text-sm text-gray-500 mt-1">{orders.length} đơn · {formatVND(totalValue)}</p></div>

      {/* Status tabs */}
      <div className="flex gap-2 overflow-x-auto">
        <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${!statusFilter ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-gray-50'}`}>Tất cả ({orders.length})</button>
        {Object.entries(ORDER_STATUS).map(([k, v]) => (summary[k] || 0) > 0 && (
          <button key={k} onClick={() => setStatusFilter(statusFilter === k ? '' : k)} className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap ${statusFilter === k ? 'bg-emerald-600 text-white border-emerald-600' : ORDER_COLORS[k]}`}>{v} ({summary[k]})</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã, tên, KH..." className="w-full h-10 pl-10 pr-3 border rounded-lg text-sm" /></div>
          <select value={payFilter} onChange={e => setPayFilter(e.target.value)} className="h-10 px-3 border rounded-lg text-sm">
            <option value="">TT: Tất cả</option>
            {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="flex items-center gap-1 text-xs text-gray-500"><Calendar className="h-3.5 w-3.5" />Từ</div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10 px-3 border rounded-lg text-sm" />
          <div className="text-xs text-gray-500">→</div>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10 px-3 border rounded-lg text-sm" />
          {(search || statusFilter || payFilter || dateFrom || dateTo) && <button onClick={() => { setSearch(''); setStatusFilter(''); setPayFilter(''); setDateFrom(''); setDateTo(''); }} className="text-xs text-red-500 hover:underline cursor-pointer">Xóa lọc</button>}
        </div>
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500 uppercase">
          <th className="py-3 px-3">Mã</th><th className="py-3 px-3">Tiêu đề</th><th className="py-3 px-3">Khách hàng</th>
          <th className="py-3 px-3 text-right">Tổng tiền</th><th className="py-3 px-3">Trạng thái</th><th className="py-3 px-3">Thanh toán</th><th className="py-3 px-3">Ngày</th><th className="py-3 px-3 text-center">PDF</th><th className="py-3 px-3"></th>
        </tr></thead><tbody>
          {filtered.map(o => (
            <tr key={o.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/crm/orders/${o.id}`)}>
              <td className="py-3 px-3 font-bold text-emerald-600">{o.code}</td>
              <td className="py-3 px-3 font-medium">{o.title || '-'}</td>
              <td className="py-3 px-3 text-gray-600">{o.customer_name || o.customer?.full_name || '-'}</td>
              <td className="py-3 px-3 text-right font-bold">{formatVND(o.total || 0)}</td>
              <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${ORDER_COLORS[o.status] || ''}`}>{ORDER_STATUS[o.status] || o.status}</span></td>
              <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${PAY_COLORS[o.payment_status] || ''}`}>{PAY_STATUS[o.payment_status] || o.payment_status}</span></td>
              <td className="py-3 px-3 text-gray-500">{formatDate(o.created_at)}</td>
              <td className="py-3 px-3 text-center"><button onClick={e => { e.stopPropagation(); downloadPdf('orders', o.id, o.code); }} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer" title="Tải PDF"><Download className="h-4 w-4" /></button></td>
              <td className="py-3 px-3"><button onClick={e => { e.stopPropagation(); createInvoice(o.id); }} className="text-xs text-purple-600 hover:underline flex items-center gap-1 cursor-pointer"><Receipt className="h-3.5 w-3.5" />→HĐ</button></td>
            </tr>
          ))}
        </tbody></table>
        {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Không có đơn hàng phù hợp</p>}
      </div>
    </div>
  );
}
