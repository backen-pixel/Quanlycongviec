import { api } from '../api/client';
import type { CrmDealSummary, CrmTask, KanbanStage, PersonRef, ProductionProjectDetail, ProjectActivity } from '../types';
import { mapProjectRow } from './productionApi';
import {
  QUERY_TTL_LONG,
  QUERY_TTL_MEDIUM,
  cachedQuery,
  invalidateQuery,
  invalidateQueryPrefix,
} from './queryCache';

/** Prefix key cache — dùng chung cho invalidate sau khi mutate. */
const K_DETAIL = 'sx:projectDetail:';
const K_DEAL_TASKS = 'sx:dealTasks:';
const K_ACTIVITIES = 'sx:projectActivities:';
const K_PROJECT_DEAL = 'sx:projectDealId:';

/** Gọi sau khi sửa dự án / công việc để lần đọc kế tiếp lấy dữ liệu mới. */
export function invalidateProjectDetailCache(projectId?: string | null): void {
  if (projectId) {
    invalidateQuery(`${K_DETAIL}${projectId}`);
    invalidateQuery(`${K_ACTIVITIES}${projectId}`);
  } else {
    invalidateQueryPrefix(K_DETAIL);
    invalidateQueryPrefix(K_ACTIVITIES);
  }
}

export function invalidateDealTasksCache(dealId?: string | null): void {
  if (dealId) invalidateQueryPrefix(`${K_DEAL_TASKS}${dealId}:`);
  else invalidateQueryPrefix(K_DEAL_TASKS);
}

/** Tham số đọc dùng chung: cache-first, force khi user kéo làm mới. */
export type ReadOptions = { force?: boolean; signal?: AbortSignal };

export function isCrmProductionTaskDone(status: string): boolean {
  return status === 'completed' || status === 'done';
}

export function calcCrmProductionTaskProgress(
  tasks: Pick<CrmTask, 'status'>[],
  fallbackPercent = 0,
): { done: number; total: number; percent: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => isCrmProductionTaskDone(t.status)).length;
  const percent = total ? Math.round((done / total) * 100) : Math.round(fallbackPercent);
  return { done, total, percent };
}

function mapPerson(raw: unknown): PersonRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  return {
    id: p.id != null ? String(p.id) : undefined,
    full_name: p.full_name != null ? String(p.full_name) : null,
    avatar: p.avatar != null ? String(p.avatar) : null,
    email: p.email != null ? String(p.email) : null,
  };
}

function mapKanbanStage(raw: Record<string, unknown>, index: number): KanbanStage {
  const wfStage = (raw.workflow_stage || {}) as { id?: string; slug?: string };
  const slugRaw = raw.slug != null && String(raw.slug).trim()
    ? String(raw.slug)
    : (wfStage.slug != null && String(wfStage.slug).trim() ? String(wfStage.slug) : null);
  return {
    id: String(raw.id || ''),
    name: String(raw.name || `Cột ${index + 1}`),
    color: (raw.color as string) ?? null,
    icon: (raw.icon as string) ?? null,
    order_index: Number(raw.order_index ?? index),
    slug: slugRaw,
    bucket_slug: (raw.bucket_slug as string) ?? null,
    workflow_stage_id: (raw.workflow_stage_id as string) ?? wfStage.id ?? null,
    is_handover_to_logistics: Boolean(raw.is_handover_to_logistics),
  };
}

function mapCrmDeal(raw: Record<string, unknown>): CrmDealSummary {
  return {
    id: String(raw.id || ''),
    code: raw.code != null ? String(raw.code) : null,
    title: raw.title != null ? String(raw.title) : null,
    type: raw.type != null ? String(raw.type) : null,
    company_id: raw.company_id != null ? String(raw.company_id) : null,
    assignee: mapPerson(raw.assignee),
    lead_owner: mapPerson(raw.lead_owner),
    sx_pipeline_stage: raw.sx_pipeline_stage && typeof raw.sx_pipeline_stage === 'object'
      ? {
          id: (raw.sx_pipeline_stage as Record<string, unknown>).id != null
            ? String((raw.sx_pipeline_stage as Record<string, unknown>).id)
            : undefined,
          name: (raw.sx_pipeline_stage as Record<string, unknown>).name != null
            ? String((raw.sx_pipeline_stage as Record<string, unknown>).name)
            : null,
        }
      : null,
  };
}

