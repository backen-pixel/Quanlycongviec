import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Factory, Truck, Package, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus } from 'lucide-react';
import { formatVND } from '../lib/utils';
import api from '../lib/api';
import CRMTasksTab from './CRMTasksTab';
import ProjectOrdersTab from './ProjectOrdersTab';

/**
 * Tab Công việc gộp: nhiệm vụ deal tổng + đơn 1, 2… (ProjectOrdersTab).
 * Chưa có dự án: cùng UI với tab đơn trên dự án — "Thêm đơn" tạo dự án tự động nếu cần, rồi tạo bộ nhiệm vụ từng lượt (fulfillment).
 */
export default function LeadDealWorkTab({
  dealLeadId,
  projectId,
  useOrderTasks = false,
  users = [],
  orders = [],
  ordersLoading = false,
  onOrdersRefresh = null,
  onProjectRefresh = null,
}) {
  const [bootstrapProjectId, setBootstrapProjectId] = useState(null);
  const effectiveProjectId = projectId || bootstrapProjectId;

  useEffect(() => {
    if (projectId) setBootstrapProjectId(null);
  }, [projectId]);

  const afterProjectChange = useCallback(() => {
    onProjectRefresh?.();
    onOrdersRefresh?.();
  }, [onProjectRefresh, onOrdersRefresh]);

  const onProjectCreated = useCallback(
    (pid) => {
      if (pid) setBootstrapProjectId(String(pid));
      onProjectRefresh?.();
      onOrdersRefresh?.();
    },
    [onProjectRefresh, onOrdersRefresh],
  );

  const orphanCrm = (orders || []).filter((o) => !o.project_id);

  return (
    <div className="space-y-8">
      {!useOrderTasks && (
        <section>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Nhiệm vụ deal (tổng)</p>
          <p className="text-xs text-gray-500 mb-3 max-w-2xl">
            Pipeline tư vấn / báo giá / hợp đồng ở mức <strong>deal cơ sở</strong>. Từng lượt đặt hàng (Đơn 1, 2, …) mỗi bộ
            nhiệm vụ thực hiện ở khối bên dưới; lần đầu sẽ tạo dự án nếu deal chưa có.
          </p>
          <CRMTasksTab leadId={dealLeadId} leadType="deal" users={users} />
        </section>
      )}

      <section>
        {effectiveProjectId ? (
          <>
            <ProjectOrdersTab
              projectId={effectiveProjectId}
              users={users}
              onChanged={afterProjectChange}
              logisticsView={false}
            />
            {orphanCrm.length > 0 && (
              <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Có {orphanCrm.length} đơn tạo từ màn <strong>ĐH CRM</strong> chưa gắn mã dự án này — vẫn theo dõi tại{' '}
                <Link to={`/crm/orders?lead_id=${encodeURIComponent(dealLeadId)}`} className="text-blue-700 font-medium hover:underline">
                  danh sách ĐH CRM
                </Link>
                . Đơn từng lượt trên dự án ở khối trên.
              </p>
            )}
          </>
        ) : (
          <EnsureProjectAndOrders
            dealLeadId={dealLeadId}
            ordersCount={Array.isArray(orders) ? orders.length : 0}
            ordersLoading={ordersLoading}
            orders={orders}
            users={users}
            onProjectCreated={onProjectCreated}
          />
        )}
      </section>
    </div>
  );
}

/**
 * Cùng layout / hành vi "Thêm đơn" với {@link ProjectOrdersTab}; lần đầu: POST tạo dự án từ deal + POST tạo đơn con.
 */
