/**
 * Helpers KPI board SX — khớp web `frontend/src/lib/sxPipelineRevenue.js`
 * + `ProductionDashboard` scopeKpis.
 */
import type { KanbanStage, ProductionProject } from '../types';

const INTAKE_BUCKET = 'won_pending';
const VC_SHIPPED = new Set(['shipping', 'installing', 'warranty', 'completed']);

type KpiStageIndex = {
  byId: Map<string, KanbanStage>;
  completedIds: Set<string>;
  collectedIds: Set<string>;
};

function buildKpiStageIndex(stages: KanbanStage[]): KpiStageIndex {
  const byId = new Map<string, KanbanStage>();
  const completedIds = new Set<string>();
  const collectedIds = new Set<string>();
  for (const s of stages) {
    byId.set(String(s.id), s);
    if (s.bucket_slug === INTAKE_BUCKET) continue;
    if (s.counts_as_completed_revenue) completedIds.add(String(s.id));
    if (s.counts_as_collected_revenue) collectedIds.add(String(s.id));
  }
  return { byId, completedIds, collectedIds };
}

/** Cột KPI — khớp web: `sx_kanban_column_id` (sau attach = cột resolve như enrich BE). */
function kpiCol(p: ProductionProject): string | null {
  return p.sx_kanban_column_id ?? p.resolved_column_id ?? null;
}

function stageOf(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): KanbanStage | undefined {
  const idx = index || buildKpiStageIndex(stages);
  const id = kpiCol(p);
  return id ? idx.byId.get(String(id)) : undefined;
}

export function projectIsShipped(p: ProductionProject): boolean {
  return VC_SHIPPED.has(String(p.status || '')) || Boolean(p.logistics_company_id);
}

export function projectIsAwaitingDelivery(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  if (projectIsShipped(p)) return false;
  const col = stageOf(p, stages, index);
  return Boolean(col?.is_handover_to_logistics);
}

/** Doanh thu hoàn thành theo cột — dùng loại trừ «Đang SX», không dùng cho thẻ «Hoàn tất». */
export function countsAsCompletedRevenue(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  const idx = index || buildKpiStageIndex(stages);
  if (idx.completedIds.size) {
    return idx.completedIds.has(String(kpiCol(p) || ''));
  }
  return String(p.status || '') === 'completed';
}

export function countsAsCollectedRevenue(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  const idx = index || buildKpiStageIndex(stages);
  const id = String(kpiCol(p) || '');
  if (!id) return false;
  return idx.collectedIds.has(id);
}

export function projectIsProducing(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  const idx = index || buildKpiStageIndex(stages);
  if (p.sx_intake) return false;
  if (projectIsShipped(p)) return false;
  if (projectIsAwaitingDelivery(p, stages, idx)) return false;
  if (countsAsCompletedRevenue(p, stages, idx)) return false;
  if (countsAsCollectedRevenue(p, stages, idx)) return false;
  const col = stageOf(p, stages, idx);
  if (col?.bucket_slug === INTAKE_BUCKET) return false;
  return true;
}