/** Ưu tiên deal type=deal; fallback lead/deal đầu tiên. */
export function pickPrimaryCrmDealId(deals?: CrmDealSummary[] | null): string | null {
  if (!deals?.length) return null;
  const asDeal = deals.find((d) => String(d.type || '').toLowerCase() === 'deal');
  if (asDeal?.id) return String(asDeal.id);
  const notLead = deals.find((d) => {
    const t = String(d.type || '').toLowerCase();
    return t && t !== 'lead';
  });
  if (notLead?.id) return String(notLead.id);
  return String(deals[0].id || '') || null;
}

function mapCrmTask(raw: Record<string, unknown>): CrmTask {
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((a) => mapPerson(a)).filter(Boolean) as PersonRef[]
    : [];
  const deadline = raw.deadline != null ? String(raw.deadline) : null;
  const prodStage = raw.production_pipeline_stage && typeof raw.production_pipeline_stage === 'object'
    ? (raw.production_pipeline_stage as Record<string, unknown>)
    : null;
  return {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    status: String(raw.status || 'pending'),
    stage_slug: raw.stage_slug != null ? String(raw.stage_slug) : null,
    production_pipeline_stage_id: raw.production_pipeline_stage_id != null
      ? String(raw.production_pipeline_stage_id)
      : (prodStage?.id != null ? String(prodStage.id) : null),
    order_index: raw.order_index != null ? Number(raw.order_index) : undefined,
    deadline,
    due_date: deadline ?? (raw.due_date != null ? String(raw.due_date) : null),
    created_at: raw.created_at != null ? String(raw.created_at) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
    description: raw.description != null ? String(raw.description) : null,
    priority: raw.priority != null ? String(raw.priority) : null,
    file_count: Number(raw.file_count ?? 0),
    note_count: Number(raw.note_count ?? 0),
    attachment_count: Number(raw.attachment_count ?? 0),
    assignee: mapPerson(raw.assignee),
    assignees,
    creator: mapPerson(raw.creator),
    pipeline_stage: raw.pipeline_stage && typeof raw.pipeline_stage === 'object'
      ? {
          id: (raw.pipeline_stage as Record<string, unknown>).id != null
            ? String((raw.pipeline_stage as Record<string, unknown>).id)
            : undefined,
          name: (raw.pipeline_stage as Record<string, unknown>).name != null
            ? String((raw.pipeline_stage as Record<string, unknown>).name)
            : null,
          order_index: (raw.pipeline_stage as Record<string, unknown>).order_index != null
            ? Number((raw.pipeline_stage as Record<string, unknown>).order_index)
            : undefined,
        }
      : null,
    production_pipeline_stage: prodStage
      ? {
          id: prodStage.id != null ? String(prodStage.id) : undefined,
          name: prodStage.name != null ? String(prodStage.name) : null,
          order_index: prodStage.order_index != null ? Number(prodStage.order_index) : undefined,
          color: prodStage.color != null ? String(prodStage.color) : null,
          icon: prodStage.icon != null ? String(prodStage.icon) : null,
        }
      : null,
  };
}

