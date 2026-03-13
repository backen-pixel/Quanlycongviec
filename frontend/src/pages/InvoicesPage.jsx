import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Search, Receipt, DollarSign, Calendar } from 'lucide-react';

const PAY_MAP = { unpaid: 'Chưa TT', partial: 'TT 1 phần', paid: 'Đã TT đủ' };
const PAY_COLORS = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700' };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); const { data } = await api.get('/crm/invoices'); setInvoices(data || []); setLoading(false); };

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
      <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Receipt className="h-6 w-6 text-purple-600" /> Hóa đơn</h1><p className="text-sm text-gray-500 mt-1">{invoices.length} hóa đơn · Tổng {formatVND(totalAmount)}</p></div>

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
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500 uppercase">
          <th className="py-3 px-3">Mã</th><th className="py-3 px-3">Tiêu đề</th><th className="py-3 px-3">Khách hàng</th>
          <th className="py-3 px-3 text-right">Tổng tiền</th><th className="py-3 px-3 text-right">Đã thu</th><th className="py-3 px-3 text-right">Còn nợ</th><th className="py-3 px-3">TT</th><th className="py-3 px-3">Ngày</th>
        </tr></thead><tbody>
          {filtered.map(i => {
            const debt = (i.total || 0) - (i.paid_amount || 0);
            return (
              <tr key={i.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/crm/invoices/${i.id}`)}>
                <td className="py-3 px-3 font-bold text-purple-600">{i.code}</td>
                <td className="py-3 px-3 font-medium">{i.title || '-'}</td>
                <td className="py-3 px-3 text-gray-600">{i.customer_name || i.customer?.full_name || '-'}</td>
                <td className="py-3 px-3 text-right font-bold">{formatVND(i.total || 0)}</td>
                <td className="py-3 px-3 text-right text-emerald-600 font-medium">{formatVND(i.paid_amount || 0)}</td>
                <td className="py-3 px-3 text-right font-medium text-red-600">{debt > 0 ? formatVND(debt) : '—'}</td>
                <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${PAY_COLORS[i.payment_status] || ''}`}>{PAY_MAP[i.payment_status] || i.payment_status}</span></td>
                <td className="py-3 px-3 text-gray-500">{formatDate(i.created_at)}</td>
              </tr>
            );
          })}
        </tbody></table>
        {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Không có hóa đơn phù hợp</p>}
      </div>
    </div>
  );
}
