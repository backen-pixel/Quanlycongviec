/**
 * Helpers KPI board Lắp đặt (VC) — đếm theo cột Kanban
 * (khớp pill KPI trên KanbanScreen).
 */
import { isInstallVcStage } from './productionFilters';
import type { KanbanStage, ProductionProject } from '../types';

const INTAKE_BUCKET = 'delivery_pending';

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function projectIsIntake(p: ProductionProject): boolean {
  return Boolean(p.vc_intake);
}

export function projectIsCompleted(p: ProductionProject): boolean {
  return String(p.status || '') === 'completed';
}

/** Quá hạn: chưa hoàn tất + có hạn giao/lắp đặt đã qua ngày hôm nay. */
export function projectIsDeadlineOverdue(
  p: ProductionProject,
  todayMs = Date.now(),
): boolean {
  if (projectIsCompleted(p)) return false;
  const raw = p.deadline;
  if (!raw) return false;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return false;
  const today = startOfLocalDay(new Date(todayMs));
  return startOfLocalDay(t).getTime() < today.getTime();
}

function isIntakeCol(s: KanbanStage): boolean {
  if (s.bucket_slug === INTAKE_BUCKET) return true;
  const id = String(s.id || '');
  if (id.startsWith('__vc_intake') || id === '__vc_intake') return true;
  const name = String(s.name || '').toLowerCase();
  return (
    name.includes('chờ vc')
    || name.includes('chờ vận')
    || name.includes('chờ xác nhận')
    || name.includes('cho xac nhan')
    || name.includes('tiếp nhận')
    || name.includes('tiep nhan')
  );
}

function isShippingCol(s: KanbanStage): boolean {
  if (isIntakeCol(s) || isInstallVcStage(s) || isDeliveredCol(s)) return false;
  const name = String(s.name || '').toLowerCase();
  const slug = String(s.bucket_slug || s.slug || s.workflow_stage?.slug || '').toLowerCase();
  return (
    name.includes('đang vận chuyển')
    || name.includes('dang van chuyen')
    || name.includes('đang giao')
    || name.includes('dang giao')
    || slug === 'delivery'
    || slug === 'shipping'
    || (name.includes('vận chuyển') && !name.includes('chờ') && !name.includes('bàn giao') && !name.includes('đã giao'))
  );
}

/** Cột Đã giao — đã giao hàng, không còn «chờ / đang» VC. */
function isDeliveredCol(s: KanbanStage): boolean {
  const name = String(s.name || '').toLowerCase();
  const slug = String(s.bucket_slug || s.slug || s.workflow_stage?.slug || '').toLowerCase();
  return (
    slug === 'delivered'
    || slug === 'delivery_done'
    || name.includes('đã giao')
    || name.includes('da giao')
    || name.includes('giao xong')
  );
}

function isWarrantyCol(s: KanbanStage): boolean {
  const name = String(s.name || '').toLowerCase();
  const slug = String(s.bucket_slug || s.slug || s.workflow_stage?.slug || '').toLowerCase();
  return (
    slug === 'customer-care'
    || slug.includes('warranty')
    || slug.includes('issue')
    || name.includes('bảo hành')
    || name.includes('bao hanh')
    || name.includes('có vấn đề')
    || name.includes('co van de')
    || name.includes('vấn đề')
  );
}

/** Nghiệm thu / bàn giao cuối — sau lắp đặt hoặc sau đã giao. */
function isAcceptanceCol(s: KanbanStage): boolean {
  if (isWarrantyCol(s) || isDeliveredCol(s) || isIntakeCol(s)) return false;
  const name = String(s.name || '').toLowerCase();
  const slug = String(s.bucket_slug || s.slug || s.workflow_stage?.slug || '').toLowerCase();
  return (
    slug.includes('acceptance')
    || slug.includes('nghiem')
    || slug.includes('handover')
    || name.includes('nghiệm thu')
    || name.includes('nghiem thu')
    || (name.includes('bàn giao') && !name.includes('chờ') && !name.includes('chuyển'))
    || (name.includes('ban giao') && !name.includes('cho') && !name.includes('chuyen'))
  );
}

function isDoneCol(s: KanbanStage): boolean {
  const name = String(s.name || '').toLowerCase();
  const slug = String(s.bucket_slug || s.slug || '').toLowerCase();
  return (
    slug === 'completed'
    || name.includes('hoàn thành')
    || name.includes('hoàn tất')
    || name.includes('hoàn thiện')
    || name.includes('hoan thien')
  );
}

export type VcBoardKpis = {
  total: number;
  /** Số dự án thuộc tab Vận chuyển (cột không phải lắp đặt). */
  totalShipping: number;
  /** Số dự án thuộc tab Lắp đặt. */
  totalInstall: number;
  /** Chờ VC — số thẻ cột chờ/tiếp nhận. */
  intake: number;
  /** Đang vận chuyển. */
  shipping: number;
  /** Đã giao. */
  delivered: number;
  /** Đang lắp đặt. */
  installing: number;
  /** Có vấn đề / bảo hành. */
  warranty: number;
  /** Nghiệm thu · bàn giao. */
  acceptance: number;
  /** @deprecated alias — shipping + installing. */
  inProgress: number;
  /** Hoàn thiện / hoàn thành. */
  completed: number;
  overdue: number;
};