/** Chờ vào xưởng — khớp web `intake_pending`: `sx_intake`. */
export function projectIsIntake(p: ProductionProject): boolean {
  return Boolean(p.sx_intake);
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Ẩn deadline trên thẻ / KPI — khớp `shouldHideSxKanbanDeadlineOnCard`. */
function shouldHideDeadline(stage?: KanbanStage | null): boolean {
  return Boolean(stage?.counts_as_completed_revenue);
}

/** Cột bỏ quá hạn — khớp `shouldIgnoreSxOrderDeliveryOverdue`. */
function shouldIgnoreOverdue(stage?: KanbanStage | null): boolean {
  if (!stage) return false;
  if (stage.counts_as_completed_revenue) return true;
  if (stage.sla_days === 0) return true;
  return false;
}

/**
 * Quá hạn KPI — khớp web `resolveSxDeadlineBucket(...).bucket === 'overdue'`
 * (+ ẩn cột «Đã công»).
 */
export function projectIsDeadlineOverdue(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
  todayMs = Date.now(),
): boolean {
  if (String(p.status || '') === 'completed') return false;
  const col = stageOf(p, stages, index);
  if (shouldHideDeadline(col)) return false;
  const raw = p.delivery_date || p.production_deadline || p.deadline;
  if (!raw) return false;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return false;
  if (shouldIgnoreOverdue(col)) return false;
  const today = startOfLocalDay(new Date(todayMs));
  return startOfLocalDay(t).getTime() < today.getTime();
}

export type SxBoardKpis = {
  total: number;
  intake: number;
  producing: number;
  awaitingDelivery: number;
  shipped: number;
  completed: number;
  overdue: number;
};

export function computeSxBoardKpis(
  projects: ProductionProject[],
  stages: KanbanStage[],
): SxBoardKpis {
  const index = buildKpiStageIndex(stages);
  const nowMs = Date.now();
  let intake = 0;
  let producing = 0;
  let awaitingDelivery = 0;
  let shipped = 0;
  let completed = 0;
  let overdue = 0;
  for (const p of projects) {
    if (projectIsIntake(p)) intake += 1;
    if (projectIsProducing(p, stages, index)) producing += 1;
    if (projectIsAwaitingDelivery(p, stages, index)) awaitingDelivery += 1;
    if (projectIsShipped(p)) shipped += 1;
    // Web scopeKpis.completed = status === 'completed'
    if (String(p.status || '') === 'completed') completed += 1;
    if (projectIsDeadlineOverdue(p, stages, index, nowMs)) overdue += 1;
  }
  return {
    total: projects.length,
    intake,
    producing,
    awaitingDelivery,
    shipped,
    completed,
    overdue,
  };
}

/** Deal/dự án quá hạn (chưa hoàn tất), sắp theo hạn gần nhất — cùng logic KPI `projectIsDeadlineOverdue`. */
export function pickOverdueProjects(
  projects: ProductionProject[],
  limit = 8,
  stages: KanbanStage[] = [],
): ProductionProject[] {
  const index = stages.length ? buildKpiStageIndex(stages) : undefined;
  const nowMs = Date.now();
  return projects
    .filter((p) => {
      if (String(p.status || '') === 'completed') return false;
      if (stages.length) return projectIsDeadlineOverdue(p, stages, index, nowMs);
      return Boolean(p.is_overdue);
    })
    .map((p) => {
      const raw = p.delivery_date || p.production_deadline || p.deadline;
      const ts = raw ? startOfLocalDay(new Date(raw)).getTime() : Infinity;
      return { p, ts: Number.isFinite(ts) ? ts : Infinity };
    })
    .sort((a, b) => a.ts - b.ts)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Deal sắp đến hạn (≤2 ngày), chưa quá hạn. */
export function pickSoonProjects(
  projects: ProductionProject[],
  limit = 5,
  stages: KanbanStage[] = [],
): ProductionProject[] {
  const index = stages.length ? buildKpiStageIndex(stages) : undefined;
  const nowMs = Date.now();
  const now = startOfLocalDay(new Date(nowMs)).getTime();
  const dayMs = 86400000;
  const scored: { p: ProductionProject; diff: number; ts: number }[] = [];
  for (const p of projects) {
    if (String(p.status || '') === 'completed') continue;
    if (stages.length) {
      if (projectIsDeadlineOverdue(p, stages, index, nowMs)) continue;
    } else if (p.is_overdue) {
      continue;
    }
    const raw = p.delivery_date || p.production_deadline || p.deadline;
    const ts = raw ? startOfLocalDay(new Date(raw)).getTime() : NaN;
    if (!Number.isFinite(ts)) continue;
    const diff = Math.floor((ts - now) / dayMs);
    if (diff < 0 || diff > 2) continue;
    scored.push({ p, diff, ts });
  }
  return scored
    .sort((a, b) => a.diff - b.diff || a.ts - b.ts)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Dự án ưu tiên: quá hạn trước, rồi sắp đến hạn (≤2 ngày). */
export function pickPriorityProjects(
  projects: ProductionProject[],
  limit = 5,
  stages: KanbanStage[] = [],
): ProductionProject[] {
  const overdue = pickOverdueProjects(projects, limit, stages);
  if (overdue.length >= limit) return overdue.slice(0, limit);
  const soon = pickSoonProjects(projects, limit - overdue.length, stages);
  return [...overdue, ...soon].slice(0, limit);
}

export function greetingByHour(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function formatVnWeekdayDate(now = new Date()): string {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${days[now.getDay()]}, ${d}/${m}/${now.getFullYear()}`;
}

export function shortDateLabel(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function initialsFrom(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}