/** Thứ tự giai đoạn SX — khớp CRMTasksTab.jsx SX_ORDER_STAGES */
export const SX_STAGE_ORDER: { slug: string; label: string; icon: string; color: string }[] = [
  { slug: 'sx_tiep_nhan', label: 'Tiếp nhận', icon: '1', color: '#2563EB' },
  { slug: 'sx_thiet_ke_ke_hoach', label: 'Thiết kế và lên kế hoạch', icon: '2', color: '#7C3AED' },
  { slug: 'sx_kiem_tra_cheo', label: 'Kiểm tra chéo', icon: '3', color: '#0EA5E9' },
  { slug: 'sx_vat_tu', label: 'Vật tư', icon: '4', color: '#D97706' },
  { slug: 'sx_san_xuat_thung', label: 'Sản xuất thùng', icon: '5', color: '#059669' },
  { slug: 'sx_san_xuat_alu', label: 'Sản xuất alu', icon: '6', color: '#0891B2' },
  { slug: 'sx_hoan_thien', label: 'Hoàn thiện', icon: '7', color: '#16A34A' },
  { slug: 'sx_dong_goi', label: 'Đóng gói', icon: '8', color: '#EA580C' },
  { slug: 'sx_giao_hang', label: 'Giao hàng', icon: '9', color: '#DC2626' },
];

const SX_STAGE_INDEX = new Map(SX_STAGE_ORDER.map((s, i) => [s.slug, i]));

export const SX_TASK_ORPHAN_STAGE_KEY = '__sx_orphan_pipeline__';

export type CrmTaskStageGroup = {
  key: string;
  label: string;
  color?: string | null;
  icon?: string | null;
  tasks: CrmTask[];
  openCount: number;
  doneCount: number;
};

export function getSxStageVisual(slug?: string | null): { icon: string; color: string } {
  const normalized = normalizeCrmTaskStageSlug(slug);
  const hit = SX_STAGE_ORDER.find((s) => s.slug === normalized);
  return { icon: hit?.icon || '•', color: hit?.color || '#64748B' };
}

/** Chuẩn hoá stage_slug (bỏ hậu tố uuid pipeline) — khớp web CRMTasksTab */
export function normalizeCrmTaskStageSlug(slug?: string | null): string {
  const s = String(slug || '').trim();
  if (!s) return '_other';
  if (s.startsWith('sx_')) {
    return s.replace(/[-_][a-f0-9]{8}$/i, '');
  }
  return s;
}

function normalizeSxStageText(raw?: string | null): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function legacySxSlugFromStageName(nameRaw?: string | null): string | null {
  const t = normalizeSxStageText(nameRaw);
  if (!t) return null;
  if (t.includes('tiep nhan')) return 'sx_tiep_nhan';
  if (t.includes('thiet ke') || t.includes('len ke hoach')) return 'sx_thiet_ke_ke_hoach';
  if (t.includes('kiem tra cheo')) return 'sx_kiem_tra_cheo';
  if (t.includes('vat tu')) return 'sx_vat_tu';
  if (t.includes('san xuat thung')) return 'sx_san_xuat_thung';
  if (t.includes('san xuat alu')) return 'sx_san_xuat_alu';
  if (t.includes('hoan thien')) return 'sx_hoan_thien';
  if (t.includes('dong goi')) return 'sx_dong_goi';
  if (t.includes('giao hang')) return 'sx_giao_hang';
  return null;
}

function sxSlugForPipelineStage(stage: KanbanStage): string | null {
  const bucket = String(stage.bucket_slug || '').trim();
  if (bucket) return `sx_${bucket}`;
  const legacy = legacySxSlugFromStageName(stage.name);
  if (legacy) return legacy;
  if (stage.id) return `sx_pl_${String(stage.id).slice(0, 8)}`;
  return null;
}

function buildLegacySxSlugToStageId(stages: KanbanStage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of stages || []) {
    if (!s?.id) continue;
    const slug = sxSlugForPipelineStage(s);
    if (slug && !map.has(slug)) map.set(slug, String(s.id));
  }
  return map;
}

