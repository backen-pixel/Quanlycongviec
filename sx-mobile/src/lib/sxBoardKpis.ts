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
  // Khớp web sxPipelineRevenue.projectIsShipped — không đếm status=shipping thuần.
  if (p.logistics_company_id || p.vc_kanban_column_id) {
    return true;
  }
  const st = String(p.status || '');
  return st === 'installing' || st === 'warranty' || st === 'completed';
}

export type SxStageKpiKey = 'producing' | 'awaiting_delivery' | 'shipped';

/**
 * ĐÃ GIAO THẬT — dùng cho chip trên thẻ (Đã xong / Đã giao). Khác `projectIsShipped` (dùng cho KPI): chỉ có
 * `vc_kanban_column_id` / `logistics_company_id` nghĩa là đã được ĐẨY SANG bảng vận chuyển (VC/LĐ «Dự án sắp tới»),
 * chưa phải đã giao, nên không tính. Đã giao khi: status lắp đặt / bảo hành / hoàn tất, hoặc đứng ở cột «đã giao»
 * hoặc cột hoàn thành / đã thu tiền.
 */
export function projectIsDelivered(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  const st = String(p.status || '');
  if (st === 'installing' || st === 'warranty' || st === 'completed') return true;
  const col = stageOf(p, stages, index || (stages.length ? buildKpiStageIndex(stages) : undefined));
  if (!col || col.bucket_slug === INTAKE_BUCKET) return false;
  if (sxColumnKpiKey(col) === 'shipped') return true;
  return Boolean(col.counts_as_completed_revenue || col.counts_as_collected_revenue);
}

