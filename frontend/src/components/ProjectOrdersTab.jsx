import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import CRMTasksTab from './CRMTasksTab';
import {
  Truck, Loader2, ChevronDown, ChevronRight, Package, Factory, Trash2,
  FileText, ShoppingCart, Receipt, ExternalLink, RefreshCw,
} from 'lucide-react';

const Q_STATUS = { draft: 'Nháp', sent: 'Đã gửi', accepted: 'Đã chấp nhận', rejected: 'Từ chối', converted: '→ Đơn hàng' };
const O_STATUS = { draft: 'Nháp', confirmed: 'Xác nhận', processing: 'Đang SX', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
const PAY_STATUS = { unpaid: 'Chưa TT', partial: 'TT 1 phần', paid: 'Đã TT' };

function badge(map, status, tone = 'gray') {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-900',
    blue: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tones[tone] || tones.gray}`}>
      {map[status] || status || '—'}
    </span>
  );
}

function payTone(s) {
  if (s === 'paid') return 'green';
  if (s === 'partial') return 'amber';
  if (s === 'unpaid') return 'red';
  return 'gray';
}

function CommercialDocsBlock({ cashflow, loading, onReload }) {
  const quotations = cashflow?.quotations || [];
  const orders = cashflow?.orders || [];
  const invoices = cashflow?.invoices || [];
  const payments = cashflow?.payments || [];
  const s = cashflow?.summary;

  if (loading && !cashflow) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải báo giá / đơn / hóa đơn…
      </div>
    );
  }

  const empty = !quotations.length && !orders.length && !invoices.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-blue-700" />
            Báo giá · Đơn hàng · Hóa đơn
          </h3>
          <p className="text-xs text-gray-600 mt-1 max-w-2xl">
            Chứng từ CRM gắn dự án hoặc deal liên kết (kể cả multi dự án). Mở chi tiết để xem dòng hàng / thanh toán.
          </p>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="h-9 px-3 border border-blue-200 bg-white rounded-lg text-sm flex items-center gap-1.5 hover:bg-blue-50 shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Làm mới
        </button>
      </div>

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-sky-800">Báo giá</p>
            <p className="text-sm font-extrabold text-sky-950 tabular-nums">{formatVND(s.quotations?.total_sum || 0)}</p>
            <p className="text-[10px] text-sky-700">{s.quotations?.count || 0} BG · cọc {formatVND(s.quotations?.deposits_sum || 0)}</p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-indigo-800">Đơn hàng</p>
            <p className="text-sm font-extrabold text-indigo-950 tabular-nums">{formatVND(s.orders?.total_sum || 0)}</p>
            <p className="text-[10px] text-indigo-700">{s.orders?.count || 0} ĐH · đã thu {formatVND(s.orders?.paid_sum || 0)}</p>
          </div>
          <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-violet-800">Hóa đơn</p>
            <p className="text-sm font-extrabold text-violet-950 tabular-nums">{formatVND(s.invoices?.total_sum || 0)}</p>
            <p className="text-[10px] text-violet-700">{s.invoices?.count || 0} HĐ · đã thu {formatVND(s.invoices?.paid_sum || 0)}</p>
          </div>
          <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-emerald-900">Còn phải thu</p>
            <p className="text-sm font-extrabold text-emerald-950 tabular-nums">{formatVND(s.remaining_to_collect || 0)}</p>
            <p className="text-[10px] text-emerald-800">Lịch sử TT: {formatVND(s.payments_recorded_sum || 0)} ({payments.length} lần)</p>
          </div>
        </div>
      )}

      {empty ? (
        <div className="text-center py-10 text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl bg-white">
          <Package className="h-9 w-9 mx-auto mb-2 text-gray-300" />
          Chưa có báo giá, đơn hàng hoặc hóa đơn gắn dự án / deal.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <DocTable
            title="Báo giá"
            icon={FileText}
            tone="sky"
            rows={quotations}
            empty="Chưa có báo giá"
            href={(r) => `/crm/quotations/${r.id}`}
            cols={[
              { key: 'code', label: 'Mã', className: 'font-bold text-sky-800' },
              { key: 'title', label: 'Tiêu đề' },
              {
                key: 'total',
                label: 'Tổng',
                align: 'right',
                render: (r) => <span className="font-semibold tabular-nums">{formatVND(r.total || 0)}</span>,
              },
              {
                key: 'status',
                label: 'TT',
                render: (r) => badge(Q_STATUS, r.status, r.status === 'accepted' || r.status === 'converted' ? 'green' : r.status === 'rejected' ? 'red' : 'gray'),
              },
              {
                key: 'deposit',
                label: 'Cọc',
                align: 'right',
                render: (r) => (Number(r.deposit_amount) > 0
                  ? (
                    <span className="text-[11px] tabular-nums text-amber-900">
                      {formatVND(r.deposit_amount)}
                      {r.deposit_received === true ? ' ✓' : r.deposit_received === false ? ' …' : ''}
                    </span>
                  )
                  : <span className="text-gray-300">—</span>),
              },
              {
                key: 'date',
                label: 'Ngày',
                render: (r) => <span className="text-[11px] text-gray-500">{formatDate(r.created_at)}</span>,
              },
            ]}
          />
          <DocTable
            title="Đơn hàng CRM"
            icon={ShoppingCart}
            tone="indigo"
            rows={orders}
            empty="Chưa có đơn hàng"
            href={(r) => `/crm/orders/${r.id}`}
            cols={[
              { key: 'code', label: 'Mã', className: 'font-bold text-indigo-800' },
              {
                key: 'title',
                label: 'Tiêu đề',
                render: (r) => r.display_label || r.title || '—',
              },
              {
                key: 'total',
                label: 'Tổng',
                align: 'right',
                render: (r) => <span className="font-semibold tabular-nums">{formatVND(r.total || 0)}</span>,
              },
              {
                key: 'paid',
                label: 'Đã thu',
                align: 'right',
                render: (r) => <span className="text-[11px] text-emerald-700 tabular-nums">{formatVND(r.paid_amount || 0)}</span>,
              },
              {
                key: 'status',
                label: 'TT',
                render: (r) => badge(O_STATUS, r.status, r.status === 'delivered' ? 'green' : r.status === 'cancelled' ? 'red' : 'blue'),
              },
              {
                key: 'pay',
                label: 'Thanh toán',
                render: (r) => badge(PAY_STATUS, r.payment_status, payTone(r.payment_status)),
              },
            ]}
          />
          <DocTable
            title="Hóa đơn"
            icon={Receipt}
            tone="violet"
            rows={invoices}
            empty="Chưa có hóa đơn"
            href={(r) => `/crm/invoices/${r.id}`}
            cols={[
              { key: 'code', label: 'Mã', className: 'font-bold text-violet-800' },
              { key: 'title', label: 'Tiêu đề' },
              {
                key: 'total',
                label: 'Tổng',
                align: 'right',
                render: (r) => <span className="font-semibold tabular-nums">{formatVND(r.total || 0)}</span>,
              },
              {
                key: 'paid',
                label: 'Đã thu',
                align: 'right',
                render: (r) => <span className="text-[11px] text-emerald-700 tabular-nums">{formatVND(r.paid_amount || 0)}</span>,
              },
              {
                key: 'pay',
                label: 'Thanh toán',
                render: (r) => badge(PAY_STATUS, r.payment_status, payTone(r.payment_status)),
              },
              {
                key: 'date',
                label: 'Ngày HĐ',
                render: (r) => <span className="text-[11px] text-gray-500">{formatDate(r.invoice_date || r.created_at)}</span>,
              },
            ]}
          />
        </div>
      )}

      {payments.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b bg-emerald-50 flex items-center justify-between">
            <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Lịch sử thu tiền ({payments.length})</h4>
          </div>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-[10px] uppercase text-gray-500">
                <tr className="border-b text-left">
                  <th className="py-1.5 px-3">Ngày</th>
                  <th className="py-1.5 px-3">Số tiền</th>
                  <th className="py-1.5 px-3">PT</th>
                  <th className="py-1.5 px-3">Ghi chú</th>
                  <th className="py-1.5 px-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-emerald-50/40">
                    <td className="py-1.5 px-3 text-xs text-gray-600">{formatDate(p.payment_date || p.created_at)}</td>
                    <td className="py-1.5 px-3 font-semibold text-emerald-800 tabular-nums">{formatVND(p.amount || 0)}</td>
                    <td className="py-1.5 px-3 text-xs text-gray-600">{p.payment_method || '—'}</td>
                    <td className="py-1.5 px-3 text-xs text-gray-500 truncate max-w-[12rem]">
                      {[p.reference_number, p.notes].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {p.invoice_id && (
                        <Link to={`/crm/invoices/${p.invoice_id}`} className="text-[11px] text-blue-600 hover:underline">HĐ</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DocTable({ title, icon: Icon, tone, rows, empty, href, cols }) {
  const head =
    tone === 'sky' ? 'bg-sky-50 text-sky-950 border-sky-100'
      : tone === 'indigo' ? 'bg-indigo-50 text-indigo-950 border-indigo-100'
        : 'bg-violet-50 text-violet-950 border-violet-100';

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col min-h-[12rem]">
      <div className={`px-3 py-2 border-b flex items-center justify-between ${head}`}>
        <h4 className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {title}
        </h4>
        <span className="text-[10px] font-bold bg-white/70 px-1.5 py-0.5 rounded-full">{rows.length}</span>
      </div>
      {!rows.length ? (
        <p className="text-xs text-gray-400 text-center py-8 px-3">{empty}</p>
      ) : (
        <div className="overflow-auto flex-1 max-h-[min(360px,45vh)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr className="text-left text-[10px] text-gray-500 uppercase border-b">
                {cols.map((c) => (
                  <th key={c.key} className={`py-1.5 px-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
                ))}
                <th className="py-1.5 px-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                  {cols.map((c) => (
                    <td key={c.key} className={`py-2 px-2 ${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}>
                      {c.render ? c.render(r) : (r[c.key] || '—')}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right">
                    <Link to={href(r)} className="inline-flex text-blue-600 hover:text-blue-800" title="Mở">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProjectOrdersTab({
  projectId,
  users = [],
  onChanged = null,
  logisticsView = false,
  taskScope = 'crm',
  onTaskArtifactsSynced = null,
  onCountsChange = null,
}) {
  const [orders, setOrders] = useState([]);
  const [cashflow, setCashflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cashLoading, setCashLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [pushing, setPushing] = useState(null);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState({});
  const [bulkPushing, setBulkPushing] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [sxModal, setSxModal] = useState({ open: false, mode: 'single', orderId: null });
  const [sxCompanies, setSxCompanies] = useState([]);
  const [sxCompanyId, setSxCompanyId] = useState('');
  const [sxUsers, setSxUsers] = useState([]);
  const [sxStartDate, setSxStartDate] = useState('');
  const [sxExpectedEndDate, setSxExpectedEndDate] = useState('');
  const [sxAssigneeId, setSxAssigneeId] = useState('');
  const didAutoExpandFirstRef = useRef(false);

  const notifyCounts = useCallback((fulfillmentOrders, cf) => {
    if (!onCountsChange) return;
    const q = (cf?.quotations || []).length;
    const o = (cf?.orders || []).length;
    const i = (cf?.invoices || []).length;
    onCountsChange({
      commercial: q + o + i,
      fulfillment: (fulfillmentOrders || []).length,
      total: q + o + i || (fulfillmentOrders || []).length,
    });
  }, [onCountsChange]);

  const loadCashflow = useCallback(async () => {
    setCashLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/cashflow`);
      setCashflow(data);
      return data;
    } catch {
      setCashflow(null);
      return null;
    } finally {
      setCashLoading(false);
    }
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg('');
    try {
      const [{ data }, cf] = await Promise.all([
        api.get(`/projects/${projectId}/orders`),
        loadCashflow(),
      ]);
      const list = data.orders || [];
      setOrders(list);
      notifyCounts(list, cf);
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi tải đơn');
    }
    setLoading(false);
  }, [projectId, loadCashflow, notifyCounts]);

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

  useEffect(() => {
    if (!orders?.length) return;
    if (didAutoExpandFirstRef.current) return;
    const hasAnyKey = Object.keys(expanded || {}).length > 0;
    if (hasAnyKey) { didAutoExpandFirstRef.current = true; return; }
    setExpanded({ [orders[0].id]: true });
    didAutoExpandFirstRef.current = true;
  }, [orders]);

  const pushVc = async (orderId, masterProjectId) => {
    const pid = masterProjectId || projectId;
    if (!confirm('Tạo dự án VC và chuyển deal đơn này sang module Lắp đặt?')) return;
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
    if (!confirm(`Đẩy ${eligibleForVcIds.length} đơn sang VC?`)) return;
    setBulkPushing(true);
    setMsg('');
    try {
      const { data } = await api.post(`/projects/${projectId}/orders/push-to-logistics-bulk`, { order_ids: eligibleForVcIds });
      const failed = (data?.results || []).filter((r) => !r.ok);
      if (failed.length) setMsg(`Đã đẩy ${eligibleForVcIds.length - failed.length}/${eligibleForVcIds.length} đơn. ${failed.length} đơn lỗi.`);
      else setMsg(`Đã đẩy ${eligibleForVcIds.length} đơn sang VC.`);
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

  const deleteOrder = async (orderId, orderLabel) => {
    if (!orderId || deletingOrderId) return;
    const ok = window.confirm(`Xóa đơn "${orderLabel || '—'}"?\n\nSẽ xóa cả deal con + nhiệm vụ của đơn (nếu có).\nKhông thể hoàn tác.`);
    if (!ok) return;
    setDeletingOrderId(orderId);
    setMsg('');
    try {
      await api.delete(`/projects/${projectId}/orders/${orderId}`);
      setMsg('Đã xóa đơn.');
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi xóa đơn');
    }
    setDeletingOrderId(null);
  };

  if (loading && cashLoading && !cashflow && !orders.length) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 className="h-6 w-6 animate-spin" /> Đang tải đơn hàng…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CommercialDocsBlock
        cashflow={cashflow}
        loading={cashLoading}
        onReload={async () => {
          const cf = await loadCashflow();
          notifyCounts(orders, cf);
        }}
      />

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
          <h3 className="text-sm font-bold text-gray-900">{logisticsView ? 'Đơn đợt giao (VC)' : 'Đơn đợt giao / đẩy SX–VC'}</h3>
          <p className="text-xs text-gray-600 mt-1 max-w-xl">
            {logisticsView
              ? 'Các đơn đã bàn giao từ Sản xuất sang Lắp đặt. Cập nhật tiến độ đơn và nhiệm vụ deal con.'
              : 'Đơn con theo đợt (nếu có): pipeline + nhiệm vụ CRM, chuyển SX / đẩy VC. Khác với đơn hàng CRM ở trên.'}
          </p>
        </div>
        {!logisticsView && (
          <div className="flex flex-wrap items-center gap-2">
            {eligibleForVcIds.length > 0 && (
              <button
                type="button"
                onClick={bulkPushVc}
                disabled={bulkPushing}
                className="h-10 px-4 bg-orange-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-orange-700 disabled:opacity-50"
                title="Đẩy nhiều đơn sang VC"
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
        <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl">
          <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          {logisticsView
            ? 'Chưa có đơn nào bàn giao cho dự án VC này.'
            : 'Không có đơn đợt giao riêng — xem báo giá / đơn CRM / hóa đơn ở khối phía trên.'}
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
                    {!logisticsView && (
                      <button
                        type="button"
                        onClick={() => deleteOrder(o.id, o.display_label || o.title || o.code)}
                        disabled={deletingOrderId === o.id || bulkPushing || pushing === o.id}
                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 flex items-center gap-1.5"
                        title="Xóa đơn"
                      >
                        {deletingOrderId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Xóa đơn
                      </button>
                    )}
                  </div>
                </div>

                {open && o.fulfillment_lead_id && (
                  <div className="p-4 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Nhiệm vụ (deal đơn)</p>
                    <CRMTasksTab
                      leadId={o.fulfillment_lead_id}
                      leadType="deal"
                      users={users}
                      taskScope={taskScope}
                      onArtifactsSynced={onTaskArtifactsSynced}
                      refreshKey={String(o.fulfillment_lead_id)}
                      linkedProjectId={projectId || null}
                    />
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
