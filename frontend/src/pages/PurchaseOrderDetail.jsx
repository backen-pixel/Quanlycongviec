import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { PO_STATUS, PO_COLORS } from './PurchasingInboxPage';
import { ArrowLeft, Pencil, Send, Package } from 'lucide-react';

const NEXT_STATUSES = {
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['ordered', 'cancelled'],
  ordered: ['partial_received', 'received', 'cancelled'],
  partial_received: ['received', 'cancelled'],
};

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/purchasing/orders/${id}`);
      setOrder(data);
    } catch {
      setOrder(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const submit = async () => {
    if (!confirm('Gửi lệnh này sang inbox Mua hàng?')) return;
    setActing(true);
    try {
      const { data } = await api.post(`/purchasing/orders/${id}/submit`);
      setOrder(data);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setActing(false);
  };

  const changeStatus = async (status) => {
    const label = PO_STATUS[status] || status;
    if (!confirm(`Chuyển trạng thái → «${label}»?`)) return;
    setActing(true);
    try {
      const { data } = await api.post(`/purchasing/orders/${id}/status`, { status });
      setOrder(data);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setActing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>Không tìm thấy lệnh đặt hàng</p>
        <button type="button" onClick={() => navigate('/mua-hang')} className="mt-3 text-orange-600 text-sm cursor-pointer">← Inbox</button>
      </div>
    );
  }

  const items = order.items || [];
  const next = NEXT_STATUSES[order.status] || [];

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start gap-3 flex-wrap">
        <button type="button" onClick={() => navigate('/mua-hang')} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{order.code}</h1>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${PO_COLORS[order.status] || ''}`}>
              {PO_STATUS[order.status] || order.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-0.5">{order.title}</p>
          <p className="text-xs text-gray-400 mt-1">
            Tạo {formatDate(order.created_at)}
            {order.submitted_at ? ` · Gửi MH ${formatDate(order.submitted_at)}` : ''}
            {order.creator?.full_name ? ` · ${order.creator.full_name}` : ''}
          </p>
          {order.lead_id && (
            <button
              type="button"
              onClick={() => navigate(`/crm/leads/${order.lead_id}`)}
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-orange-700 hover:underline cursor-pointer"
            >
              Deal: <span className="font-semibold">{order.lead?.title || order.title || 'CRM'}</span>
              {order.lead?.code ? <span className="text-gray-400 text-xs">({order.lead.code})</span> : null}
              <span aria-hidden>→</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {order.status === 'draft' && (
            <>
              <button type="button" onClick={() => navigate(`/mua-hang/orders/${id}/edit`)} className="h-9 px-3 border rounded-lg text-sm flex items-center gap-1.5 cursor-pointer">
                <Pencil className="h-4 w-4" /> Sửa
              </button>
              <button type="button" disabled={acting} onClick={submit} className="h-9 px-3 bg-orange-600 text-white rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                <Send className="h-4 w-4" /> Gửi Mua hàng
              </button>
            </>
          )}
          {next.map((st) => (
            <button
              key={st}
              type="button"
              disabled={acting}
              onClick={() => changeStatus(st)}
              className={`h-9 px-3 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 ${st === 'cancelled' ? 'border text-red-600' : 'bg-orange-50 text-orange-800 border border-orange-200'}`}
            >
              → {PO_STATUS[st]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 space-y-1 text-sm">
          <div className="text-xs text-gray-400 uppercase font-medium">Khách hàng</div>
          <div className="font-medium">{order.customer_name || '—'}</div>
          <div className="text-gray-500">{order.customer_phone || ''}</div>
          <div className="text-gray-500 text-xs">{order.customer_address || ''}</div>
          {order.lead_id && (
            <button type="button" onClick={() => navigate(`/crm/leads/${order.lead_id}`)} className="text-xs text-orange-600 hover:underline cursor-pointer mt-1">
              Mở deal {order.lead?.code || ''} →
            </button>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4 space-y-1 text-sm">
          <div className="text-xs text-gray-400 uppercase font-medium">Nhà cung cấp</div>
          <div className="font-medium">{order.supplier?.name || '—'}</div>
          <div className="text-gray-500 text-xs">{order.supplier?.contact_phone || ''}</div>
        </div>
        <div className="bg-white rounded-xl border p-4 space-y-1 text-sm">
          <div className="text-xs text-gray-400 uppercase font-medium">Ngày</div>
          <div>Đặt: <strong>{order.order_date || '—'}</strong></div>
          <div>Dự kiến nhận: <strong>{order.expected_date || '—'}</strong></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500 uppercase bg-gray-50">
              <th className="py-3 px-4">Sản phẩm</th>
              <th className="py-3 px-4">ĐVT</th>
              <th className="py-3 px-4 text-right">SL</th>
              <th className="py-3 px-4 text-right">Đơn giá</th>
              <th className="py-3 px-4 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {it.image_url
                      ? <img src={it.image_url} alt="" className="h-10 w-10 rounded object-contain bg-gray-50 border" />
                      : <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center"><Package className="h-4 w-4 text-gray-400" /></div>}
                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-[10px] text-gray-400">{[it.brand_name, it.sku].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-500">{it.unit}</td>
                <td className="py-3 px-4 text-right">{it.quantity}</td>
                <td className="py-3 px-4 text-right">{formatVND(it.unit_price || 0)}</td>
                <td className="py-3 px-4 text-right font-medium">{formatVND(it.amount || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4 flex flex-col items-end gap-1 text-sm border-t">
          <div className="flex gap-8"><span className="text-gray-500">Tạm tính</span><span className="w-28 text-right">{formatVND(order.subtotal || 0)}</span></div>
          <div className="flex gap-8"><span className="text-gray-500">VAT ({order.tax_rate}%)</span><span className="w-28 text-right">{formatVND(order.tax_amount || 0)}</span></div>
          <div className="flex gap-8 text-base font-bold"><span>Tổng</span><span className="w-28 text-right text-orange-600">{formatVND(order.total || 0)}</span></div>
        </div>
      </div>

      {order.notes && (
        <div className="bg-white rounded-xl border p-4 text-sm">
          <div className="text-xs text-gray-400 uppercase font-medium mb-1">Ghi chú</div>
          <p className="whitespace-pre-wrap text-gray-700">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
