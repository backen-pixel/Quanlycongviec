import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Plus, Search, FileText, X, Trash2, ArrowRight, ShoppingCart } from 'lucide-react';

const STATUS_MAP = { draft: 'Nháp', sent: 'Đã gửi', accepted: 'Chấp nhận', rejected: 'Từ chối', expired: 'Hết hạn', converted: 'Đã chuyển ĐH' };
const STATUS_COLORS = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-amber-100 text-amber-700', converted: 'bg-purple-100 text-purple-700' };

export default function QuotationsPage() {
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/crm/quotations', { params: { search: search || undefined } });
    setQuotes(data || []);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileText className="h-6 w-6 text-blue-600" /> Báo giá</h1>
          <p className="text-sm text-gray-500 mt-1">Tạo và quản lý báo giá cho khách hàng</p>
        </div>
        <button onClick={() => navigate('/crm/quotations/new')} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
          <Plus className="h-4 w-4" /> Tạo báo giá
        </button>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Tìm mã, tên, KH..." className="w-full h-10 pl-10 pr-3 border rounded-lg text-sm" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-gray-500 uppercase">
              <th className="py-3 px-3">Mã</th><th className="py-3 px-3">Tiêu đề</th><th className="py-3 px-3">Khách hàng</th>
              <th className="py-3 px-3 text-right">Tổng tiền</th><th className="py-3 px-3">Trạng thái</th><th className="py-3 px-3">Ngày tạo</th><th className="py-3 px-3"></th>
            </tr></thead>
            <tbody>
              {quotes.map(q => (
                <tr key={q.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/crm/quotations/${q.id}`)}>
                  <td className="py-3 px-3 font-bold text-blue-600">{q.code}</td>
                  <td className="py-3 px-3 font-medium text-gray-900">{q.title || '-'}</td>
                  <td className="py-3 px-3 text-gray-600">{q.customer_name || q.customer?.full_name || '-'}</td>
                  <td className="py-3 px-3 text-right font-bold text-gray-900">{formatVND(q.total || 0)}</td>
                  <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[q.status] || ''}`}>{STATUS_MAP[q.status] || q.status}</span></td>
                  <td className="py-3 px-3 text-gray-500">{formatDate(q.created_at)}</td>
                  <td className="py-3 px-3">
                    {q.status !== 'converted' && (
                      <button onClick={e => { e.stopPropagation(); convertToOrder(q.id); }} className="text-xs text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer" title="Chuyển thành đơn hàng">
                        <ShoppingCart className="h-3.5 w-3.5" /> → ĐH
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {quotes.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Chưa có báo giá nào</p>}
        </div>
      </div>
    </div>
  );

  async function convertToOrder(id) {
    if (!confirm('Chuyển báo giá thành đơn hàng?')) return;
    try {
      const { data } = await api.post(`/crm/quotations/${id}/convert-to-order`);
      alert(`Đã tạo đơn hàng ${data.code}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  }
}