/** Gom task SX vào cột production_pipeline_stages.id — khớp web CRMTasksTab. */
export function resolveSxTaskProductionStageId(
  task: CrmTask,
  sxStages: KanbanStage[],
): string | null {
  const stages = sxStages || [];
  const validIds = new Set(stages.map((s) => String(s.id)));
  const pid = task.production_pipeline_stage_id || task.production_pipeline_stage?.id;
  if (pid) return validIds.has(String(pid)) ? String(pid) : null;

  const legacyMap = buildLegacySxSlugToStageId(stages);
  const slug = String(task.stage_slug || '').trim();
  if (slug && legacyMap.has(slug)) return legacyMap.get(slug) || null;
  if (slug.startsWith('sx_pl_')) {
    const prefix = slug.slice(6);
    const hit = stages.find((s) => s?.id && String(s.id).startsWith(prefix));
    if (hit && validIds.has(String(hit.id))) return String(hit.id);
  }
  return null;
}

function sortTasksInStage(tasks: CrmTask[]): CrmTask[] {
  return [...tasks].sort((a, b) => {
    const oa = a.order_index ?? 0;
    const ob = b.order_index ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
  });
}

function stageGroupSortIndex(key: string, sampleTask?: CrmTask): number {
  const normalized = normalizeCrmTaskStageSlug(key);
  const sxIdx = SX_STAGE_INDEX.get(normalized);
  if (sxIdx != null) return sxIdx;
  const pipeOrder = sampleTask?.production_pipeline_stage?.order_index
    ?? sampleTask?.pipeline_stage?.order_index;
  if (pipeOrder != null && Number.isFinite(pipeOrder)) return 100 + pipeOrder;
  return 900;
}