/** Tên cột kiểu «ĐÃ GIAO…» / «giao xong» — khớp BE `isSxDeliveredStage`. */
function isDeliveredStage(stage: KanbanStage): boolean {
  const slug = String(stage.bucket_slug || stage.slug || '').toLowerCase().trim();
  if (slug === 'delivered' || slug === 'delivery_done') return true;
  const name = String(stage.name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
  return name.includes('da giao') || name.includes('giao xong');
}

/**
 * KPI Đang SX / Chờ VC / Đã VC của MỘT CỘT — khớp BE `sxColumnStageKpiKey`, thứ tự ưu tiên:
 * cột tiếp nhận → null; tick tay `dashboard_kpi` thắng tất cả; cờ bàn giao → chờ VC;
 * tên «đã giao» → đã VC; cờ hoàn thành/đã thu doanh thu → null (không thuộc nhóm nào);
 * còn lại → đang SX.
 */
export function sxColumnKpiKey(stage?: KanbanStage | null): SxStageKpiKey | null {
  if (!stage || stage.bucket_slug === INTAKE_BUCKET) return null;
  const explicit = String(stage.dashboard_kpi || '').trim();
  if (explicit === 'producing' || explicit === 'awaiting_delivery' || explicit === 'shipped') {
    return explicit;
  }
  if (stage.is_handover_to_logistics) return 'awaiting_delivery';
  if (isDeliveredStage(stage)) return 'shipped';
  if (stage.counts_as_completed_revenue || stage.counts_as_collected_revenue) return null;
  return 'producing';
}

/** Đã vận chuyển theo CỘT (tick tay / tên «đã giao») — bổ sung cho `projectIsShipped` theo dữ liệu dự án. */
function columnSaysShipped(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  return sxColumnKpiKey(stageOf(p, stages, index)) === 'shipped';
}

export function projectIsAwaitingDelivery(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  if (projectIsShipped(p)) return false;
  return sxColumnKpiKey(stageOf(p, stages, index)) === 'awaiting_delivery';
}

/** Hoàn tất: trạng thái `completed`, hoặc đang đứng ở cột đã thu tiền (cờ `counts_as_collected_revenue`). */
export function projectIsCompleted(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): boolean {
  if (String(p.status || '') === 'completed') return true;
  const col = stageOf(p, stages, index);
  return Boolean(col && col.bucket_slug !== INTAKE_BUCKET && col.counts_as_collected_revenue);
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
  const col = stageOf(p, stages, idx);
  // Chưa vào cột nào: giữ hành vi cũ (tính là đang SX) — BE bỏ qua nhưng app luôn đếm.
  if (!col) return !countsAsCompletedRevenue(p, stages, idx);
  // Tick tay / cờ bàn giao / tên «đã giao» / cờ hoàn thành-đã thu: dùng chung một quy tắc với BE.
  return sxColumnKpiKey(col) === 'producing';
}

/** Chờ vào xưởng — khớp web `intake_pending`: `sx_intake`. */
export function projectIsIntake(p: ProductionProject): boolean {
  return Boolean(p.sx_intake);
}

const HUCABI_COMPANY_ID = '18c2563f-3495-498d-8199-23200c9f420e';

function isHucabiSameDayPast1730(raw: string | Date, companyId: string | null | undefined, nowMs: number): boolean {
  if (String(companyId || '') !== HUCABI_COMPANY_ID) return false;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return false;
  const dueYmd = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const nowYmd = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  if (dueYmd !== nowYmd) return false;
  const endMs = new Date(`${dueYmd}T17:30:00+07:00`).getTime();
  return nowMs > endMs;
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Cột đã tắt hạn — khớp web `sxDone` và BE `isSxPipelineStageNoDeadline`: CHỈ
 * «Bỏ hạn» và «Bàn giao VC». Không loại theo sla_days hay «Đã công», vì KPI Quá
 * hạn của web và summary BE cũng không loại — loại thêm thì danh sách trên app
 * ít hơn hẳn con số KPI ngay bên cạnh.
 */
function stageClearsDeadline(stage?: KanbanStage | null): boolean {
  return Boolean(stage?.clears_deadline || stage?.is_handover_to_logistics);
}

/**
 * Hạn hiệu lực của dự án SX — khớp BE `sxDeadlineRaw` (commit c272a759):
 * CHỈ lấy deadline đặt trên thẻ. Không có hạn thẻ thì không vào cột hạn nào.
 * Trước đây còn rơi sang hoàn thiện SX → hạn SX → ngày giao → hạn chung; web và BE
 * đã bỏ, app phải bỏ theo nếu không số «Quá hạn» hai bên lệch nhau.
 */
export function sxEffectiveDeadlineRaw(
  p: ProductionProject,
  stage?: KanbanStage | null,
): string | null {
  if (stageClearsDeadline(stage)) return null;
  return p.sx_kanban_deadline_at || null;
}

/** Hạn hiệu lực khi chỉ có danh sách cột (màn hình không giữ stage của thẻ). */
export function sxProjectDeadlineRaw(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
): string | null {
  return sxEffectiveDeadlineRaw(p, stageOf(p, stages, index));
}

/** Quá hạn KPI — khớp web `resolveSxDeadlineBucket(...).bucket === 'overdue'`. */
export function projectIsDeadlineOverdue(
  p: ProductionProject,
  stages: KanbanStage[],
  index?: KpiStageIndex,
  todayMs = Date.now(),
): boolean {
  const col = stageOf(p, stages, index);
  const raw = sxEffectiveDeadlineRaw(p, col);
  if (!raw) return false;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return false;
  const today = startOfLocalDay(new Date(todayMs));
  if (startOfLocalDay(t).getTime() < today.getTime()) return true;
  return isHucabiSameDayPast1730(raw, p.company_id, todayMs);
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
    if (projectIsShipped(p) || columnSaysShipped(p, stages, index)) shipped += 1;
    // Hoàn tất: status `completed` (như web) HOẶC đứng ở cột đã thu tiền.
    if (projectIsCompleted(p, stages, index)) completed += 1;
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

/**
 * Id các dự án quá hạn theo đúng quy tắc KPI — build index cột một lần cho cả
 * danh sách (lọc từng thẻ sẽ dựng lại index mỗi lần gọi).
 */
export function sxOverdueProjectIds(
  projects: ProductionProject[],
  stages: KanbanStage[],
  todayMs = Date.now(),
): Set<string> {
  const index = stages.length ? buildKpiStageIndex(stages) : undefined;
  const out = new Set<string>();
  for (const p of projects) {
    const hit = stages.length
      ? projectIsDeadlineOverdue(p, stages, index, todayMs)
      : Boolean(p.is_overdue);
    if (hit) out.add(String(p.id));
  }
  return out;
}

/** Chip lọc theo hạn xử lý ở danh sách dự án. */
export type SxDueFilter = '' | 'overdue' | 'today' | 'this_week' | 'next_week';

/**
 * Id các dự án thuộc một nhóm hạn. Dùng đúng nguồn hạn của KPI (`sxProjectDeadlineRaw`):
 * dự án không có hạn thẻ hoặc đứng ở cột tắt hạn thì không vào nhóm nào.
 *
 * «Quá hạn» dùng thẳng `projectIsDeadlineOverdue` nên khớp số KPI. Các nhóm còn lại so
 * theo NGÀY (giờ máy): hôm nay; tuần này = thứ Hai → Chủ nhật của tuần chứa hôm nay;
 * tuần sau = tuần liền kề. Tuần này có thể chứa cả việc đã quá hạn từ đầu tuần.
 */
export function sxDueBucketProjectIds(
  projects: ProductionProject[],
  stages: KanbanStage[],
  bucket: Exclude<SxDueFilter, ''>,
  todayMs = Date.now(),
): Set<string> {
  if (bucket === 'overdue') return sxOverdueProjectIds(projects, stages, todayMs);
  const index = stages.length ? buildKpiStageIndex(stages) : undefined;
  const today = startOfLocalDay(new Date(todayMs));
  // getDay(): CN=0 → quy về T2=0 … CN=6.
  const sinceMonday = (today.getDay() + 6) % 7;
  // Dựng mốc bằng ngày lịch (không cộng ms) để tuần có đổi giờ không bị lệch.
  const dayAt = (offset: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset).getTime();
  const [lo, hi] = bucket === 'today'
    ? [dayAt(0), dayAt(1)]
    : bucket === 'this_week'
      ? [dayAt(-sinceMonday), dayAt(-sinceMonday + 7)]
      : [dayAt(-sinceMonday + 7), dayAt(-sinceMonday + 14)];
  const out = new Set<string>();
  for (const p of projects) {
    const raw = stages.length
      ? sxProjectDeadlineRaw(p, stages, index)
      : (p.sx_kanban_deadline_at || null);
    if (!raw) continue;
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) continue;
    const day = startOfLocalDay(t).getTime();
    if (day >= lo && day < hi) out.add(String(p.id));
  }
  return out;
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
      if (stages.length) return projectIsDeadlineOverdue(p, stages, index, nowMs);
      return Boolean(p.is_overdue);
    })
    .map((p) => {
      const raw = stages.length
        ? sxProjectDeadlineRaw(p, stages, index)
        : (p.sx_kanban_deadline_at || null);
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
    const raw = stages.length
      ? sxProjectDeadlineRaw(p, stages, index)
      : (p.sx_kanban_deadline_at || null);
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
