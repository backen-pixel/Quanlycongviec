import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { ArrowLeft, ShoppingCart, Receipt, User, Phone, MapPin, Package, Calendar, Truck } from 'lucide-react';

const STATUS_MAP = { draft: 'Nháp', confirmed: 'Xác nhận', processing: 'Đang SX', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
const STATUS_COLORS = { draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700', processing: 'bg-amber-100 text-amber-700', shipped: 'bg-indigo-100 text-indigo-700', delivered: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700' };
const STATUS_STEPS = ['draft', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);
  const load = async () => { setLoading(true); const { data } = await api.get(`/crm/orders/${id}`); setOrder(data); setLoading(false); };

  const createInvoice = async () => {
    if (!confirm('Tạo hóa đơn từ đơn hàng này?')) return;
    try { const { data } = await api.post(`/crm/orders/${id}/create-invoice`); alert(`Đã tạo hóa đơn ${data.code}`); navigate('/crm/invoices'); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  if (loading || !order) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full" /></div>;

  const currentStep = STATUS_STEPS.indexOf(order.status);
  const remaining = (order.total || 0) - (order.paid_amount || 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/orders')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <p className="text-xs text-emerald-600 font-bold">{order.code}</p>
            <h1 className="text-xl font-bold text-gray-900">{order.title || 'Đơn hàng'}</h1>
          </div>
        </div>
        <button onClick={createInvoice} className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"><Receipt className="h-4 w-4" /> Tạo hóa đơn</button>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i <= currentStep ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{i + 1}</div>
              <span className={`text-xs font-medium ml-2 ${i <= currentStep ? 'text-emerald-700' : 'text-gray-400'}`}>{STATUS_MAP[step]}</span>
              {i < STATUS_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${i < currentStep ? 'bg-emerald-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customer + Payment */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Khách hàng</h3>
            {order.customer_name && <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><User className="h-4 w-4 text-gray-400" />{order.customer_name}</p>}
            {order.customer_phone && <p className="text-xs text-gray-500 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" />{order.customer_phone}</p>}
            {order.customer_address && <p className="text-xs text-gray-500 flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400" />{order.customer_address}</p>}
            {order.delivery_date && <p className="text-xs text-gray-500 flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-gray-400" />Giao: {formatDate(order.delivery_date)}</p>}
          </div>
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Thanh toán</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-xs text-gray-500">Tổng tiền</span><span className="text-sm font-bold">{formatVND(order.total)}</span></div>
              <div className="flex justify-between"><span className="text-xs text-gray-500">Đã thanh toán</span><span className="text-sm font-bold text-emerald-600">{formatVND(order.paid_amount || 0)}</span></div>
              {remaining > 0 && <div className="flex justify-between border-t pt-2"><span className="text-xs font-medium text-red-600">Còn nợ</span><span className="text-sm font-bold text-red-600">{formatVND(remaining)}</span></div>}
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${order.total > 0 ? Math.min(((order.paid_amount || 0) / order.total) * 100, 100) : 0}%` }} />
            </div>
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
              {(order.items || []).map((item, i) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2 text-gray-400">{i + 1}</td>
                  <td className="py-2"><p className="font-medium text-gray-900">{item.name}</p>{item.description && <p className="text-[10px] text-gray-400">{item.description}</p>}</td>
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
              <div className="flex justify-between"><span className="text-gray-500">Tổng tiền hàng</span><span>{formatVND(order.subtotal)}</span></div>
              {order.discount_amount > 0 && <div className="flex justify-between"><span className="text-gray-500">Chiết khấu</span><span className="text-red-600">-{formatVND(order.discount_amount)}</span></div>}
              {order.tax_amount > 0 && <div className="flex justify-between"><span className="text-gray-500">VAT ({order.tax_rate}%)</span><span>{formatVND(order.tax_amount)}</span></div>}
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>TỔNG CỘNG</span><span className="text-emerald-600">{formatVND(order.total)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