/** Key deep-link từ card Tổng quan → tab Dự án. */
export type VcKpiFocusKey =
  | 'intake'
  | 'shipping'
  | 'delivered'
  | 'installing'
  | 'warranty'
  | 'acceptance'
  | 'completed'
  | 'overdue';

export type VcStageBucket =
  | 'intake'
  | 'shipping'
  | 'delivered'
  | 'installing'
  | 'warranty'
  | 'acceptance'
  | 'completed';

/** Phân loại cột Kanban — khớp đếm KPI Tổng quan / pill Dự án. */
export function kpiBucketForStage(stage: KanbanStage): VcStageBucket {
  if (isDoneCol(stage)) return 'completed';
  if (isAcceptanceCol(stage)) return 'acceptance';
  if (isWarrantyCol(stage)) return 'warranty';
  if (isIntakeCol(stage)) return 'intake';
  if (isDeliveredCol(stage)) return 'delivered';
  if (isInstallVcStage(stage)) return 'installing';
  if (isShippingCol(stage)) return 'shipping';
  return 'shipping';
}

/** Index cột đầu tiên khớp KPI (không gồm overdue — dùng quickFilter). */
export function findStageIndexForKpiFocus(
  stages: KanbanStage[],
  key: Exclude<VcKpiFocusKey, 'overdue'>,
): number {
  return stages.findIndex((s) => kpiBucketForStage(s) === key);
}

export function computeVcBoardKpis(
  projects: ProductionProject[],
  stages: KanbanStage[] = [],
): VcBoardKpis {
  const nowMs = Date.now();
  let intake = 0;
  let shipping = 0;
  let delivered = 0;
  let installing = 0;
  let warranty = 0;
  let acceptance = 0;
  let completed = 0;
  let overdue = 0;
  let totalShipping = 0;
  let totalInstall = 0;

  if (stages.length) {
    const stageById = new Map(stages.map((s) => [String(s.id), s]));
    for (const p of projects) {
      if (projectIsDeadlineOverdue(p, nowMs)) overdue += 1;
      const colId = String(p.resolved_column_id || p.vc_kanban_column_id || '');
      const stage = colId ? stageById.get(colId) : undefined;

      if (!stage) {
        const status = String(p.status || '');
        if (projectIsIntake(p)) { intake += 1; totalShipping += 1; }
        else if (status === 'completed') { completed += 1; totalShipping += 1; }
        else if (status === 'warranty') { warranty += 1; totalShipping += 1; }
        else if (status === 'installing') { installing += 1; totalInstall += 1; }
        else { shipping += 1; totalShipping += 1; }
        continue;
      }

      if (isInstallVcStage(stage)) totalInstall += 1;
      else totalShipping += 1;

      const bucket = kpiBucketForStage(stage);
      if (bucket === 'completed') completed += 1;
      else if (bucket === 'acceptance') acceptance += 1;
      else if (bucket === 'warranty') warranty += 1;
      else if (bucket === 'intake') intake += 1;
      else if (bucket === 'delivered') delivered += 1;
      else if (bucket === 'installing') installing += 1;
      else shipping += 1;
    }
  } else {
    for (const p of projects) {
      const status = String(p.status || '');
      if (projectIsIntake(p)) {
        intake += 1;
        totalShipping += 1;
      } else if (status === 'completed') {
        completed += 1;
        totalShipping += 1;
      } else if (status === 'warranty') {
        warranty += 1;
        totalShipping += 1;
      } else if (status === 'installing') {
        installing += 1;
        totalInstall += 1;
      } else {
        shipping += 1;
        totalShipping += 1;
      }
      if (projectIsDeadlineOverdue(p, nowMs)) overdue += 1;
    }
  }

  return {
    total: projects.length,
    totalShipping,
    totalInstall,
    intake,
    shipping,
    delivered,
    installing,
    warranty,
    acceptance,
    inProgress: shipping + installing,
    completed,
    overdue,
  };
}

/** Dự án quá hạn (chưa hoàn tất), sắp theo hạn gần nhất. */
export function pickOverdueProjects(
  projects: ProductionProject[],
  limit = 8,
): ProductionProject[] {
  const nowMs = Date.now();
  return projects
    .filter((p) => projectIsDeadlineOverdue(p, nowMs))
    .map((p) => {
      const raw = p.deadline;
      const ts = raw ? startOfLocalDay(new Date(raw)).getTime() : Infinity;
      return { p, ts: Number.isFinite(ts) ? ts : Infinity };
    })
    .sort((a, b) => a.ts - b.ts)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Dự án sắp đến hạn (≤2 ngày), chưa quá hạn. */
export function pickSoonProjects(
  projects: ProductionProject[],
  limit = 5,
): ProductionProject[] {
  const nowMs = Date.now();
  const now = startOfLocalDay(new Date(nowMs)).getTime();
  const dayMs = 86400000;
  const scored: { p: ProductionProject; diff: number; ts: number }[] = [];
  for (const p of projects) {
    if (projectIsCompleted(p)) continue;
    if (projectIsDeadlineOverdue(p, nowMs)) continue;
    const raw = p.deadline;
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
