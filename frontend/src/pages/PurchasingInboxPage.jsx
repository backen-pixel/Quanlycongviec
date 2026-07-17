import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import { ShoppingBag, Search, Package } from 'lucide-react';

export const PO_STATUS = {
  draft: 'Nháp',
  submitted: 'Đã gửi MH',
  confirmed: 'Xác nhận',
  ordered: 'Đã đặt NCC',
  partial_received: 'Nhận 1 phần',
  received: 'Đã nhận',
  cancelled: 'Đã hủy',
};
export const PO_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-orange-100 text-orange-700',
  confirmed: 'bg-blue-100 text-blue-700',
  ordered: 'bg-indigo-100 text-indigo-700',
  partial_received: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

/** Inbox Lệnh đặt hàng đã gửi sang Mua hàng (+ tùy chọn xem nháp). */
export default function PurchasingInboxPage() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showDraft, setShowDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, [showDraft]);

  const load = async () => {
    setLoading(true);
    try {
      const params = showDraft ? {} : { inbox: 1 };
      const { data } = await api.get('/purchasing/orders', { params });
      setOrders(data || []);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  };

  const filtered = orders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const leadLabel = o.lead?.title || o.lead?.code || '';
      return (
        (o.code || '').toLowerCase().includes(s)
        || (o.title || '').toLowerCase().includes(s)
        || (o.customer_name || '').toLowerCase().includes(s)
        || leadLabel.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const summary = {};
  orders.forEach((o) => { summary[o.status] = (summary[o.status] || 0) + 1; });
  const totalValue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-orange-600" />
            Mua hàng — Inbox
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {orders.length} lệnh · {formatVND(totalValue)}
            {!showDraft && ' · chỉ lệnh đã gửi'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDraft((v) => !v)}
            className={`h-9 px-3 rounded-lg text-sm border cursor-pointer ${showDraft ? 'bg-gray-800 text-white border-gray-800' : 'bg-white hover:bg-gray-50'}`}
          >
            {showDraft ? 'Ẩn nháp' : 'Hiện nháp'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${!statusFilter ? 'bg-orange-600 text-white border-orange-600' : 'hover:bg-gray-50'}`}
        >
          Tất cả ({orders.length})
        </button>
        {Object.entries(PO_STATUS).map(([k, v]) => (summary[k] || 0) > 0 && (
          <button
            key={k}
            type="button"
            onClick={() => setStatusFilter(statusFilter === k ? '' : k)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap ${statusFilter === k ? 'bg-orange-600 text-white border-orange-600' : PO_COLORS[k]}`}
          >
            {v} ({summary[k]})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="relative max-w-sm mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã, deal, KH..."
            className="w-full h-10 pl-10 pr-3 border rounded-lg text-sm"
          />
        </div>
        <div className="overflow-auto rounded-lg border" style={{ maxHeight: 'calc(100vh - 360px)', minHeight: 200 }}>
          <table className="w-full text-sm">
            <thead className="bg-white sticky top-0 z-10 shadow-sm">
              <tr className="border-b text-left text-xs text-gray-600 uppercase">
                <th className="py-3 px-3">Mã</th>
                <th className="py-3 px-3">Deal CRM</th>
                <th className="py-3 px-3">Khách hàng</th>
                <th className="py-3 px-3">NCC</th>
                <th className="py-3 px-3 text-right">Tổng</th>
                <th className="py-3 px-3">Trạng thái</th>
                <th className="py-3 px-3">Ngày</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className="border-b hover:bg-orange-50/50 cursor-pointer"
                  onClick={() => navigate(`/mua-hang/orders/${o.id}`)}
                >
                  <td className="py-3 px-3 font-bold text-orange-600">{o.code}</td>
                  <td className="py-3 px-3">
                    {o.lead_id ? (
                      <button
                        type="button"
                        className="text-left cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/crm/leads/${o.lead_id}`);
                        }}
                      >
                        <div className="font-medium text-orange-700 hover:underline">
                          {o.lead?.title || o.title || 'Deal'}
                        </div>
                        {o.lead?.code && (
                          <div className="text-[10px] text-gray-400">{o.lead.code}</div>
                        )}
                      </button>
                    ) : (
                      <span className="text-gray-400">{o.title || '—'}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-gray-600">{o.customer_name || '—'}</td>
                  <td className="py-3 px-3 text-gray-600">{o.supplier?.name || '—'}</td>
                  <td className="py-3 px-3 text-right font-bold">{formatVND(o.total || 0)}</td>
                  <td className="py-3 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${PO_COLORS[o.status] || ''}`}>
                      {PO_STATUS[o.status] || o.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-500">{formatDate(o.submitted_at || o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Chưa có lệnh đặt hàng</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
