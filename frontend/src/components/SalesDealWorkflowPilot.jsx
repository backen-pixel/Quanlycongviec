import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderKanban,
  Factory,
  Loader2,
  PackageCheck,
  Ruler,
  ShoppingCart,
  Sparkles,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const PATH_STAGES = {
  full_service: [
    { key: 'deal', name: 'Deal' },
    { key: 'survey', name: 'Khảo sát' },
    { key: 'design', name: 'Thiết kế' },
    { key: 'design_completed', name: 'Sẵn sàng báo giá' },
    { key: 'quotation', name: 'Báo giá' },
    { key: 'negotiation', name: 'Thương lượng' },
    { key: 'order_ready', name: 'Sẵn sàng đặt hàng' },
    { key: 'order', name: 'Đơn hàng' },
    { key: 'project', name: 'Dự án' },
    { key: 'production', name: 'Sản xuất' },
    { key: 'delivery_ready', name: 'Sẵn sàng giao' },
    { key: 'installation', name: 'VC / Lắp đặt' },
    { key: 'completed', name: 'Đã bàn giao' },
  ],
  customer_design: [
    { key: 'deal', name: 'Deal' },
    { key: 'design_review', name: 'Kiểm tra thiết kế có sẵn' },
    { key: 'design_completed', name: 'Sẵn sàng báo giá' },
    { key: 'quotation', name: 'Báo giá' },
    { key: 'negotiation', name: 'Thương lượng' },
    { key: 'order_ready', name: 'Sẵn sàng đặt hàng' },
    { key: 'order', name: 'Đơn hàng' },
    { key: 'project', name: 'Dự án' },
    { key: 'production', name: 'Sản xuất' },
    { key: 'delivery_ready', name: 'Sẵn sàng giao' },
    { key: 'installation', name: 'VC / Lắp đặt' },
    { key: 'completed', name: 'Đã bàn giao' },
  ],
  unselected: [
    { key: 'deal', name: 'Deal' },
    { key: 'route_selection', name: 'Chọn lộ trình' },
    { key: 'design_completed', name: 'Sẵn sàng báo giá' },
    { key: 'quotation', name: 'Báo giá' },
    { key: 'negotiation', name: 'Thương lượng' },
    { key: 'order_ready', name: 'Sẵn sàng đặt hàng' },
    { key: 'order', name: 'Đơn hàng' },
    { key: 'project', name: 'Dự án' },
    { key: 'production', name: 'Sản xuất' },
    { key: 'delivery_ready', name: 'Sẵn sàng giao' },
    { key: 'installation', name: 'VC / Lắp đặt' },
    { key: 'completed', name: 'Đã bàn giao' },
  ],
};

function commandHeaders(prefix, leadId) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    'Idempotency-Key': `${prefix}-${leadId}-${suffix}`,
    'X-Request-Id': `crm-deal-workflow-${suffix}`,
  };
}

function slaLabel(dueAt) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const diff = due.getTime() - Date.now();
  const hours = Math.ceil(Math.abs(diff) / 3_600_000);
  return diff < 0
    ? `Quá SLA ${hours} giờ`
    : `Hạn ${due.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`;
}

function taskStatus(task) {
  if (task.status === 'completed') return ['Hoàn tất', 'bg-emerald-100 text-emerald-700'];
  if (task.status === 'in_progress') return ['Đang làm', 'bg-blue-100 text-blue-700'];
  return ['Chờ xử lý', 'bg-amber-100 text-amber-700'];
}