export function resolveCrmTaskStageLabel(task: CrmTask): string {
  if (task.production_pipeline_stage?.name) return task.production_pipeline_stage.name;
  if (task.pipeline_stage?.name) return task.pipeline_stage.name;
  const slug = normalizeCrmTaskStageSlug(task.stage_slug);
  const fromOrder = SX_STAGE_ORDER.find((s) => s.slug === slug);
  if (fromOrder) return fromOrder.label;
  if (!slug || slug === '_other') return 'Khác';
  if (slug === 'sx_other') return 'Khác';
  // Không hiện nhãn dạng «Pl 5ae60298»
  if (/^sx_pl_/i.test(String(task.stage_slug || '')) || /^pl_/i.test(slug)) return 'Khác';
  if (slug.startsWith('sx_')) {
    return slug
      .replace(/^sx_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return slug.replace(/_/g, ' ');
}

/**
 * Gom nhiệm vụ theo giai đoạn pipeline SX (ưu tiên), fallback slug legacy.
 * Khớp CRM: mỗi cột pipeline = 1 nhóm + đếm xong/còn lại.
 */
export function groupCrmTasksByStage(
  tasks: CrmTask[],
  sxStages: KanbanStage[] = [],
): CrmTaskStageGroup[] {
  const stages = [...(sxStages || [])].sort(
    (a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0),
  );

  if (stages.length) {
    const map = new Map<string, CrmTask[]>();
    for (const s of stages) map.set(String(s.id), []);

    for (const task of tasks) {
      const key = resolveSxTaskProductionStageId(task, stages);
      if (key && map.has(key)) {
        map.get(key)!.push(task);
      } else {
        if (!map.has(SX_TASK_ORPHAN_STAGE_KEY)) map.set(SX_TASK_ORPHAN_STAGE_KEY, []);
        map.get(SX_TASK_ORPHAN_STAGE_KEY)!.push(task);
      }
    }

    const sections: CrmTaskStageGroup[] = [];
    for (const s of stages) {
      const list = sortTasksInStage(map.get(String(s.id)) || []);
      if (!list.length) continue;
      sections.push({
        key: String(s.id),
        label: s.name || 'Giai đoạn',
        color: s.color,
        icon: s.icon,
        tasks: list,
        openCount: list.filter((t) => !isCrmProductionTaskDone(t.status)).length,
        doneCount: list.filter((t) => isCrmProductionTaskDone(t.status)).length,
      });
    }
    const orphan = sortTasksInStage(map.get(SX_TASK_ORPHAN_STAGE_KEY) || []);
    if (orphan.length) {
      sections.push({
        key: SX_TASK_ORPHAN_STAGE_KEY,
        label: 'Khác',
        color: '#B45309',
        tasks: orphan,
        openCount: orphan.filter((t) => !isCrmProductionTaskDone(t.status)).length,
        doneCount: orphan.filter((t) => isCrmProductionTaskDone(t.status)).length,
      });
    }
    return sections;
  }

  // Không có pipeline stages → gom theo slug (legacy).
  const map = new Map<string, { label: string; tasks: CrmTask[]; sample?: CrmTask }>();
  for (const task of tasks) {
    const key = normalizeCrmTaskStageSlug(task.stage_slug);
    if (!map.has(key)) {
      map.set(key, { label: resolveCrmTaskStageLabel(task), tasks: [], sample: task });
    }
    map.get(key)!.tasks.push(task);
  }
  return [...map.entries()]
    .sort(([keyA, a], [keyB, b]) => {
      const ia = stageGroupSortIndex(keyA, a.sample);
      const ib = stageGroupSortIndex(keyB, b.sample);
      if (ia !== ib) return ia - ib;
      return keyA.localeCompare(keyB, 'vi');
    })
    .map(([key, v]) => {
      const list = sortTasksInStage(v.tasks);
      return {
        key,
        label: v.label,
        color: getSxStageVisual(key).color,
        tasks: list,
        openCount: list.filter((t) => !isCrmProductionTaskDone(t.status)).length,
        doneCount: list.filter((t) => isCrmProductionTaskDone(t.status)).length,
      };
    });
}

export async function fetchProductionProjectDetail(
  projectId: string,
  opts?: ReadOptions,
): Promise<ProductionProjectDetail> {
  return cachedQuery<ProductionProjectDetail>({
    key: `${K_DETAIL}${projectId}`,
    ttlMs: QUERY_TTL_MEDIUM,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: () => fetchProductionProjectDetailRaw(projectId),
  });
}

async function fetchProductionProjectDetailRaw(projectId: string): Promise<ProductionProjectDetail> {
  const { data } = await api.get<{ project?: Record<string, unknown> }>(
    `/production/projects/${projectId}`,
  );
  const raw = (data?.project ?? data) as Record<string, unknown>;
  const base = mapProjectRow(raw);
  const customer = (raw.customer || {}) as Record<string, unknown>;
  const company = (raw.company || {}) as Record<string, unknown>;
  const workshopType = (raw.workshop_type || {}) as Record<string, unknown>;
  const currentStage = (raw.current_stage || {}) as Record<string, unknown>;
  const sxStages = Array.isArray(raw.sxKanbanStages)
    ? raw.sxKanbanStages.map((s, i) => mapKanbanStage(s as Record<string, unknown>, i))
    : [];
  const crmDeals = Array.isArray(raw.crmDeals)
    ? raw.crmDeals.map((d) => mapCrmDeal(d as Record<string, unknown>))
    : [];

  return {
    ...base,
    description: raw.description != null ? String(raw.description) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
    productionTaskProgress: Number(raw.productionTaskProgress ?? raw.taskProgress ?? base.progress ?? 0),
    taskProgress: Number(raw.taskProgress ?? base.progress ?? 0),
    sxKanbanStages: sxStages,
    crmDeals,
    sharedDocuments: Array.isArray(raw.sharedDocuments) ? raw.sharedDocuments : [],
    customer: {
      full_name: customer.full_name != null ? String(customer.full_name) : null,
      phone: customer.phone != null ? String(customer.phone) : null,
      email: customer.email != null ? String(customer.email) : null,
      address: customer.address != null ? String(customer.address) : null,
    },
    company: company.id || company.name
      ? {
          id: company.id != null ? String(company.id) : undefined,
          name: company.name != null ? String(company.name) : undefined,
          short_name: company.short_name != null ? String(company.short_name) : null,
        }
      : null,
    workshop_type: workshopType.id || workshopType.name
      ? { id: workshopType.id != null ? String(workshopType.id) : undefined, name: workshopType.name != null ? String(workshopType.name) : null }
      : null,
    sales_person: mapPerson(raw.sales_person),
    project_manager: mapPerson(raw.project_manager),
    supervisor: mapPerson(raw.supervisor),
    production_person: mapPerson(raw.production_person),
    shipping_person: mapPerson(raw.shipping_person),
    care_person: mapPerson(raw.care_person),
    current_stage: currentStage.id || currentStage.name
      ? {
          id: currentStage.id != null ? String(currentStage.id) : undefined,
          slug: currentStage.slug != null ? String(currentStage.slug) : undefined,
          name: currentStage.name != null ? String(currentStage.name) : undefined,
          color: currentStage.color != null ? String(currentStage.color) : null,
        }
      : null,
  };
}

export async function fetchCrmDealTasks(
  dealId: string,
  opts?: ReadOptions & { workshopTypeId?: string | null },
): Promise<CrmTask[]> {
  const workshopTypeId = opts?.workshopTypeId ? String(opts.workshopTypeId) : '';
  return cachedQuery<CrmTask[]>({
    key: `${K_DEAL_TASKS}${dealId}:${workshopTypeId}`,
    ttlMs: QUERY_TTL_MEDIUM,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: async () => {
      const params: Record<string, string> = { task_scope: 'production' };
      if (workshopTypeId) params.workshop_type_id = workshopTypeId;
      const { data } = await api.get<unknown>(`/crm/leads/${dealId}/tasks`, { params });
      const list = Array.isArray(data) ? data : [];
      return list.map((row) => mapCrmTask(row as Record<string, unknown>));
    },
  });
}

export async function fetchProjectActivities(
  projectId: string,
  opts?: ReadOptions,
): Promise<ProjectActivity[]> {
  return cachedQuery<ProjectActivity[]>({
    key: `${K_ACTIVITIES}${projectId}`,
    ttlMs: QUERY_TTL_MEDIUM,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: () => fetchProjectActivitiesRaw(projectId),
  });
}

async function fetchProjectActivitiesRaw(projectId: string): Promise<ProjectActivity[]> {
  try {
    const { data } = await api.get<{ activities?: unknown[] }>(`/projects/${projectId}/activities`);
    const list = Array.isArray(data?.activities) ? data.activities : [];
    return list.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id || ''),
        title: r.title != null ? String(r.title) : null,
        content: r.content != null ? String(r.content) : null,
        created_at: String(r.created_at || ''),
        user: mapPerson(r.user),
      };
    });
  } catch {
    return [];
  }
}

