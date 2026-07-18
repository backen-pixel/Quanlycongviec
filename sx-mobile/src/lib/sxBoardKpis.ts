/**
 * Helpers KPI board SX — dùng chung Overview / Kanban.
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

function kpiCol(p: ProductionProject): string | null {
  return p.resolved_column_id ?? p.sx_kanban_column_id ?? null;
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
  const idx = index || buildKpiStageIndex(stages);
  const col = idx.byId.get(String(kpiCol(p) || ''));
  return Boolean(col?.is_handover_to_logistics);
}

function countsCompleted(p: ProductionProject, index: KpiStageIndex): boolean {
  if (index.completedIds.size) {
    return index.completedIds.has(String(kpiCol(p) || ''));
  }
  return String(p.status || '') === 'completed';
}

function countsCollected(p: ProductionProject, index: KpiStageIndex): boolean {
  const id = String(kpiCol(p) || '');
  if (!id) return false;
  return index.collectedIds.has(id);
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
  if (countsCompleted(p, idx)) return false;
  if (countsCollected(p, idx)) return false;
  const col = idx.byId.get(String(kpiCol(p) || ''));
  if (col?.bucket_slug === INTAKE_BUCKET) return false;
  return true;
}

export type SxBoardKpis = {
  total: number;
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
  let producing = 0;
  let awaitingDelivery = 0;
  let shipped = 0;
  let completed = 0;
  let overdue = 0;
  for (const p of projects) {
    if (projectIsProducing(p, stages, index)) producing += 1;
    if (projectIsAwaitingDelivery(p, stages, index)) awaitingDelivery += 1;
    if (projectIsShipped(p)) shipped += 1;
    if (String(p.status || '') === 'completed') completed += 1;
    // is_overdue đã tính lúc attachColumns — tránh quét stages lại mỗi dự án.
    if (p.is_overdue) overdue += 1;
  }
  return {
    total: projects.length,
    producing,
    awaitingDelivery,
    shipped,
    completed,
    overdue,
  };
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Dự án ưu tiên: quá hạn trước, rồi sắp đến hạn (≤2 ngày). */
export function pickPriorityProjects(
  projects: ProductionProject[],
  limit = 5,
): ProductionProject[] {
  const now = startOfLocalDay(new Date()).getTime();
  const dayMs = 86400000;
  const scored = projects
    .filter((p) => String(p.status || '') !== 'completed')
    .map((p) => {
      const raw = p.delivery_date || p.production_deadline || p.deadline;
      const ts = raw ? startOfLocalDay(new Date(raw)).getTime() : NaN;
      let score = 1000;
      if (p.is_overdue) score = 0;
      else if (Number.isFinite(ts)) {
        const diff = Math.floor((ts - now) / dayMs);
        if (diff >= 0 && diff <= 2) score = 1 + diff;
        else if (diff > 2) score = 10 + diff;
      }
      return { p, score, ts: Number.isFinite(ts) ? ts : Infinity };
    })
    .filter((x) => x.score < 100)
    .sort((a, b) => a.score - b.score || a.ts - b.ts);
  return scored.slice(0, limit).map((x) => x.p);
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