export default function SalesDealWorkflowPilot({ lead, onRefresh, onOpenTasks, onStateChange }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!lead?.id || lead?.type !== 'deal') return null;
    setLoading(true);
    try {
      const { data } = await api.get(`/crm/leads/${lead.id}/deal-workflow`);
      setState(data);
      onStateChange?.(data);
      setError('');
      return data;
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không tải được quy trình Khảo sát và Thiết kế.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [lead?.id, lead?.type, onStateChange]);

  useEffect(() => {
    void load();
  }, [load, lead?.updated_at]);

  const run = async (action) => {
    setBusy(action);
    setError('');
    try {
      const { data } = await api.post(
        `/crm/leads/${lead.id}/deal-workflow/${action}`,
        {},
        { headers: commandHeaders(action, lead.id) },
      );
      setState(data);
      onStateChange?.(data);
      await onRefresh?.();
    } catch (requestError) {
      const payload = requestError.response?.data;
      setError(payload?.error || 'Không thể chuyển bước Deal.');
      if (payload?.workflow?.tasks) {
        setState((current) => ({ ...(current || {}), readiness: payload.workflow }));
      }
    } finally {
      setBusy('');
    }
  };

  const currentStage = state?.instance?.current_stage_key || 'deal';
  const workflowPath = state?.instance?.workflow_path
    || (currentStage === 'design_review' ? 'customer_design' : null)
    || (['survey', 'design'].includes(currentStage) ? 'full_service' : null);
  const visibleStages = PATH_STAGES[workflowPath || 'unselected'];
  const currentIndex = Math.max(0, visibleStages.findIndex((stage) => stage.key === currentStage));
  const readiness = state?.readiness || {};
  const sla = slaLabel(state?.instance?.sla_due_at);
  const overdue = !!state?.instance?.sla_due_at && new Date(state.instance.sla_due_at).getTime() < Date.now();
  const blockingIds = useMemo(
    () => new Set((readiness.blocking_tasks || []).map((task) => task.id)),
    [readiness.blocking_tasks],
  );
  const primaryQuotation = state?.commercial?.primary || null;
  const acceptedQuotation = state?.commercial?.accepted || primaryQuotation;
  const primaryOrder = state?.commercial?.primary_order || null;
  const primaryProject = state?.commercial?.primary_project || null;
  const productionProject = state?.commercial?.production_project || primaryProject;
  const installationProject = state?.commercial?.installation_project || productionProject;
  const createQuotationPath = state?.commercial?.create_path
    || `/crm/quotations/new?lead_id=${encodeURIComponent(lead?.id || '')}&return_to=${encodeURIComponent(`/crm/leads/${lead?.id || ''}`)}`;

  if (lead?.type !== 'deal') return null;
  if (loading && !state) return null;
  if (!loading && state?.enabled === false) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-slate-950 via-violet-950 to-indigo-900 px-5 py-4 text-white lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
            <Sparkles className="h-4 w-4" /> Business OS · Deal Workflow
          </div>
          <h2 className="mt-1 text-lg font-bold">Deal → Báo giá → Đơn hàng → Dự án → Sản xuất → Lắp đặt → Bàn giao</h2>
          <p className="mt-1 text-xs text-violet-100/75">Chọn theo đầu vào thực tế; mọi đường đi vẫn có task gate, minh chứng và SLA ở backend.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-100">Pilot 1 công ty</span>
          {sla && ['survey', 'design', 'design_review'].includes(currentStage) && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${overdue ? 'bg-red-500/25 text-red-100' : 'bg-white/10 text-violet-50'}`}>
              <Clock3 className="h-3.5 w-3.5" /> {sla}
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1380px] gap-2" style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(0, 1fr))` }}>
          {visibleStages.map((stage, index) => {
            const complete = index < currentIndex
              || (currentStage === 'design_completed' && index === currentIndex);
            const active = stage.key === currentStage;
            return (
              <div key={stage.key} className="relative">
                {index > 0 && <div className={`absolute right-1/2 top-4 h-0.5 w-full ${complete || active ? 'bg-violet-500' : 'bg-slate-200'}`} />}
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${complete ? 'border-emerald-500 bg-emerald-500 text-white' : active ? 'border-violet-600 bg-violet-600 text-white ring-4 ring-violet-100' : 'border-slate-200 bg-white text-slate-400'}`}>
                    {complete ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <span className={`mt-2 text-[11px] font-semibold ${active ? 'text-violet-700' : complete ? 'text-emerald-700' : 'text-slate-400'}`}>{stage.name}</span>
                </div>
              </div>
            );
          })}
        </div>
        </div>

        {loading ? (
          <div className="flex h-28 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang kiểm tra stage gate…</div>
        ) : currentStage === 'completed' ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" /><div><p className="font-semibold">Đã hoàn tất lắp đặt và bàn giao</p><p className="mt-1 text-xs text-emerald-700">Dự án đã vào cột Hoàn thành của VC/LĐ. Mốc bàn giao, người thực hiện và lịch sử chuyển bước đã được lưu trong Business OS.</p></div></div>
              {installationProject?.id && <Link to={`/vc/projects/${installationProject.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800"><PackageCheck className="h-4 w-4" /> Xem hồ sơ bàn giao</Link>}
            </div>
          </div>
        ) : currentStage === 'installation' ? (
          <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><Truck className="mt-0.5 h-6 w-6 shrink-0 text-teal-700" /><div><p className="font-semibold">Đang vận chuyển / lắp đặt</p><p className="mt-1 text-xs text-teal-700">Sale đã chọn đơn vị và lịch thực hiện. Tiến độ tiếp theo được cập nhật trực tiếp trên Kanban VC/LĐ; khi vào cột Hoàn thành, Business OS tự ghi nhận bàn giao.</p></div></div>
              {installationProject?.id && <Link to={`/vc/projects/${installationProject.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800"><Truck className="h-4 w-4" /> Mở VC / Lắp đặt</Link>}
            </div>
          </div>
        ) : currentStage === 'delivery_ready' ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" /><div><p className="font-semibold">Sản xuất đã báo sẵn sàng giao</p><p className="mt-1 text-xs text-amber-700">Thẻ bàn giao tương tác đã được tạo trong tab Bình luận. Sale chọn công ty VC/LĐ hoặc đơn vị bên ngoài, ngày lấy hàng và lịch lắp đặt để chuyển bước.</p></div></div>
              {productionProject?.id && <Link to={`/sx/projects/${productionProject.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 text-xs font-bold text-white hover:bg-amber-800"><Factory className="h-4 w-4" /> Xem hồ sơ Sản xuất</Link>}
            </div>
          </div>
        ) : currentStage === 'production' ? (
          <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><Factory className="mt-0.5 h-6 w-6 shrink-0 text-orange-700" /><div><p className="font-semibold">Đã bàn giao Sản xuất</p><p className="mt-1 text-xs text-orange-700">{productionProject ? `${productionProject.code || 'Dự án'} · ${productionProject.name || 'Hồ sơ sản xuất'} · ${productionProject.status || 'new'}` : 'Dự án đã vượt đầy đủ gate bàn giao và được đưa vào khu vực Sản xuất.'}</p></div></div>
              {productionProject?.id && <Link to={`/sx/projects/${productionProject.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 text-xs font-bold text-white hover:bg-orange-800"><Factory className="h-4 w-4" /> Mở Sản xuất</Link>}
            </div>
          </div>
        ) : currentStage === 'project' ? (
          <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3"><FolderKanban className="mt-0.5 h-6 w-6 shrink-0 text-indigo-700" /><div><p className="font-semibold">Dự án đã được khởi tạo từ đơn hàng xác nhận</p><p className="mt-1 text-xs leading-5 text-indigo-700">{primaryProject ? `${primaryProject.code || 'Dự án'} · ${primaryProject.name || 'Chưa đặt tên'} · ${primaryProject.status || 'new'}` : 'Dự án thật đã được liên kết với Deal.'} Hoàn tất nhiệm vụ `sx_*`, chọn công ty xưởng, lịch thi công/SX và xác nhận Sale để bàn giao.</p></div></div>
              <div className="flex flex-wrap gap-2">{primaryProject?.id && <Link to={`/projects/${primaryProject.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-xs font-bold text-white hover:bg-indigo-800"><FolderKanban className="h-4 w-4" /> Mở dự án</Link>}<button type="button" onClick={onOpenTasks} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><FileCheck2 className="h-4 w-4" /> Kiểm tra task bàn giao</button></div>
            </div>
          </div>
        ) : currentStage === 'order' ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><ShoppingCart className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" /><div><p className="font-semibold">Đơn hàng đã được tạo</p><p className="mt-1 text-xs text-emerald-700">{primaryOrder ? `${primaryOrder.code || 'Đơn hàng'} · ${Number(primaryOrder.total || 0).toLocaleString('vi-VN')} ₫ · ${primaryOrder.status || 'draft'}` : 'Đơn hàng thật đã được liên kết với Deal.'} Xác nhận đơn hàng để hệ thống khởi tạo Dự án.</p></div></div>
              {primaryOrder?.id && <Link to={`/crm/orders/${primaryOrder.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800"><ShoppingCart className="h-4 w-4" /> Mở và xác nhận đơn</Link>}
            </div>
          </div>
        ) : currentStage === 'order_ready' ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" /><div><p className="font-semibold">Khách đã chấp nhận báo giá</p><p className="mt-1 text-xs text-emerald-700">Đã đạt gate Sẵn sàng đặt hàng. Mở báo giá được duyệt để tạo đơn hàng thật.</p></div></div>
              {acceptedQuotation?.id && <Link to={`/crm/quotations/${acceptedQuotation.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800"><ShoppingCart className="h-4 w-4" /> Tạo đơn hàng</Link>}
            </div>
          </div>
        ) : currentStage === 'negotiation' ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" /><div><p className="font-semibold">Đang thương lượng với khách hàng</p><p className="mt-1 text-xs text-amber-700">Có thể chỉnh sửa hoặc tạo phiên bản báo giá khác. Chỉ báo giá được khách chấp nhận mới mở gate Đơn hàng.</p></div></div>
              <div className="flex flex-wrap gap-2">{primaryQuotation?.id && <Link to={`/crm/quotations/${primaryQuotation.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 text-xs font-bold text-white hover:bg-amber-800"><FileCheck2 className="h-4 w-4" /> Mở báo giá</Link>}<Link to={createQuotationPath} className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-200 bg-white px-4 text-xs font-bold text-amber-700 hover:bg-amber-100">Tạo phiên bản khác</Link></div>
            </div>
          </div>
        ) : currentStage === 'quotation' ? (
          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" />
                <div><p className="font-semibold">Đã bắt đầu Báo giá</p><p className="mt-1 text-xs text-blue-700">{primaryQuotation ? `${primaryQuotation.code || 'Báo giá'} · ${Number(primaryQuotation.total || 0).toLocaleString('vi-VN')} ₫ · ${primaryQuotation.status || 'draft'}` : 'Báo giá thật đã được liên kết với Deal.'}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {primaryQuotation?.id && <Link to={`/crm/quotations/${primaryQuotation.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-800"><FileCheck2 className="h-4 w-4" /> Mở báo giá</Link>}
                <Link to={createQuotationPath} className="inline-flex h-9 items-center justify-center rounded-xl border border-blue-200 bg-white px-4 text-xs font-bold text-blue-700 hover:bg-blue-100">Tạo báo giá khác</Link>
              </div>
            </div>
          </div>
        ) : currentStage === 'design_completed' ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><p className="font-semibold">Hồ sơ thiết kế đã sẵn sàng</p><p className="text-xs text-emerald-700">{workflowPath === 'customer_design' ? 'Thiết kế khách cung cấp đã qua kiểm tra kỹ thuật và đủ dữ liệu báo giá.' : 'Khảo sát và thiết kế nội bộ đã hoàn tất, đủ điều kiện nối sang Báo giá.'}</p></div></div>
              <Link to={createQuotationPath} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800"><ArrowRight className="h-4 w-4" /> Tạo báo giá</Link>
            </div>
          </div>
        ) : currentStage === 'deal' ? (
          <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
            <div><p className="text-sm font-bold text-slate-900">Khách hàng đang ở tình trạng nào?</p><p className="mt-1 text-xs leading-5 text-slate-600">Chọn đúng đầu vào để hệ thống tạo công việc cần thiết. Lộ trình được ghi vào lịch sử hồ sơ.</p></div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <button type="button" onClick={() => run('start-survey')} disabled={!!busy} className="group flex min-h-28 items-start gap-3 rounded-xl border border-violet-200 bg-white p-4 text-left hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Ruler className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-bold text-slate-900">Cần khảo sát và thiết kế {busy === 'start-survey' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 text-violet-500" />}</span><span className="mt-1 block text-xs leading-5 text-slate-600">Đi theo quy trình đầy đủ: Khảo sát hiện trạng → Thiết kế → Báo giá.</span></span>
              </button>
              <button type="button" onClick={() => run('start-design-review')} disabled={!!busy} className="group flex min-h-28 items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><FileCheck2 className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-bold text-slate-900">Khách đã có thiết kế {busy === 'start-design-review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 text-emerald-500" />}</span><span className="mt-1 block text-xs leading-5 text-slate-600">Bỏ qua khâu làm lại, nhưng kiểm tra file, kích thước và tính khả thi trước Báo giá.</span></span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_280px]">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div><p className="text-sm font-bold text-slate-900">Công việc {readiness.stage_label}</p><p className="mt-0.5 text-[11px] text-slate-500">Hoàn thành task chặn, minh chứng và kết luận trước khi chuyển bước.</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${readiness.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{readiness.completed_tasks || 0}/{readiness.total_tasks || 0}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(readiness.tasks || []).map((task) => {
                  const [label, tone] = taskStatus(task);
                  return (
                    <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                      <FileCheck2 className={`mt-0.5 h-4 w-4 shrink-0 ${blockingIds.has(task.id) ? 'text-amber-600' : 'text-emerald-600'}`} />
                      <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800">{task.title}</p><p className="mt-1 text-[10px] text-slate-500">{task.blocks_stage_advance ? 'Bắt buộc' : 'Hỗ trợ'}{task.completion_requires_file_or_note ? ' · cần minh chứng' : ''}{task.requires_quick_verdict ? ' · cần kết luận Đủ/Chưa' : ''}</p></div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${tone}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-bold text-slate-900">Điều kiện chuyển bước</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-600">Còn {readiness.blocking_tasks?.length || 0} điều kiện đang chặn. Mở tab Công việc để cập nhật trạng thái, ghi chú, file và kết luận.</p>
              <button type="button" onClick={onOpenTasks} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white text-xs font-bold text-violet-700 hover:bg-violet-50"><FileCheck2 className="h-4 w-4" /> Mở tab Công việc</button>
              {currentStage === 'survey' && <button type="button" onClick={() => run('complete-survey')} disabled={!!busy || !readiness.ready} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{busy === 'complete-survey' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Bàn giao Thiết kế</button>}
              {currentStage === 'design' && <button type="button" onClick={() => run('complete-design')} disabled={!!busy || !readiness.ready} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{busy === 'complete-design' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Hoàn tất Thiết kế</button>}
              {currentStage === 'design_review' && <button type="button" onClick={() => run('complete-design-review')} disabled={!!busy || !readiness.ready} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{busy === 'complete-design-review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Xác nhận đủ dữ liệu báo giá</button>}
            </div>
          </div>
        )}

        {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}
      </div>
    </section>
  );
}
