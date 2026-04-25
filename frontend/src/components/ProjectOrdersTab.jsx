import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import CRMTasksTab from './CRMTasksTab';
import { Plus, Truck, Loader2, ChevronDown, ChevronRight, Package } from 'lucide-react';

const PHASES = [
  { id: 'draft', label: 'Nháp' },
  { id: 'confirmed', label: 'Xác nhận' },
  { id: 'in_production', label: 'SX' },
  { id: 'ready_logistics', label: 'Chờ VC' },
  { id: 'in_logistics', label: 'VC/LĐ' },
  { id: 'completed', label: 'Xong' },
];

export default function ProjectOrdersTab({ projectId, users = [], onChanged = null }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [pushing, setPushing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMsg('');
    try {
      const { data } = await api.get(`/projects/${projectId}/orders`);
      setOrders(data.orders || []);
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi tải đơn');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const createOrder = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setCreating(true);
    setMsg('');
    try {
      await api.post(`/projects/${projectId}/orders`, { display_label: label });
      setNewLabel('');
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi tạo đơn');
    }
    setCreating(false);
  };

  const setPhase = async (orderId, order_phase) => {
    setMsg('');
    try {
      await api.put(`/projects/${projectId}/orders/${orderId}`, { order_phase });
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi cập nhật');
    }
  };

  const pushVc = async (orderId) => {
    if (!confirm('Tạo dự án VC và chuyển deal đơn này sang module Vận chuyển & Lắp đặt?')) return;
    setPushing(orderId);
    setMsg('');
    try {
      const { data } = await api.post(`/projects/${projectId}/orders/${orderId}/push-to-logistics`);
      if (data?.already) setMsg('Đơn đã được đẩy VC trước đó.');
      else setMsg(`Đã tạo dự án VC: ${data.logistics_project_code || data.logistics_project_id}`);
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi đẩy VC');
    }
    setPushing(null);
  };

  const phaseIndex = (p) => PHASES.findIndex((x) => x.id === p);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 className="h-6 w-6 animate-spin" /> Đang tải đơn hàng…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Đơn hàng theo dự án</h3>
          <p className="text-xs text-gray-600 mt-1 max-w-xl">
            Mỗi đơn có pipeline riêng và bộ nhiệm vụ CRM (deal con). Khi sẵn sàng, đẩy từng đơn sang VC — hệ thống tạo dự án con trên Kanban vận chuyển và gắn deal đó với dự án VC.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Tên đơn (vd: Đơn 1)"
            className="h-10 px-3 border border-gray-300 rounded-lg text-sm min-w-[160px]"
          />
          <button
            type="button"
            onClick={createOrder}
            disabled={creating || !newLabel.trim()}
            className="h-10 px-4 bg-amber-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-amber-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Thêm đơn
          </button>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-2">{msg}</div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl">
          <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
          Chưa có đơn hàng con. Thêm đơn để tách pipeline và nhiệm vụ theo từng đợt giao.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const open = !!expanded[o.id];
            const idx = phaseIndex(o.order_phase || 'draft');
            return (
              <div key={o.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="px-4 py-3 flex flex-wrap items-start gap-3 justify-between bg-gray-50 border-b">
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [o.id]: !open }))}
                    className="flex items-center gap-2 text-left min-w-0"
                  >
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">
                        {o.display_label || o.title || o.code}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {o.code}
                        {o.logistics_project_id && (
                          <span className="ml-2 text-emerald-700">· Đã có dự án VC</span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    {!o.logistics_project_id && (
                      <button
                        type="button"
                        onClick={() => pushVc(o.id)}
                        disabled={pushing === o.id || !o.fulfillment_lead_id}
                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {pushing === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                        Đẩy VC / LĐ
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Tiến độ đơn</p>
                  <div className="flex flex-wrap gap-1">
                    {PHASES.map((ph, i) => (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() => setPhase(o.id, ph.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                          i <= idx
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {ph.label}
                      </button>
                    ))}
                  </div>
                </div>

                {open && o.fulfillment_lead_id && (
                  <div className="p-4 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Nhiệm vụ (deal đơn)</p>
                    <CRMTasksTab leadId={o.fulfillment_lead_id} leadType="deal" users={users} />
                  </div>
                )}
                {open && !o.fulfillment_lead_id && (
                  <div className="p-4 text-xs text-amber-800 bg-amber-50">Đơn chưa gắn deal thực hiện — tạo lại đơn sau khi chạy migration DB.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