export async function fetchDealIdForProject(
  projectId: string,
  opts?: ReadOptions,
): Promise<string | null> {
  return cachedQuery<string | null>({
    key: `${K_PROJECT_DEAL}${projectId}`,
    // Mapping dự án → deal gần như không đổi trong một phiên.
    ttlMs: QUERY_TTL_LONG,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: () => fetchDealIdForProjectRaw(projectId),
  });
}

async function fetchDealIdForProjectRaw(projectId: string): Promise<string | null> {
  try {
    const { data } = await api.get<{ orders?: { fulfillment_lead_id?: string }[] }>(
      `/projects/${projectId}/orders`,
    );
    const orders = data?.orders || [];
    const fid = orders.find((o) => o?.fulfillment_lead_id)?.fulfillment_lead_id;
    return fid ? String(fid) : null;
  } catch {
    return null;
  }
}

/** Cập nhật ngày dự án (đồng bộ web PUT /projects/:id). */
export async function updateProjectDates(
  projectId: string,
  patch: Partial<{
    order_date: string | null;
    delivery_date: string | null;
    deadline: string | null;
    production_deadline: string | null;
  }>,
): Promise<void> {
  const body: Record<string, string | null> = {};
  (['order_date', 'delivery_date', 'deadline', 'production_deadline'] as const).forEach((k) => {
    if (patch[k] !== undefined) body[k] = patch[k] as string | null;
  });
  // Giống CRM web: lưu ngày giao hàng cũng ghi production_deadline
  if (patch.delivery_date !== undefined) {
    body.production_deadline = patch.delivery_date;
  }
  await api.put(`/projects/${projectId}`, body);
  invalidateProjectDetailCache(projectId);
}

