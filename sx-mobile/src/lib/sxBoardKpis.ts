/**
 * Helpers KPI board SX — dùng chung Overview / Kanban.
 */
import type { KanbanStage, ProductionProject } from '../types';
import { isSxProjectDeliveryDateOverdue } from './productionApi';

const INTAKE_BUCKET = 'won_pending';
const VC_SHIPPED = new Set(['shipping', 'installing', 'warranty', 'completed']);

function stageById(stages: KanbanStage[], colId?: string | null): KanbanStage | undefined {
  if (!colId) return undefined;
  return stages.find((s) => String(s.id) === String(colId));
}

function kpiCol(p: ProductionProject): string | null {
  return p.sx_kanban_column_id ?? null;
}

export function projectIsShipped(p: ProductionProject): boolean {
  return VC_SHIPPED.has(String(p.status || '')) || Boolean(p.logistics_company_id);
}

export function projectIsAwaitingDelivery(p: ProductionProject, stages: KanbanStage[]): boolean {
  if (projectIsShipped(p)) return false;
  const col = stageById(stages, kpiCol(p));
  return Boolean(col?.is_handover_to_logistics);
}

function countsCompleted(p: ProductionProject, stages: KanbanStage[]): boolean {
  const cols = stages.filter((s) => s.bucket_slug !== INTAKE_BUCKET && s.counts_as_completed_revenue);
  if (cols.length) {
    const id = String(kpiCol(p) || '');
    return cols.some((s) => String(s.id) === id);
  }
  return String(p.status || '') === 'completed';
}

function countsCollected(p: ProductionProject, stages: KanbanStage[]): boolean {
  const id = String(kpiCol(p) || '');
  if (!id) return false;
  return stages.some(
    (s) => s.bucket_slug !== INTAKE_BUCKET && s.counts_as_collected_revenue && String(s.id) === id,
  );
}

export function projectIsProducing(p: ProductionProject, stages: KanbanStage[]): boolean {
  if (p.sx_intake) return false;
  if (projectIsShipped(p)) return false;
  if (projectIsAwaitingDelivery(p, stages)) return false;
  if (countsCompleted(p, stages)) return false;
  if (countsCollected(p, stages)) return false;
  const col = stageById(stages, kpiCol(p));
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
  let producing = 0;
  let awaitingDelivery = 0;
  let shipped = 0;
  let completed = 0;
  let overdue = 0;
  for (const p of projects) {
    if (projectIsProducing(p, stages)) producing += 1;
    if (projectIsAwaitingDelivery(p, stages)) awaitingDelivery += 1;
    if (projectIsShipped(p)) shipped += 1;
    if (String(p.status || '') === 'completed') completed += 1;
    if (p.is_overdue || isSxProjectDeliveryDateOverdue(p, stages)) overdue += 1;
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
