import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { ArrowLeft, ShoppingCart, Receipt, User, Phone, MapPin, Package, Calendar, Truck, Download, Loader2, Pencil } from 'lucide-react';

const STATUS_MAP = { draft: 'Nháp', confirmed: 'Xác nhận', processing: 'Đang SX', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
const STATUS_COLORS = { draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700', processing: 'bg-amber-100 text-amber-700', shipped: 'bg-indigo-100 text-indigo-700', delivered: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700' };
const STATUS_STEPS = ['draft', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [statusLoadingStep, setStatusLoadingStep] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const _invoiceSaving = useRef(false);

  useEffect(() => { load(); }, [id]);
  const load = async () => { setLoading(true); const { data } = await api.get(`/crm/orders/${id}`); setOrder(data); setLoading(false); };

  const createInvoice = async () => {
    if (_invoiceSaving.current) return;
    if (!confirm('Tạo hóa đơn từ đơn hàng này?')) return;
    _invoiceSaving.current = true;
    setInvoiceLoading(true);
    try { const { data } = await api.post(`/crm/orders/${id}/create-invoice`); alert(`Đã tạo hóa đơn ${data.code}`); navigate('/crm/invoices'); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); _invoiceSaving.current = false; setInvoiceLoading(false); }
  };

  const updateStatus = async (newStatus) => {
    if (statusLoadingStep) return;
    if (!confirm(`Chuyển trạng thái sang "${STATUS_MAP[newStatus]}"?`)) return;
    setStatusLoadingStep(newStatus);
    try {
      const { data } = await api.put(`/crm/orders/${id}`, { status: newStatus });
      if (data.auto_project) {
        alert(`🚀 Đã tự động tạo dự án ${data.auto_project.code}!\nĐơn hàng → Project + Tasks đã được gen tự động.`);
      }
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setStatusLoadingStep(null);
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/crm/orders/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order?.code || 'don-hang'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Lỗi tải PDF'); }
    setPdfLoading(false);
  };

  if (loading || !order) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full" /></div>;

  const currentStep = STATUS_STEPS.indexOf(order.status);
  const remaining = (order.total || 0) - (order.paid_amount || 0);
  const totalVat = (order.items || []).reduce((s, i) => s + (i.vat_amount || (i.amount || 0) * (i.vat_rate || 0) / 100), 0);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/orders')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <p className="text-xs text-emerald-600 font-bold">{order.code}</p>
            <h1 className="text-xl font-bold text-gray-900">{order.title || 'Đơn hàng'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/crm/orders/${id}/edit`)} className="h-9 px-4 border border-emerald-300 text-emerald-600 hover:bg-emerald-50 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Pencil className="h-4 w-4" /> Sửa
          </button>
          <button onClick={downloadPdf} disabled={pdfLoading} className="h-9 px-4 border rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {pdfLoading ? 'Đang tải...' : 'Xuất PDF'}
          </button>
          <button onClick={createInvoice} disabled={invoiceLoading} className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-60">
            {invoiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {invoiceLoading ? 'Đang tạo HĐ...' : 'Tạo hóa đơn'}
          </button>
        </div>
      </div>

      {/* Progress Steps - Clickable */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <button onClick={() => updateStatus(step)} disabled={!!statusLoadingStep}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-all disabled:cursor-not-allowed ${i <= currentStep ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                title={`Chuyển sang: ${STATUS_MAP[step]}`}>
                {statusLoadingStep === step ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
              </button>
              <span className={`text-xs font-medium ml-2 ${i <= currentStep ? 'text-emerald-700' : 'text-gray-400'}`}>{STATUS_MAP[step]}</span>
              {i < STATUS_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${i < currentStep ? 'bg-emerald-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        {order.status !== 'cancelled' && (
          <div className="mt-3 flex justify-end">
            <button onClick={() => updateStatus('cancelled')} className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Hủy đơn hàng</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Customer + Payment - horizontal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Khách hàng</h3>
            {order.customer_name && <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><User className="h-4 w-4 text-gray-400" />{order.customer_name}</p>}
            {order.customer_phone && <p className="text-xs text-gray-500 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" />{order.customer_phone}</p>}
            {order.customer_address && <p className="text-xs text-gray-500 flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400" />{order.customer_address}</p>}
            {order.delivery_date && <p className="text-xs text-gray-500 flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-gray-400" />Giao: {formatDate(order.delivery_date)}</p>}
          </div>
          <div className="bg-white rounded-xl border p-4 space-y-3">
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
        <div className="bg-white rounded-xl border p-3">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Chi tiết hàng hóa</h3>
          <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-[1200px] w-full text-xs">
            <thead><tr className="border-b text-[9px] text-gray-500 uppercase tracking-wider">
              <th className="py-1.5 px-1 text-left">STT</th><th className="py-1.5 px-1 text-left">Mã HH</th><th className="py-1.5 px-1 text-left min-w-[160px]">Tên</th><th className="py-1.5 px-1 text-left min-w-[120px]">Diễn giải</th><th className="py-1.5 px-1 text-center">ĐVT</th>
              <th className="py-1.5 px-1 text-right">Cao</th><th className="py-1.5 px-1 text-right">Rộng</th><th className="py-1.5 px-1 text-right">Dài</th>
              <th className="py-1.5 px-1 text-right">SL</th><th className="py-1.5 px-1 text-right">Đơn giá</th><th className="py-1.5 px-1 text-right">Thành tiền</th>
              <th className="py-1.5 px-1 text-right">CK%</th><th className="py-1.5 px-1 text-right">Tiền CK</th>
              <th className="py-1.5 px-1 text-right">%VAT</th><th className="py-1.5 px-1 text-right">Tiền thuế</th>
              <th className="py-1.5 px-1 text-right">Tổng</th><th className="py-1.5 px-1 text-left">CTKM</th><th className="py-1.5 px-1 text-center">KM</th>
            </tr></thead>
            <tbody>
              {(order.items || []).map((item, i) => {
                const vatAmount = item.vat_amount || (item.amount || 0) * (item.vat_rate || 0) / 100;
                const discAmt = item.discount_amount || (item.quantity || 0) * (item.unit_price || 0) * (item.discount_percent || 0) / 100;
                const total = item.total || ((item.amount || 0) + vatAmount);
                return (
                  <tr key={item.id} className="border-b text-xs">
                    <td className="py-1 px-1 text-gray-400">{i + 1}</td>
                    <td className="py-1 px-1 text-gray-500">{item.product_code || '-'}</td>
                    <td className="py-1 px-1 font-medium text-gray-900">{item.name}</td>
                    <td className="py-1 px-1 text-gray-500">{item.description || ''}</td>
                    <td className="py-1 px-1 text-center text-gray-500">{item.unit}</td>
                    <td className="py-1 px-1 text-right text-gray-400">{item.height || '-'}</td>
                    <td className="py-1 px-1 text-right text-gray-400">{item.width || '-'}</td>
                    <td className="py-1 px-1 text-right text-gray-400">{item.length || '-'}</td>
                    <td className="py-1 px-1 text-right">{item.quantity}</td>
                    <td className="py-1 px-1 text-right">{formatVND(item.unit_price)}</td>
                    <td className="py-1 px-1 text-right font-medium">{formatVND(item.amount)}</td>
                    <td className="py-1 px-1 text-right text-gray-500">{item.discount_percent || 0}%</td>
                    <td className="py-1 px-1 text-right text-orange-600">{formatVND(discAmt)}</td>
                    <td className="py-1 px-1 text-right text-gray-500">{item.vat_rate || 0}%</td>
                    <td className="py-1 px-1 text-right text-gray-600">{formatVND(vatAmount)}</td>
                    <td className="py-1 px-1 text-right font-bold text-blue-700">{formatVND(total)}</td>
                    <td className="py-1 px-1 text-gray-500">{item.promo_code || ''}</td>
                    <td className="py-1 px-1 text-center">{item.is_promo ? '🎁' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="flex justify-end mt-4">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Tổng tiền hàng</span><span>{formatVND(order.subtotal)}</span></div>
              {order.discount_amount > 0 && <div className="flex justify-between"><span className="text-gray-500">Chiết khấu</span><span className="text-red-600">-{formatVND(order.discount_amount)}</span></div>}
              {totalVat > 0 && <div className="flex justify-between"><span className="text-gray-500">Thuế GTGT</span><span>{formatVND(totalVat)}</span></div>}
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>TỔNG CỘNG</span><span className="text-emerald-600">{formatVND(order.total)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