/**
 * Cập nhật giá trị SX / tiền cọc — khớp web PUT /projects/:id.
 * null hoặc ≤0 → xóa (null trên DB). Công nợ = SX − cọc (tính phía client).
 */
export async function updateProjectMoney(
  projectId: string,
  patch: Partial<{ production_value: number | null; deposit_amount: number | null }>,
): Promise<void> {
  const body: Record<string, number | null> = {};
  if (patch.production_value !== undefined) body.production_value = patch.production_value;
  if (patch.deposit_amount !== undefined) body.deposit_amount = patch.deposit_amount;
  await api.put(`/projects/${projectId}`, body);
  invalidateProjectDetailCache(projectId);
}

export function taskDeadline(task: CrmTask): string | null {
  return task.deadline || task.due_date || null;
}

export async function updateCrmTask(
  dealId: string,
  taskId: string,
  updates: Record<string, unknown>,
): Promise<CrmTask> {
  const { data } = await api.put<Record<string, unknown>>(`/crm/leads/${dealId}/tasks/${taskId}`, updates);
  invalidateDealTasksCache(dealId);
  // Tránh vòng import với workTasksApi — cùng prefix cache ở queryCache.
  invalidateQueryPrefix('sx:workTasks:');
  invalidateQueryPrefix('sx:workStats:');
  return mapCrmTask(data || { id: taskId, ...updates });
}

export async function deleteCrmTask(dealId: string, taskId: string): Promise<void> {
  await api.delete(`/crm/leads/${dealId}/tasks/${taskId}`);
  invalidateDealTasksCache(dealId);
}

export async function updateCrmTaskNotes(
  dealId: string,
  taskId: string,
  notes: string | null,
): Promise<CrmTask> {
  const { data } = await api.put<Record<string, unknown>>(`/crm/leads/${dealId}/tasks/${taskId}/notes`, {
    notes,
  });
  invalidateDealTasksCache(dealId);
  return mapCrmTask(data || { id: taskId, notes });
}

export type TaskAttachment = {
  id: string;
  name?: string | null;
  doc_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  notes?: string | null;
};

