import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { ArrowLeft, Receipt, User, Phone, MapPin, DollarSign, Plus, X, Building2 } from 'lucide-react';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);

  useEffect(() => { load(); }, [id]);
  const load = async () => { setLoading(true); const { data } = await api.get(`/crm/invoices/${id}`); setInvoice(data); setLoading(false); };

  const recordPayment = async (amount, method, ref) => {
    try {
      await api.post(`/crm/invoices/${id}/payments`, { amount: parseFloat(amount), payment_method: method, reference_number: ref });
      setShowPay(false);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  if (loading || !invoice) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full" /></div>;

  const remaining = (invoice.total || 0) - (invoice.paid_amount || 0);
  const paidPct = invoice.total > 0 ? Math.min(((invoice.paid_amount || 0) / invoice.total) * 100, 100) : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/invoices')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <p className="text-xs text-purple-600 font-bold">{invoice.code}</p>
            <h1 className="text-xl font-bold text-gray-900">{invoice.title || 'Hóa đơn'}</h1>
          </div>
        </div>
        {remaining > 0 && (
          <button onClick={() => setShowPay(true)} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"><DollarSign className="h-4 w-4" /> Thu tiền</button>
        )}
      </div>

      {/* Payment Progress */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-gray-500">Tiến độ thanh toán</p>
            <p className="text-2xl font-bold text-gray-900">{formatVND(invoice.paid_amount || 0)} <span className="text-sm font-normal text-gray-400">/ {formatVND(invoice.total)}</span></p>
          </div>
          <div className={`text-sm font-bold px-3 py-1 rounded-full ${paidPct >= 100 ? 'bg-emerald-100 text-emerald-700' : paidPct > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {paidPct >= 100 ? '✅ Đã thanh toán đủ' : paidPct > 0 ? `${Math.round(paidPct)}% đã TT` : 'Chưa thanh toán'}
          </div>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${paidPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${paidPct}%` }} />
        </div>
        {remaining > 0 && <p className="text-sm text-red-600 font-medium mt-2">Còn nợ: {formatVND(remaining)}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Khách hàng</h3>
            {invoice.customer_name && <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><User className="h-4 w-4 text-gray-400" />{invoice.customer_name}</p>}
            {invoice.customer_phone && <p className="text-xs text-gray-500 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" />{invoice.customer_phone}</p>}
            {invoice.customer_address && <p className="text-xs text-gray-500 flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400" />{invoice.customer_address}</p>}
            {invoice.customer_tax_code && <p className="text-xs text-gray-500 flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-gray-400" />MST: {invoice.customer_tax_code}</p>}
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Lịch sử thanh toán</h3>
            {(invoice.payments || []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Chưa có thanh toán</p>
            ) : (
              <div className="space-y-2">
                {invoice.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-bold text-emerald-600">{formatVND(p.amount)}</p>
                      <p className="text-[10px] text-gray-400">{p.payment_method === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'} {p.reference_number ? `· ${p.reference_number}` : ''}</p>
                    </div>
                    <span className="text-xs text-gray-500">{formatDate(p.payment_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Items */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Chi tiết hàng hóa</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-gray-500 uppercase">
              <th className="py-2 text-left">#</th><th className="py-2 text-left">Tên</th><th className="py-2 text-left">ĐVT</th>
              <th className="py-2 text-right">SL</th><th className="py-2 text-right">Đơn giá</th><th className="py-2 text-right">Thành tiền</th>
            </tr></thead>
            <tbody>
              {(invoice.items || []).map((item, i) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2 text-gray-400">{i + 1}</td>
                  <td className="py-2 font-medium text-gray-900">{item.name}</td>
                  <td className="py-2 text-gray-500">{item.unit}</td>
                  <td className="py-2 text-right">{item.quantity}</td>
                  <td className="py-2 text-right">{formatVND(item.unit_price)}</td>
                  <td className="py-2 text-right font-medium">{formatVND(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-4">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Tổng tiền hàng</span><span>{formatVND(invoice.subtotal)}</span></div>
              {invoice.discount_amount > 0 && <div className="flex justify-between"><span className="text-gray-500">Chiết khấu</span><span className="text-red-600">-{formatVND(invoice.discount_amount)}</span></div>}
              {invoice.tax_amount > 0 && <div className="flex justify-between"><span className="text-gray-500">VAT ({invoice.tax_rate}%)</span><span>{formatVND(invoice.tax_amount)}</span></div>}
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>TỔNG CỘNG</span><span className="text-purple-600">{formatVND(invoice.total)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {showPay && <PayModal remaining={remaining} code={invoice.code} onPay={recordPayment} onClose={() => setShowPay(false)} />}
    </div>
  );
}

function PayModal({ remaining, code, onPay, onClose }) {
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState('transfer');
  const [ref, setRef] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Thu tiền — {code}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-gray-600">Số tiền (còn nợ: {formatVND(remaining)})</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          <div><label className="text-xs font-medium text-gray-600">Hình thức</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1"><option value="transfer">🏦 Chuyển khoản</option><option value="cash">💵 Tiền mặt</option></select>
          </div>
          <div><label className="text-xs font-medium text-gray-600">Số GD / Ghi chú</label><input value={ref} onChange={e => setRef(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={() => onPay(amount, method, ref)} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer">Xác nhận thu</button>
        </div>
      </div>
    </div>
  );
}
