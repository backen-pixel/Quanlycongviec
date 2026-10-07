import { useMemo, useState } from 'react';
import { X, Loader2, Receipt } from 'lucide-react';
import api from '../../lib/api';
import { formatVND } from '../../lib/utils';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Xuất hóa đơn từ đơn hàng; mặc định xuất phần đơn hàng chưa có hóa đơn. */
export default function InvoiceFromOrderModal({ leadId, orders, invoices, customerName, params, onClose, onCreated }) {
  const [orderId, setOrderId] = useState(orders[0]?.id || '');
  const order = orders.find((o) => o.id === orderId) || null;
  const invoicedForOrder = useMemo(
    () => invoices
      .filter((i) => i.order_id === orderId && i.status !== 'cancelled')
      .reduce((s, i) => s + (Number(i.total) || 0), 0),
    [invoices, orderId],
  );
  const remaining = Math.max(0, (Number(order?.total) || 0) - invoicedForOrder);

  const [form, setForm] = useState({
    invoice_number: '',
    invoice_date: todayIso(),
    amount: '',
    tax_rate: '10',
    customer_name: customerName || '',
    customer_tax_code: '',
    customer_address: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!orderId) return setError('Chọn đơn hàng');
    setSaving(true);
    setError('');
    try {
      await api.post(`/accounting/deals/${leadId}/invoices`, {
        order_id: orderId,
        ...form,
        amount: form.amount ? Number(form.amount) : null,
      }, { params });
      onCreated?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không xuất được hóa đơn');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';
  const label = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-purple-600" />
            <h2 className="text-base font-bold text-gray-900">Xuất hóa đơn</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {orders.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Deal chưa có đơn hàng. Cần tạo đơn hàng trước khi xuất hóa đơn.
            </p>
          ) : (
            <>
              <div>
                <label className={label}>Đơn hàng</label>
                <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={input}>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>{o.code} · {formatVND(o.total || 0)}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Đã xuất {formatVND(invoicedForOrder)} · còn {formatVND(remaining)} chưa xuất hóa đơn
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Số hóa đơn</label>
                  <input value={form.invoice_number} onChange={set('invoice_number')} placeholder="VD: 0000123" className={input} />
                </div>
                <div>
                  <label className={label}>Ngày xuất</label>
                  <input type="date" value={form.invoice_date} onChange={set('invoice_date')} className={input} />
                </div>
                <div>
                  <label className={label}>Số tiền (gồm VAT)</label>
                  <input type="number" value={form.amount} onChange={set('amount')} placeholder={String(remaining)} className={input} />
                </div>
                <div>
                  <label className={label}>Thuế VAT</label>
                  <select value={form.tax_rate} onChange={set('tax_rate')} className={input}>
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="8">8%</option>
                    <option value="10">10%</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={label}>Tên người mua trên hóa đơn</label>
                <input value={form.customer_name} onChange={set('customer_name')} className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Mã số thuế</label>
                  <input value={form.customer_tax_code} onChange={set('customer_tax_code')} placeholder="Bỏ trống nếu cá nhân" className={input} />
                </div>
                <div>
                  <label className={label}>Địa chỉ</label>
                  <input value={form.customer_address} onChange={set('customer_address')} className={input} />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Có số hóa đơn thì ghi nhận là đã phát hành. Bỏ trống số thì lưu bản nháp để điền sau.
              </p>
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
            Đóng
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !orderId || remaining <= 0}
            className="h-9 px-4 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Xuất hóa đơn
          </button>
        </div>
      </div>
    </div>
  );
}