export async function fetchCrmTaskAttachments(dealId: string, taskId: string): Promise<TaskAttachment[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/tasks/${taskId}/attachments`);
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id || ''),
      name: r.name != null ? String(r.name) : null,
      doc_type: r.doc_type != null ? String(r.doc_type) : null,
      file_url: r.file_url != null ? String(r.file_url) : null,
      file_name: r.file_name != null ? String(r.file_name) : null,
      mime_type: r.mime_type != null ? String(r.mime_type) : null,
      notes: r.notes != null ? String(r.notes) : null,
    };
  });
}

export async function deleteCrmTaskAttachment(
  dealId: string,
  taskId: string,
  attachmentId: string,
): Promise<void> {
  await api.delete(`/crm/leads/${dealId}/tasks/${taskId}/attachments/${attachmentId}`);
  invalidateDealTasksCache(dealId);
}

export async function uploadCrmTaskFiles(
  dealId: string,
  taskId: string,
  files: { uri: string; name: string; mime: string }[],
): Promise<void> {
  const { postMultipart } = await import('../api/client');
  const form = new FormData();
  for (const f of files) {
    form.append('files', { uri: f.uri, name: f.name, type: f.mime } as unknown as Blob);
  }
  const { data: up } = await postMultipart<{
    files: { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }[];
  }>('/upload', form);
  const uploaded = up?.files || [];
  const items = uploaded
    .filter((u) => u.file_url)
    .map((upf) => ({
      name: (upf.file_name || 'Tệp').replace(/\.[^.]+$/, ''),
    doc_type: (upf.mime_type || '').startsWith('image/')
      ? 'image'
      : (upf.mime_type || '').startsWith('video/')
        ? 'video'
        : 'other',
      file_url: upf.file_url,
      file_name: upf.file_name,
      file_size: upf.file_size,
      mime_type: upf.mime_type,
    }));
  if (!items.length) throw new Error('Upload không trả về file_url');
  await api.post(`/crm/leads/${dealId}/tasks/${taskId}/attachments/bulk`, { items });
  invalidateDealTasksCache(dealId);
}

/** Danh bạ giao việc — dữ liệu tham chiếu, đổi rất ít nên cache dài. */
export async function fetchUsersForAssign(opts?: ReadOptions): Promise<PersonRef[]> {
  return cachedQuery<PersonRef[]>({
    key: 'sx:usersForAssign',
    ttlMs: QUERY_TTL_LONG,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: async () => {
      const { data } = await api.get<unknown>('/users');
      const list = Array.isArray(data) ? data : [];
      return list.map((row) => mapPerson(row)).filter(Boolean) as PersonRef[];
    },
  });
}

export type LeadMember = { user_id: string; role?: string; user?: PersonRef | null };

export type ProjectDocument = {
  id: string;
  name?: string | null;
  doc_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  notes?: string | null;
  created_at?: string | null;
  creator?: PersonRef | null;
  uploader?: PersonRef | null;
  is_from_task?: boolean;
};

export type ProjectTaskFile = {
  id: string;
  file_name?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
  task?: { id?: string; title?: string | null } | null;
  uploader?: PersonRef | null;
};

function mapProjectDocument(row: Record<string, unknown>): ProjectDocument {
  return {
    id: String(row.id || ''),
    name: row.name != null ? String(row.name) : null,
    doc_type: row.doc_type != null ? String(row.doc_type) : null,
    file_url: row.file_url != null ? String(row.file_url) : null,
    file_name: row.file_name != null ? String(row.file_name) : null,
    mime_type: row.mime_type != null ? String(row.mime_type) : null,
    notes: row.notes != null ? String(row.notes) : null,
    created_at: row.created_at != null ? String(row.created_at) : null,
    creator: mapPerson(row.creator),
    uploader: mapPerson(row.uploader),
    is_from_task: Boolean(row.is_from_task),
  };
}

export async function fetchProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  const { data } = await api.get<{ documents?: unknown[] }>(`/projects/${projectId}/documents`);
  const list = Array.isArray(data?.documents) ? data.documents : [];
  return list.map((row) => mapProjectDocument(row as Record<string, unknown>));
}

export async function fetchProjectTaskFiles(projectId: string): Promise<ProjectTaskFile[]> {
  const { data } = await api.get<{ taskFiles?: unknown[] }>(`/projects/${projectId}/task-files`, {
    params: { for_module: 'production' },
  });
  const list = Array.isArray(data?.taskFiles) ? data.taskFiles : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    const task = r.task as Record<string, unknown> | undefined;
    return {
      id: String(r.id || ''),
      file_name: r.file_name != null ? String(r.file_name) : null,
      file_url: r.file_url != null ? String(r.file_url) : null,
      mime_type: r.mime_type != null ? String(r.mime_type) : null,
      created_at: r.created_at != null ? String(r.created_at) : null,
      task: task
        ? { id: task.id != null ? String(task.id) : undefined, title: task.title != null ? String(task.title) : null }
        : null,
      uploader: mapPerson(r.uploader),
    };
  });
}

export async function fetchLeadDocuments(dealId: string): Promise<ProjectDocument[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/documents`);
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => mapProjectDocument(row as Record<string, unknown>));
}

export async function fetchLeadTaskDocuments(dealId: string): Promise<ProjectDocument[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/task-documents`);
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    return mapProjectDocument({
      ...r,
      name: r.file_name || r.name,
      is_from_task: true,
    });
  });
}

export async function fetchLeadMembers(dealId: string): Promise<LeadMember[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/members`);
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      user_id: String(r.user_id || (r.user as Record<string, unknown>)?.id || ''),
      role: r.role != null ? String(r.role) : undefined,
      user: mapPerson(r.user),
    };
  });
}
