/**
 * KPI doanh thu / thanh toán dashboard Sản xuất theo cột production_pipeline_stages (frontend).
 */

import { effectivePipelineStageSlaDays, isPipelineStageSlaDisabled } from './crmPipelineSla';

const INTAKE_BUCKET = 'won_pending';
const VC_SHIPPED_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);

/** Chi phí sản xuất — KPI / tổng cột / công nợ (không fallback doanh thu CRM). */
export function resolveSxProjectValue(project) {
  const pv = Number(project?.production_value);
  if (Number.isFinite(pv) && pv > 0) return pv;
  return 0;
}

/** Tiền cọc SX — chỉ projects.deposit_amount. */
export function resolveSxProjectDeposit(project) {
  const pd = Number(project?.deposit_amount);
  if (Number.isFinite(pd) && pd > 0) return pd;
  return 0;
}

/** Công nợ SX = Chi phí sản xuất − Tiền cọc. */
export function resolveSxProjectRemaining(project) {
  return Math.max(0, resolveSxProjectValue(project) - resolveSxProjectDeposit(project));
}

/** Tiền đã thu trên dự án SX (cột riêng, không gồm tiền cọc). */
export function resolveSxProjectCollected(project) {
  const n = Number(project?.collected_amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Tiến độ thu tiền — giá trị đơn + thu HĐ CRM hoặc cột collected_amount. */
export function resolveSxProjectPaymentProgress(project, crmStats = null) {
  const orderValue = resolveSxProjectValue(project);

  const invoicePaid = Number(crmStats?.totalPaid) || 0;
  const invoicedTotal = Number(crmStats?.totalInvoiced) || 0;
  const ordersTotal = Number(crmStats?.totalOrders) || 0;
  const manualCollected = resolveSxProjectCollected(project);

  const base = orderValue > 0 ? orderValue : (invoicedTotal > 0 ? invoicedTotal : ordersTotal);

  const hasCrmInvoicing = invoicedTotal > 0;
  let paid = hasCrmInvoicing ? invoicePaid : manualCollected;
  if (base > 0) paid = Math.min(paid, base);

  const pct = base > 0 ? Math.min(Math.round((paid / base) * 100), 100) : 0;
  const paymentDebt = base > 0 ? Math.max(0, base - paid) : 0;

  return {
    base,
    paid,
    pct,
    paymentDebt,
    hasData: base > 0,
    needsInvoice: Boolean(crmStats?.needsInvoice),
    invoiceGap: Math.max(0, ordersTotal - invoicedTotal),
    paidFull: base > 0 && paid >= base,
  };
}

export const VC_KANBAN_STATUSES = new Set(['shipping', 'installing', 'warranty']);

/**
 * Cột SX tự đặt `projects.status` theo workflow slug (xem PATCH /production/projects/:id/stage).
 * Phải khớp `SX_STAGE_SLUG_STATUS` ở backend/src/helpers/workshopKanban.js.
 */
export const SX_STAGE_SLUG_STATUS = {
  production: 'producing',
  delivery: 'shipping',
  'customer-care': 'warranty',
};

export function sxStageSlugOf(col) {
  return col?.workflow_stage?.slug || col?.slug || null;
}

/**
 * `status` = shipping/warranty có thể do chính cột SX đang gắn sinh ra, không phải vì đã bàn giao VC.
 * Khi đó không được ép thẻ về cột «Bàn giao VC»: thẻ sẽ nhảy khỏi cột vừa kéo và bị khoá kéo.
 */
export function sxStatusComesFromColumn(project, col) {
  const slug = sxStageSlugOf(col);
  if (!slug) return false;
  return SX_STAGE_SLUG_STATUS[slug] === String(project?.status || '');
}

function stageById(stages, colId) {
  if (!colId || !Array.isArray(stages)) return null;
  return stages.find((s) => String(s.id) === String(colId)) || null;
}

export function pickSxWonStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  const explicit = list.filter((s) => !!s.counts_as_won_revenue);
  if (explicit.length) return explicit.map((s) => String(s.id));
  const sorted = [...list].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const first = sorted[0];
  return first ? [String(first.id)] : [];
}

export function pickSxCompletedStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  const explicit = list.filter((s) => !!s.counts_as_completed_revenue);
  if (explicit.length) return explicit.map((s) => String(s.id));
  return [];
}