function EnsureProjectAndOrders({ dealLeadId, ordersCount, ordersLoading, orders, users, onProjectCreated }) {
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');

  const nextDefaultLabel = () => `Đơn ${ordersCount + 1}`;

  const ensureProjectId = async () => {
    try {
      const { data } = await api.post(`/crm/deals/${encodeURIComponent(dealLeadId)}/auto-create-project`);
      if (data?.project_id) return String(data.project_id);
    } catch (e) {
      const pid = e.response?.data?.project_id;
      if (pid) return String(pid);
      throw e;
    }
    throw new Error('Không lấy được dự án từ deal');
  };

  const createOrder = async () => {
    const label = (newLabel.trim() || nextDefaultLabel()).trim();
    if (!label) return;
    setCreating(true);
    setMsg('');
    try {
      const pid = await ensureProjectId();
      await api.post(`/projects/${encodeURIComponent(pid)}/orders`, { display_label: label });
      setNewLabel('');
      onProjectCreated(pid);
    } catch (e) {
      setMsg(e.response?.data?.error || e.message || 'Lỗi tạo dự án/đơn hàng');
    } finally {
      setCreating(false);
    }
  };

  if (ordersLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        Đang tải đơn hàng…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
        <div className="min-w-0" />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={nextDefaultLabel()}
            className="h-10 px-3 border border-gray-300 rounded-lg text-sm min-w-[160px] bg-white"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createOrder())}
          />
          <button
            type="button"
            onClick={createOrder}
            disabled={creating}
            className="h-10 px-4 bg-amber-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-amber-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Thêm đơn
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{msg}</div>}

      {Array.isArray(orders) && orders.some((o) => !o.project_id) && (
        <CrmOrphanOrderNotes orders={orders} users={users} />
      )}
    </div>
  );
}

/** Bản ghi từ màn ĐH CRM (chưa gắn dự án) — mở nhiệm vụ / link chi tiết. */
function CrmOrphanOrderNotes({ orders, users }) {
  const list = (orders || []).filter((o) => !o.project_id);
  const [openId, setOpenId] = useState(() => (list[0]?.id ? list[0].id : null));
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
        Đơn tạo từ màn ĐH CRM cùng deal (chưa gắn mã dự án) — bấm để mở nhiệm vụ
      </p>
      {list.map((o) => {
        const isOpen = openId === o.id;
        return (
          <div key={o.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 justify-between bg-gray-50/80">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : o.id)}
                className="flex items-center gap-2 min-w-0 text-left"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {o.code}
                    {o.title ? ` — ${o.title}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {formatVND(o.total || 0)}
                    {o.status ? ` · ${o.status}` : ''}
                    <span className="ml-1 text-amber-700">· chưa gắn dự án SX</span>
                  </p>
                </div>
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                {o.project_id && (
                  <Link
                    to={`/sx/projects/${o.project_id}`}
                    className="h-7 px-2.5 inline-flex items-center gap-1 rounded-lg text-[11px] font-medium bg-teal-100 text-teal-800 hover:bg-teal-200"
                  >
                    <Factory className="h-3.5 w-3.5" />
                    SX
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                )}
                {o.logistics_project_id && (
                  <Link
                    to={`/vc/projects/${o.logistics_project_id}`}
                    className="h-7 px-2.5 inline-flex items-center gap-1 rounded-lg text-[11px] font-medium bg-orange-100 text-orange-800 hover:bg-orange-200"
                  >
                    <Truck className="h-3.5 w-3.5" />
                    VC
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                )}
                <Link
                  to={`/crm/orders/${o.id}`}
                  className="h-7 px-2.5 inline-flex items-center gap-1 rounded-lg text-[11px] font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                >
                  Chi tiết &amp; CRUD
                </Link>
              </div>
            </div>
            {isOpen && (
              <div className="p-3 border-t border-gray-100 space-y-3">
                {o.fulfillment_lead_id ? (
                  <>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">Nhiệm vụ theo đơn (deal thực hiện)</p>
                    <CRMTasksTab
                      key={o.fulfillment_lead_id}
                      leadId={o.fulfillment_lead_id}
                      leadType="deal"
                      users={users}
                    />
                  </>
                ) : (
                  <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                    Đơn chưa tách deal nhiệm vụ. Chỉnh tại màn <Link to={`/crm/orders/${o.id}`} className="font-medium text-amber-900 hover:underline">chi tiết đơn</Link>.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
