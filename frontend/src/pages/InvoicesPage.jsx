import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { Search, Receipt, Plus, DollarSign } from 'lucide-react';

const INV_STATUS = { draft: 'Nháp', issued: 'Đã xuất', sent: 'Đã gửi', paid: 'Đã TT', overdue: 'Quá hạn', cancelled: 'Đã hủy', void: 'Vô hiệu' };
const INV_COLORS = { draft: 'bg-gray-100 text-gray-600', issued: 'bg-blue-100 text-blue-700', sent: 'bg-indigo-100 text-indigo-700', paid: 'bg-emerald-100 text-emerald-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400', void: 'bg-gray-100 text-gray-400' };
const PAY_COLORS = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700' };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); const { data } = await api.get('/crm/invoices', { params: { search: search || undefined } }); setInvoices(data || []); setLoading(false); };

  const recordPayment = async (invoiceId, amount, method, ref) => {
    try {
      await api.post(`/crm/invoices/${invoiceId}/payments`, { amount: parseFloat(amount), payment_method: method, reference_number: ref });
      setPayModal(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Receipt className="h-6 w-6 text-purple-600" /> Hóa đơn</h1><p className="text-sm text-gray-500 mt-1">Quản lý hóa đơn & thanh toán</p></div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Tìm mã, KH..." className="w-full h-10 pl-10 pr-3 border rounded-lg text-sm" /></div>
        </div>
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500 uppercase">
          <th className="py-3 px-3">Mã</th><th className="py-3 px-3">Khách hàng</th>
          <th className="py-3 px-3 text-right">Tổng tiền</th><th className="py-3 px-3 text-right">Đã TT</th><th className="py-3 px-3 text-right">Còn nợ</th>
          <th className="py-3 px-3">Trạng thái</th><th className="py-3 px-3">Ngày</th><th className="py-3 px-3"></th>
        </tr></thead><tbody>
          {invoices.map(inv => {
            const remaining = (inv.total || 0) - (inv.paid_amount || 0);
            return (
              <tr key={inv.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-3 font-bold text-purple-600">{inv.code}</td>
                <td className="py-3 px-3">{inv.customer_name || inv.customer?.full_name || '-'}</td>
                <td className="py-3 px-3 text-right font-bold">{formatVND(inv.total || 0)}</td>
                <td className="py-3 px-3 text-right text-emerald-600 font-medium">{formatVND(inv.paid_amount || 0)}</td>
                <td className="py-3 px-3 text-right text-red-600 font-bold">{remaining > 0 ? formatVND(remaining) : '-'}</td>
                <td className="py-3 px-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${PAY_COLORS[inv.payment_status] || ''}`}>
                    {inv.payment_status === 'paid' ? 'Đã TT' : inv.payment_status === 'partial' ? 'TT 1 phần' : 'Chưa TT'}
                  </span>
                </td>
                <td className="py-3 px-3 text-gray-500">{formatDate(inv.created_at)}</td>
                <td className="py-3 px-3">
                  {inv.payment_status !== 'paid' && (
                    <button onClick={() => setPayModal({ id: inv.id, code: inv.code, remaining })} className="text-xs text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer">
                      <DollarSign className="h-3.5 w-3.5" /> Thu tiền
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody></table>
        {invoices.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Chưa có hóa đơn. Tạo từ Đơn hàng → Tạo HĐ</p>}
      </div>

      {/* Payment Modal */}
      {payModal && <PaymentModal invoice={payModal} onPay={recordPayment} onClose={() => setPayModal(null)} />}
    </div>
  );
}

function PaymentModal({ invoice, onPay, onClose }) {
  const [amount, setAmount] = useState(invoice.remaining);
  const [method, setMethod] = useState('transfer');
  const [ref, setRef] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Thu tiền - {invoice.code}</h2>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-gray-600">Số tiền</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          <div><label className="text-xs font-medium text-gray-600">Hình thức</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
              <option value="transfer">Chuyển khoản</option><option value="cash">Tiền mặt</option>
            </select>
          </div>
          <div><label className="text-xs font-medium text-gray-600">Số GD / Ghi chú</label><input value={ref} onChange={e => setRef(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={() => onPay(invoice.id, amount, method, ref)} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer">Xác nhận thu</button>
        </div>
      </div>
    </div>
  );
}