export function pickSxCollectedStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  return list.filter((s) => !!s.counts_as_collected_revenue).map((s) => String(s.id));
}

function projectInSxColumn(project, stageIds) {
  const colId = String(project?.sx_kanban_column_id || '');
  if (!colId || !stageIds.length) return false;
  return stageIds.includes(colId);
}

export function projectCountsAsSxWonRevenue(project, stages) {
  return projectInSxColumn(project, pickSxWonStageIds(stages));
}

export function projectCountsAsSxCompletedRevenue(project, stages) {
  const completedIds = pickSxCompletedStageIds(stages);
  if (completedIds.length) return projectInSxColumn(project, completedIds);
  return String(project?.status || '') === 'completed';
}

export function projectCountsAsSxCollectedRevenue(project, stages) {
  return projectInSxColumn(project, pickSxCollectedStageIds(stages));
}

export function projectCountsAsSxDebt(project, stages) {
  return projectCountsAsSxCompletedRevenue(project, stages)
    && !projectCountsAsSxCollectedRevenue(project, stages);
}

export function projectIsShipped(project) {
  return VC_SHIPPED_STATUSES.has(String(project?.status || ''))
    || Boolean(project?.logistics_company_id || project?.logistics_company?.id);
}

export function projectIsAwaitingDelivery(project, stages) {
  if (projectIsShipped(project)) return false;
  const col = stageById(stages, project?.sx_kanban_column_id);
  return Boolean(col?.is_handover_to_logistics);
}

export function projectIsProducing(project, stages) {
  if (project.sx_intake) return false;
  if (projectIsShipped(project)) return false;
  if (projectIsAwaitingDelivery(project, stages)) return false;
  if (projectCountsAsSxCompletedRevenue(project, stages)) return false;
  if (projectCountsAsSxCollectedRevenue(project, stages)) return false;
  const col = stageById(stages, project?.sx_kanban_column_id);
  if (col?.bucket_slug === INTAKE_BUCKET) return false;
  return true;
}

