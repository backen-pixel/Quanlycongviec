import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { formatVND, formatDate } from '../lib/utils';
import { RefreshCw, Building2, Plus, ExternalLink, AlertTriangle } from 'lucide-react';

const QUICK_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'late', label: 'Trễ giao' },
];

const KIND_BADGE_CLS = {
  PR: 'bg-violet-50 text-violet-700',
  PO: 'bg-blue-50 text-blue-700',
};

const STATUS_BADGE_CLS = {
  draft: 'bg-gray-100 text-gray-600',
  requested: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-blue-50 text-blue-700',
  submitted: 'bg-blue-50 text-blue-700',
  ordered: 'bg-sky-50 text-sky-700',
  partial_received: 'bg-sky-50 text-sky-700',
  received: 'bg-emerald-50 text-emerald-700',
  qc_pass: 'bg-emerald-50 text-emerald-700',
  done: 'bg-emerald-50 text-emerald-700',
  delayed: 'bg-red-50 text-red-700',
  qc_fail: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function PrDetail({ item, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/procurement/requests/${item.id}`)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.id]);

  const advance = async (nextStatus) => {
    setSaving(true);
    try {
      await api.put(`/procurement/requests/${item.id}`, { status: nextStatus });
      await onChanged();
    } catch (e) {
      alert(e?.response?.data?.error || 'Không cập nhật được trạng thái');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 text-center py-12">Đang tải...</p>;
  if (!detail) return <p className="text-sm text-gray-400 text-center py-12">Không tải được đề nghị này.</p>;

  return (
    <>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-gray-400">{item.ref} · Đề nghị mua vật tư</p>
          <p className="font-semibold text-gray-900 mt-0.5">{detail.item_name}</p>
          <p className="text-xs text-gray-500 mt-1">
            {detail.project ? `Dự án: ${detail.project.code} · ${detail.project.name}` : 'Chưa gắn dự án'}
            {detail.owner?.full_name ? ` · Người đề nghị: ${detail.owner.full_name}` : ''}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE_CLS[detail.status] || 'bg-gray-100 text-gray-600'}`}>
          {item.status_label}
        </span>
      </div>

      {detail.delay_reason && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Lý do trễ: {detail.delay_reason}
        </div>
      )}
      {detail.next_action && (
        <div className="mt-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          Việc cần làm tiếp: {detail.next_action}
        </div>
      )}
      {detail.description && (
        <p className="text-sm text-gray-600 mt-3">{detail.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <div>
          <p className="text-xs text-gray-400">Nhà cung cấp</p>
          <p className="text-gray-800 mt-0.5">{detail.supplier?.name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Nguồn</p>
          <p className="text-gray-800 mt-0.5">{detail.source_type === 'internal' ? 'Nội bộ' : 'Bên ngoài'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Ngày yêu cầu</p>
          <p className="text-gray-800 mt-0.5">{detail.requested_date ? formatDate(detail.requested_date) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">NCC cam kết giao</p>
          <p className="text-gray-800 mt-0.5">{detail.supplier_committed_date ? formatDate(detail.supplier_committed_date) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Giá dự kiến</p>
          <p className="text-gray-800 mt-0.5">{detail.expected_price != null ? formatVND(detail.expected_price) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Giá thực tế</p>
          <p className="text-gray-800 mt-0.5">{detail.actual_price != null ? formatVND(detail.actual_price) : '—'}</p>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mt-4">
        Hệ thống hiện chưa lưu nhiều báo giá so sánh cho một đề nghị — mỗi đề nghị chỉ gắn 1 nhà cung cấp.
      </p>

      <div className="flex items-center justify-end gap-2 mt-4">
        {detail.status === 'requested' && (
          <button
            type="button"
            onClick={() => advance('confirmed')}
            disabled={saving}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            Duyệt — NCC xác nhận
          </button>
        )}
        {detail.status === 'confirmed' && (
          <button
            type="button"
            onClick={() => advance('received')}
            disabled={saving}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            Đánh dấu đã nhận hàng
          </button>
        )}
      </div>
    </>
  );
}

function PoDetail({ item, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/purchasing/orders/${item.id}`)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.id]);

  const advance = async (action, nextStatus) => {
    setSaving(true);
    try {
      if (action === 'submit') await api.post(`/purchasing/orders/${item.id}/submit`);
      else await api.post(`/purchasing/orders/${item.id}/status`, { status: nextStatus });
      await onChanged();
    } catch (e) {
      alert(e?.response?.data?.error || 'Không cập nhật được trạng thái');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 text-center py-12">Đang tải...</p>;
  if (!detail) return <p className="text-sm text-gray-400 text-center py-12">Không tải được đơn này.</p>;

  return (
    <>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-gray-400">{detail.code} · Đơn mua hàng</p>
          <p className="font-semibold text-gray-900 mt-0.5">{detail.title}</p>
          <p className="text-xs text-gray-500 mt-1">
            NCC: {detail.supplier?.name || '—'}
            {detail.lead ? ` · Deal: ${detail.lead.code || ''} ${detail.lead.title || ''}` : ''}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE_CLS[detail.status] || 'bg-gray-100 text-gray-600'}`}>
          {item.status_label}
        </span>
      </div>

      <div className="overflow-x-auto mt-4">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[46%]" /><col className="w-[14%]" /><col className="w-[10%]" />
            <col className="w-[15%]" /><col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="py-2 font-semibold">Mặt hàng</th>
              <th className="py-2 font-semibold">ĐVT</th>
              <th className="py-2 font-semibold">SL</th>
              <th className="py-2 font-semibold">Đơn giá</th>
              <th className="py-2 font-semibold text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {(detail.items || []).length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-gray-400">Chưa có dòng hàng nào.</td></tr>
            ) : detail.items.map((it) => (
              <tr key={it.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 truncate" title={it.name}>{it.name}</td>
                <td className="py-2 text-gray-600">{it.unit || '—'}</td>
                <td className="py-2 text-gray-600">{it.quantity}</td>
                <td className="py-2 text-gray-600 truncate">{formatVND(it.unit_price)}</td>
                <td className="py-2 text-right font-medium text-gray-800">{formatVND(it.amount ?? (it.quantity * it.unit_price))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 text-sm text-right">
        <p className="text-gray-900 font-bold text-base">Tổng cộng <span className="inline-block w-32">{formatVND(detail.total)}</span></p>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
        <Link
          to={`/mua-hang/orders/${item.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
        >
          Mở đầy đủ <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        {detail.status === 'draft' && (
          <button type="button" onClick={() => advance('submit')} disabled={saving} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">Gửi mua hàng</button>
        )}
        {detail.status === 'submitted' && (
          <button type="button" onClick={() => advance('status', 'confirmed')} disabled={saving} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">Xác nhận</button>
        )}
        {detail.status === 'confirmed' && (
          <button type="button" onClick={() => advance('status', 'ordered')} disabled={saving} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 cursor-pointer">Đã đặt NCC</button>
        )}
        {(detail.status === 'ordered' || detail.status === 'partial_received') && (
          <button type="button" onClick={() => advance('status', 'received')} disabled={saving} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">Đã nhận hàng</button>
        )}
      </div>
    </>
  );
}

export default function PurchasingOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [quickTab, setQuickTab] = useState('all');
  const [selectedKey, setSelectedKey] = useState(null);

  useEffect(() => {
    // Đề nghị/đơn mua hàng gắn với dự án sản xuất, không phải khối CRM — lấy công ty theo phạm vi
    // "purchasing" để không thiếu các công ty thuộc khối Sản xuất riêng (vd Hucabi).
    api.get('/companies', { params: { for_module: 'purchasing' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (canPickCompany && companyId) params.company_id = companyId;
      const res = await api.get('/management/purchasing-overview', { params });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu mua hàng');
    } finally {
      setLoading(false);
    }
  }, [canPickCompany, companyId]);

  useEffect(() => { load(); }, [load]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'tất cả công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  const stages = data?.stages || [];
  const stats = data?.stats || { pending_approval: 0, ordered_value_this_month: 0, shipping: 0, late: 0 };
  const allItems = data?.items || [];

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (stageFilter) list = list.filter((it) => it.stage === stageFilter);
    if (quickTab === 'pending') list = list.filter((it) => it.status === 'requested');
    else if (quickTab === 'shipping') list = list.filter((it) => it.status === 'ordered');
    else if (quickTab === 'late') list = list.filter((it) => it.late);
    return list;
  }, [allItems, stageFilter, quickTab]);

  useEffect(() => {
    if (!filteredItems.some((it) => `${it.kind}-${it.id}` === selectedKey)) {
      const first = filteredItems[0];
      setSelectedKey(first ? `${first.kind}-${first.id}` : null);
    }
  }, [filteredItems, selectedKey]);

  const selectedItem = filteredItems.find((it) => `${it.kind}-${it.id}` === selectedKey) || null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#111827' }}>Mua hàng</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Đề nghị vật tư từ dự án/sản xuất → duyệt → đặt hàng nhà cung cấp, của {companyName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canPickCompany && companies.length > 0 && (
            <div className="relative">
              <Building2 className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <Link
            to="/mua-hang/orders/new"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Tạo đơn mua hàng
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setStageFilter('')}
            className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
              !stageFilter ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Tất cả
          </button>
          {stages.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStageFilter(s.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                stageFilter === s.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stageFilter === s.key ? 'bg-white' : 'bg-blue-400'}`} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Chờ duyệt</p>
          <p className="text-2xl font-bold mt-1.5 text-amber-600">{loading ? '…' : `${stats.pending_approval} đề nghị`}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Đã đặt hàng tháng {new Date().getMonth() + 1}</p>
          <p className="text-2xl font-bold mt-1.5 text-gray-900">{loading ? '…' : formatVND(stats.ordered_value_this_month)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Đang giao</p>
          <p className="text-2xl font-bold mt-1.5 text-sky-600">{loading ? '…' : `${stats.shipping} đơn`}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Trễ giao</p>
          <p className="text-2xl font-bold mt-1.5 text-red-600">{loading ? '…' : `${stats.late} mục`}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 p-2 border-b border-gray-100 overflow-x-auto">
            {QUICK_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setQuickTab(t.key)}
                className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  quickTab === t.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label} · {
                  t.key === 'all' ? allItems.length
                    : t.key === 'pending' ? stats.pending_approval
                      : t.key === 'shipping' ? stats.shipping
                        : stats.late
                }
              </button>
            ))}
          </div>
          <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Đang tải...</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Không có mục nào phù hợp bộ lọc.</p>
            ) : (
              filteredItems.map((it) => {
                const key = `${it.kind}-${it.id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full text-left px-4 py-3 cursor-pointer transition-colors ${
                      selectedKey === key ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 ${KIND_BADGE_CLS[it.kind]}`}>{it.kind}</span>
                        {it.ref} · {it.title}
                      </p>
                      <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[it.status] || 'bg-gray-100 text-gray-600'}`}>
                        {it.status_label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{it.subtitle || it.supplier_name || '—'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className={`text-xs ${it.late ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        {it.late && <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />}
                        {it.date ? formatDate(it.date) : '—'}
                      </p>
                      {it.amount != null && <p className="text-sm font-semibold text-gray-700">{formatVND(it.amount)}</p>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
          {!selectedItem ? (
            <p className="text-sm text-gray-400 text-center py-12">Chọn một mục để xem chi tiết.</p>
          ) : selectedItem.kind === 'PR' ? (
            <PrDetail item={selectedItem} onChanged={load} />
          ) : (
            <PoDetail item={selectedItem} onChanged={load} />
          )}
        </div>
      </div>
    </div>
  );
}
