import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import CRMTasksTab from './CRMTasksTab';
import { Plus, Truck, Loader2, ChevronDown, ChevronRight, Package, Factory } from 'lucide-react';

// Internal phase UI removed per request.

export default function ProjectOrdersTab({ projectId, users = [], onChanged = null, logisticsView = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [pushing, setPushing] = useState(null);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState({});
  const [bulkPushing, setBulkPushing] = useState(false);
  const [sxModal, setSxModal] = useState({ open: false, mode: 'single', orderId: null });
  const [sxCompanies, setSxCompanies] = useState([]);
  const [sxCompanyId, setSxCompanyId] = useState('');
  const [sxUsers, setSxUsers] = useState([]);
  const [sxStartDate, setSxStartDate] = useState('');
  const [sxExpectedEndDate, setSxExpectedEndDate] = useState('');
  const [sxAssigneeId, setSxAssigneeId] = useState('');
  const didAutoExpandFirstRef = useRef(false);

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

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } })
      .then((r) => setSxCompanies(r.data?.companies || r.data || []))
      .catch(() => setSxCompanies([]));
  }, []);

  useEffect(() => {
    if (!sxCompanyId) {
      setSxUsers([]);
      return;
    }
    api.get('/users', { params: { company_id: sxCompanyId } })
      .then((r) => setSxUsers(r.data?.users || []))
      .catch(() => setSxUsers([]));
  }, [sxCompanyId]);

  // Mặc định mở đơn đầu tiên để thấy nhiệm vụ ngay
  useEffect(() => {
    if (!orders?.length) return;
    if (didAutoExpandFirstRef.current) return;
    const hasAnyKey = Object.keys(expanded || {}).length > 0;
    if (hasAnyKey) { didAutoExpandFirstRef.current = true; return; }
    setExpanded({ [orders[0].id]: true });
    didAutoExpandFirstRef.current = true;
  }, [orders]);

  const createOrder = async () => {
    if (logisticsView) return;
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


  const pushVc = async (orderId, masterProjectId) => {
    const pid = masterProjectId || projectId;
    if (!confirm('Tạo dự án VC và chuyển deal đơn này sang module Vận chuyển & Lắp đặt?')) return;
    setPushing(orderId);
    setMsg('');
    try {
      const { data } = await api.post(`/projects/${pid}/orders/${orderId}/push-to-logistics`);
      if (data?.already) setMsg('Đơn đã được đẩy VC trước đó.');
      else setMsg(`Đã tạo dự án VC: ${data.logistics_project_code || data.logistics_project_id}`);
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi đẩy VC');
    }
    setPushing(null);
  };

  const toggleSelect = (orderId) => {
    setSelected((s) => ({ ...s, [orderId]: !s[orderId] }));
  };

  const selectedIds = Object.entries(selected).filter(([, v]) => !!v).map(([k]) => k);

  const eligibleForVcIds = selectedIds.filter((id) => {
    const o = (orders || []).find((x) => String(x.id) === String(id));
    if (!o) return false;
    return !!o.fulfillment_lead_id && !o.logistics_project_id && String(o.order_phase || 'draft') === 'ready_logistics';
  });

  const bulkPushVc = async () => {
    if (!eligibleForVcIds.length) return;
    if (!confirm(`Đẩy ${eligibleForVcIds.length} đơn sang VC/LĐ?`)) return;
    setBulkPushing(true);
    setMsg('');
    try {
      const { data } = await api.post(`/projects/${projectId}/orders/push-to-logistics-bulk`, { order_ids: eligibleForVcIds });
      const failed = (data?.results || []).filter((r) => !r.ok);
      if (failed.length) setMsg(`Đã đẩy ${eligibleForVcIds.length - failed.length}/${eligibleForVcIds.length} đơn. ${failed.length} đơn lỗi.`);
      else setMsg(`Đã đẩy ${eligibleForVcIds.length} đơn sang VC/LĐ.`);
      setSelected({});
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi đẩy VC hàng loạt');
    }
    setBulkPushing(false);
  };

  const openSx = (mode, orderId = null) => {
    setSxModal({ open: true, mode, orderId });
    setSxCompanyId('');
    setSxStartDate('');
    setSxExpectedEndDate('');
    setSxAssigneeId('');
  };

  const submitSx = async () => {
    if (!sxCompanyId) return alert('Chọn công ty SX');
    if (!sxStartDate) return alert('Nhập ngày sản xuất');
    setBulkPushing(true);
    setMsg('');
    try {
      const payload = {
        sx_company_id: sxCompanyId,
        sx_start_date: sxStartDate,
        sx_expected_end_date: sxExpectedEndDate || null,
        sx_construction_assignee_id: sxAssigneeId || null,
      };
      if (sxModal.mode === 'single' && sxModal.orderId) {
        await api.post(`/projects/${projectId}/orders/${sxModal.orderId}/push-to-production`, payload);
      } else {
        await api.post(`/projects/${projectId}/orders/push-to-production-bulk`, { ...payload, order_ids: selectedIds });
      }
      setSxModal({ open: false, mode: 'single', orderId: null });
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi chuyển SX');
    }
    setBulkPushing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 className="h-6 w-6 animate-spin" /> Đang tải đơn hàng…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Modal
        open={sxModal.open}
        title={sxModal.mode === 'bulk' ? `Chuyển SX (${selectedIds.length} đơn)` : 'Chuyển SX'}
        onClose={() => setSxModal({ open: false, mode: 'single', orderId: null })}
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-600 mb-1">Công ty SX</p>
            <select
              className="h-10 w-full px-3 border border-gray-300 rounded-lg text-sm"
              value={sxCompanyId}
              onChange={(e) => setSxCompanyId(e.target.value)}
            >
              <option value="">-- Chọn công ty --</option>
              {sxCompanies.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.short_name || c.id}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-600 mb-1">Ngày sản xuất</p>
              <input
                type="date"
                className="h-10 w-full px-3 border border-gray-300 rounded-lg text-sm"
                value={sxStartDate}
                onChange={(e) => setSxStartDate(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Ngày dự kiến hoàn thành</p>
              <input
                type="date"
                className="h-10 w-full px-3 border border-gray-300 rounded-lg text-sm"
                value={sxExpectedEndDate}
                onChange={(e) => setSxExpectedEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Người dự kiến thi công</p>
            <select
              className="h-10 w-full px-3 border border-gray-300 rounded-lg text-sm"
              value={sxAssigneeId}
              onChange={(e) => setSxAssigneeId(e.target.value)}
              disabled={!sxCompanyId}
            >
              <option value="">-- Chọn nhân sự --</option>
              {!sxCompanyId && <option disabled value="">Chọn công ty để thấy nhân sự</option>}
              {sxUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="h-10 px-4 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              onClick={() => setSxModal({ open: false, mode: 'single', orderId: null })}
            >
              Hủy
            </button>
            <button
              type="button"
              className="h-10 px-4 rounded-lg bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-50 flex items-center gap-2"
              onClick={submitSx}
              disabled={bulkPushing}
            >
              {bulkPushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Factory className="h-4 w-4" />}
              Xác nhận chuyển SX
            </button>
          </div>
        </div>
      </Modal>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{logisticsView ? 'Đơn hàng trên dự án VC' : 'Đơn hàng theo dự án'}</h3>
          <p className="text-xs text-gray-600 mt-1 max-w-xl">
            {logisticsView
              ? 'Các đơn đã bàn giao từ Sản xuất sang Vận chuyển. Cập nhật tiến độ đơn và nhiệm vụ deal con; thêm đơn mới thực hiện trên dự án Sản xuất.'
              : 'Mỗi đơn có pipeline riêng và bộ nhiệm vụ CRM (deal con). Khi sẵn sàng, đẩy từng đơn sang VC — hệ thống tạo dự án con trên Kanban vận chuyển và gắn deal đó với dự án VC.'}
          </p>
        </div>
        {!logisticsView && (
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
            {eligibleForVcIds.length > 0 && (
              <button
                type="button"
                onClick={bulkPushVc}
                disabled={bulkPushing}
                className="h-10 px-4 bg-orange-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-orange-700 disabled:opacity-50"
                title="Đẩy nhiều đơn sang VC/LĐ"
              >
                {bulkPushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Đẩy VC ({eligibleForVcIds.length})
              </button>
            )}
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => openSx('bulk')}
                disabled={bulkPushing}
                className="h-10 px-4 bg-teal-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-teal-800 disabled:opacity-50"
                title="Chuyển nhiều đơn sang SX"
              >
                {bulkPushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Factory className="h-4 w-4" />}
                Chuyển SX ({selectedIds.length})
              </button>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div className="text-sm text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-2">{msg}</div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl">
          <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
          {logisticsView
            ? 'Chưa có đơn nào bàn giao cho dự án VC này.'
            : 'Chưa có đơn hàng con. Thêm đơn để tách pipeline và nhiệm vụ theo từng đợt giao.'}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const open = !!expanded[o.id];
            const canPushVc = !!o.fulfillment_lead_id && !o.logistics_project_id && String(o.order_phase || 'draft') === 'ready_logistics';
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
                    {!logisticsView && (
                      <label className="inline-flex items-center gap-2 text-xs text-gray-600 select-none">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          checked={!!selected[o.id]}
                          onChange={() => toggleSelect(o.id)}
                          disabled={!!o.logistics_project_id || !o.fulfillment_lead_id || String(o.order_phase || 'draft') !== 'ready_logistics'}
                          title={
                            o.logistics_project_id
                              ? 'Đơn đã có dự án VC'
                              : !o.fulfillment_lead_id
                                ? 'Đơn chưa có deal nhiệm vụ'
                                : String(o.order_phase || 'draft') !== 'ready_logistics'
                                  ? 'Chưa thể đẩy VC: cần chuyển SX và đưa đơn về "Chờ VC"'
                                  : 'Chọn để đẩy VC hàng loạt'
                          }
                        />
                        Chọn
                      </label>
                    )}
                    {!o.logistics_project_id && (
                      <button
                        type="button"
                        onClick={() => pushVc(o.id, o.project_id)}
                        disabled={pushing === o.id || !canPushVc}
                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {pushing === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                        Đẩy VC / LĐ
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openSx('single', o.id)}
                      disabled={!o.fulfillment_lead_id}
                      className="h-8 px-3 rounded-lg text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1.5"
                      title="Chuyển đơn sang SX"
                    >
                      <Factory className="h-3.5 w-3.5" />
                      Chuyển SX
                    </button>
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

// Modal (inline)
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white border border-gray-200 shadow-xl p-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-900">{title}</div>
          <button className="text-sm text-gray-500 hover:text-gray-800" onClick={onClose}>Đóng</button>
        </div>
        {children}
      </div>
    </div>
  );
}