export function resolveSxProjectProbability(project, stage, dealProbability) {
  const rawDeal = dealProbability ?? project?.deal_probability;
  if (rawDeal != null && rawDeal !== '') {
    const n = Number(rawDeal);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  const fb = stage?.default_probability;
  if (fb != null && fb !== '') {
    const n = Number(fb);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  return null;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Bucket deadline view SX — khớp ProductionDeadlineView.
 * Ưu tiên delivery_date → production_deadline → deadline.
 */
export function resolveSxDeadlineBucket(item, todayMs = Date.now(), stage = null) {
  const raw = item?.delivery_date || item?.production_deadline || item?.deadline;
  if (!raw) return { bucket: 'none', ts: null, source: null };
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return { bucket: 'none', ts: null, source: null };
  const source = item.delivery_date
    ? 'delivery_date'
    : (item.production_deadline ? 'production_deadline' : 'deadline');
  const today = startOfLocalDay(new Date(todayMs));
  const dayMs = 86400000;
  const diffDays = Math.floor((startOfLocalDay(t).getTime() - today.getTime()) / dayMs);
  const st = stage || item?.sx_pipeline_stage;
  if (diffDays < 0) {
    if (shouldIgnoreSxOrderDeliveryOverdue(st) || isSxPipelineStageNoDeadline(st)) {
      return { bucket: 'later', ts: t, source };
    }
    return { bucket: 'overdue', ts: t, source };
  }
  if (diffDays === 0) return { bucket: 'today', ts: t, source };
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  const daysToEndOfWeek = 7 - dow;
  if (diffDays <= daysToEndOfWeek) return { bucket: 'this_week', ts: t, source };
  if (diffDays <= daysToEndOfWeek + 7) return { bucket: 'next_week', ts: t, source };
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getTime();
  if (t <= endOfMonth) return { bucket: 'this_month', ts: t, source };
  return { bucket: 'later', ts: t, source };
}

/** Số thẻ cột «Quá hạn» trên Deadline view (cùng quy tắc gom bucket). */
export function countSxDeadlineViewOverdue(pipelineColumns, todayMs = Date.now()) {
  let n = 0;
  for (const col of Array.isArray(pipelineColumns) ? pipelineColumns : []) {
    for (const item of col.items || []) {
      if (shouldHideSxKanbanDeadlineOnCard(item, col)) continue;
      if (resolveSxDeadlineBucket(item, todayMs, col).bucket === 'overdue') n += 1;
    }
  }
  return n;
}

export function computeSxRevenueKpis(projects, stages) {
  const list = Array.isArray(projects) ? projects : [];
  const st = Array.isArray(stages) ? stages : [];
  let wonRevenue = 0;
  let completedRevenue = 0;
  let collectedRevenue = 0;
  let debtRevenue = 0;
  let weightedPipeline = 0;
  let producing = 0;
  let awaitingDelivery = 0;
  let shipped = 0;
  let overdue = 0;
  let debtCount = 0;
  let collectedCount = 0;
  const nowMs = Date.now();

  for (const p of list) {
    const val = resolveSxProjectValue(p);
    const col = stageById(st, p.sx_kanban_column_id) || p.sx_pipeline_stage;
    if (projectCountsAsSxWonRevenue(p, st)) wonRevenue += val;
    if (projectCountsAsSxCompletedRevenue(p, st)) completedRevenue += val;
    if (projectCountsAsSxCollectedRevenue(p, st)) {
      collectedRevenue += val;
      collectedCount += 1;
    }
    if (projectCountsAsSxDebt(p, st)) {
      debtRevenue += resolveSxProjectRemaining(p);
      debtCount += 1;
    }
    if (projectIsProducing(p, st)) producing += 1;
    if (projectIsAwaitingDelivery(p, st)) awaitingDelivery += 1;
    if (projectIsShipped(p)) shipped += 1;
    // Quá hạn KPI = cột «Quá hạn» của Deadline view
    if (!shouldHideSxKanbanDeadlineOnCard(p, col)
      && resolveSxDeadlineBucket(p, nowMs, col).bucket === 'overdue') {
      overdue += 1;
    }
    if (col && col.bucket_slug !== INTAKE_BUCKET && val > 0) {
      const prob = resolveSxProjectProbability(p, col);
      if (prob != null) weightedPipeline += val * (prob / 100);
    }
  }

  return {
    wonRevenue,
    completedRevenue,
    collectedRevenue,
    debtRevenue,
    weightedPipeline: Math.round(weightedPipeline),
    producing,
    awaitingDelivery,
    shipped,
    overdue,
    debtCount,
    collectedCount,
  };
}

/** Cột tích «doanh thu đã hoàn thành» — không tính/hiển thị deadline. */
export function isSxPipelineStageCompletedRevenue(stage) {
  return !!stage?.counts_as_completed_revenue;
}

/** Cột không theo dõi deadline (Hoàn thành / Đã công). */
export function isSxPipelineStageNoDeadline(stage) {
  return isSxPipelineStageCompletedRevenue(stage);
}

/** Ẩn badge deadline trên thẻ Kanban SX khi ở cột «Đã công». */
export function shouldHideSxKanbanDeadlineOnCard(item, stage) {
  const st = stage || item?.sx_pipeline_stage;
  return isSxPipelineStageNoDeadline(st);
}

/**
 * Cột bật «Bỏ quá hạn» (sla_days=0) hoặc «Đã công» — không tô đỏ ngày đặt/giao/deadline dự án.
 * Khớp cấu hình pipeline setup.
 */
export function shouldIgnoreSxOrderDeliveryOverdue(stage) {
  if (!stage) return false;
  if (isSxPipelineStageNoDeadline(stage)) return true;
  if (isPipelineStageSlaDisabled(stage.sla_days)) return true;
  return false;
}

/** Mức cảnh báo ngày giao / deadline đặt hàng — null nếu không có ngày. */
export function getSxOrderDeliveryDateUrgency(dateIso, stage) {
  if (!dateIso) return null;
  const dd = new Date(dateIso);
  if (Number.isNaN(dd.getTime())) return null;
  if (shouldIgnoreSxOrderDeliveryOverdue(stage)) {
    return { level: 'ok', overdue: false, soon: false };
  }
  // Quá hạn = trước hôm nay (theo ngày), không tính «hôm nay đã qua giờ».
  const overdue = startOfLocalDay(dd).getTime() < startOfLocalDay(new Date()).getTime();
  const soon = !overdue && dd < new Date(Date.now() + 3 * 86400000);
  return {
    level: overdue ? 'overdue' : soon ? 'soon' : 'ok',
    overdue,
    soon,
  };
}

export function isSxProjectDeliveryDateOverdue(project, stage) {
  const st = stage || project?.sx_pipeline_stage;
  if (shouldIgnoreSxOrderDeliveryOverdue(st)) return false;
  const raw = project?.delivery_date || project?.production_deadline || project?.deadline;
  if (!raw || project?.status === 'completed') return false;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return false;
  // Khớp cột Deadline: chỉ quá hạn khi ngày hạn < hôm nay (không tính cùng ngày).
  return startOfLocalDay(t).getTime() < startOfLocalDay(new Date()).getTime();
}

/** SLA cột pipeline SX — null nếu không áp dụng. */
export function getSxPipelineStageSlaTone(stageEnteredAt, stage) {
  if (!stageEnteredAt || !stage) return null;
  if (isSxPipelineStageNoDeadline(stage)) return null;
  if (stage.bucket_slug === INTAKE_BUCKET) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  const deadlineTs = new Date(stageEnteredAt).getTime() + slaDays * 86400000;
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

export function isSxColumnSlaOverdue(project, stage) {
  const tone = getSxPipelineStageSlaTone(
    project?.sx_pipeline_stage_entered_at,
    stage || project?.sx_pipeline_stage,
  );
  return tone?.level === 'overdue';
}

/** Chọn cột «Bàn giao VC» theo phân loại — khớp logic BE workshopKanban. */
export function resolveSxHandoverColumnId(stages, project, preferredColId = null) {
  const sorted = Array.isArray(stages) ? stages : [];
  const stageIds = new Set(sorted.map((s) => String(s.id)));
  if (preferredColId && stageIds.has(String(preferredColId))) {
    return preferredColId;
  }
  const wktId = project?.workshop_type_id || project?.workshop_type?.id || null;
  const handoverCols = sorted.filter((s) => s.is_handover_to_logistics === true);
  if (!handoverCols.length) return null;
  if (wktId) {
    const typed = handoverCols.find((s) => String(s.workshop_type_id || '') === String(wktId));
    if (typed) return typed.id;
  }
  const globalHo = handoverCols.find((s) => !s.workshop_type_id);
  if (globalHo) return globalHo.id;
  return handoverCols[0].id;
}

export function buildSxPipelineStageMeta(col) {
  if (!col) return null;
  return {
    id: col.id,
    name: col.name,
    color: col.color,
    icon: col.icon,
    sla_days: col.sla_days,
    default_probability: col.default_probability,
    counts_as_won_revenue: col.counts_as_won_revenue,
    counts_as_completed_revenue: col.counts_as_completed_revenue,
    counts_as_collected_revenue: col.counts_as_collected_revenue,
    requires_deadline: col.requires_deadline,
    auto_add_members_on_enter: col.auto_add_members_on_enter,
    bucket_slug: col.bucket_slug,
    is_handover_to_logistics: col.is_handover_to_logistics,
  };
}
