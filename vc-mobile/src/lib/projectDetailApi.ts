import { api } from '../api/client';
import type {
  CrmDealSummary,
  CrmTask,
  KanbanStage,
  PersonRef,
  ProductionProjectDetail,
  ProjectActivity,
  TaskChecklistItem,
  TaskStaffNote,
} from '../types';
import { mapProjectRow } from './logisticsApi';

export function isCrmProductionTaskDone(status: string): boolean {
  return status === 'completed' || status === 'done';
}

/** Chuẩn hoá checklist JSONB — khớp web CRMTasksTab. */
export function normalizeTaskChecklist(raw: unknown): TaskChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => {
    if (typeof c === 'string') {
      return {
        id: `ckidx_${i}_${c.slice(0, 8)}`,
        title: c,
        description: '',
        done: false,
      };
    }
    const row = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    return {
      ...row,
      id: String(row.id || `ckidx_${i}`),
      title: String(row.title || row.label || ''),
      description: row.description != null ? String(row.description) : '',
      done: !!(row.done ?? row.is_completed),
    };
  }).filter((c) => String(c.title || '').trim());
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
  return {
    id: String(raw.id || ''),
    name: String(raw.name || `Cột ${index + 1}`),
    color: (raw.color as string) ?? null,
    icon: (raw.icon as string) ?? null,
    order_index: Number(raw.order_index ?? index),
    bucket_slug: (raw.bucket_slug as string) ?? null,
    workflow_stage_id: (raw.workflow_stage_id as string) ?? null,
    is_handover_to_logistics: Boolean(raw.is_handover_to_logistics),
  };
}

function mapCrmDeal(raw: Record<string, unknown>): CrmDealSummary {
  return {
    id: String(raw.id || ''),
    code: raw.code != null ? String(raw.code) : null,
    title: raw.title != null ? String(raw.title) : null,
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

function mapStageRef(raw: unknown): CrmTask['pipeline_stage'] {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  return {
    id: s.id != null ? String(s.id) : undefined,
    name: s.name != null ? String(s.name) : null,
    order_index: s.order_index != null ? Number(s.order_index) : undefined,
  };
}

function mapCrmTask(raw: Record<string, unknown>): CrmTask {
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((a) => mapPerson(a)).filter(Boolean) as PersonRef[]
    : [];
  const deadline = raw.deadline != null ? String(raw.deadline) : null;
  const meta = raw.metadata && typeof raw.metadata === 'object'
    ? (raw.metadata as Record<string, unknown>)
    : null;
  const logisticsStage = mapStageRef(raw.logistics_pipeline_stage);
  const pipelineStage = mapStageRef(raw.pipeline_stage) || logisticsStage;
  const logisticsStageId = raw.logistics_pipeline_stage_id != null
    ? String(raw.logistics_pipeline_stage_id)
    : (meta?.logistics_pipeline_stage_id != null ? String(meta.logistics_pipeline_stage_id) : null);
  const isWorkshop = raw._workshop_project_task === true
    || raw.source === 'workshop'
    || meta?.workshop_area === 'logistics'
    || meta?.workshop_module === 'logistics'
    || String(raw.stage_slug || '').startsWith('vc_ws_');
  return {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    status: String(raw.status || 'pending'),
    stage_slug: raw.stage_slug != null ? String(raw.stage_slug) : null,
    order_index: raw.order_index != null ? Number(raw.order_index) : undefined,
    deadline,
    due_date: deadline ?? (raw.due_date != null ? String(raw.due_date) : null),
    notes: raw.notes != null ? String(raw.notes) : null,
    description: raw.description != null ? String(raw.description) : null,
    priority: raw.priority != null ? String(raw.priority) : null,
    checklist: normalizeTaskChecklist(raw.checklist),
    file_count: Number(raw.file_count ?? 0),
    note_count: Number(raw.note_count ?? 0),
    attachment_count: Number(raw.attachment_count ?? 0),
    assignee: mapPerson(raw.assignee),
    assignees,
    pipeline_stage: pipelineStage,
    logistics_pipeline_stage_id: logisticsStageId,
    logistics_pipeline_stage: logisticsStage
      ? {
          ...logisticsStage,
          bucket_slug: (raw.logistics_pipeline_stage as Record<string, unknown> | undefined)?.bucket_slug != null
            ? String((raw.logistics_pipeline_stage as Record<string, unknown>).bucket_slug)
            : null,
        }
      : null,
    metadata: meta,
    _workshop_project_task: isWorkshop,
    source: isWorkshop ? 'workshop' : 'crm',
  };
}

/** Thứ tự giai đoạn VC — slug vc_* trên crm_tasks (khi có bộ mẫu VC) */
const VC_STAGE_ORDER: { slug: string; label: string }[] = [
  { slug: 'vc_tiep_nhan', label: 'Tiếp nhận VC' },
  { slug: 'vc_van_chuyen', label: 'Vận chuyển' },
  { slug: 'vc_giao_hang', label: 'Giao hàng' },
  { slug: 'vc_lap_dat', label: 'Lắp đặt' },
  { slug: 'vc_nghiem_thu', label: 'Nghiệm thu' },
  { slug: 'vc_bao_hanh', label: 'Bảo hành / CSKH' },
];

const VC_STAGE_INDEX = new Map(VC_STAGE_ORDER.map((s, i) => [s.slug, i]));

/** Chuẩn hoá stage_slug (bỏ hậu tố uuid pipeline) — khớp web CRMTasksTab */
export function normalizeCrmTaskStageSlug(slug?: string | null): string {
  const s = String(slug || '').trim();
  if (!s) return '_other';
  if (s.startsWith('sx_') || s.startsWith('vc_')) {
    return s.replace(/[-_][a-f0-9]{8}$/i, '');
  }
  return s;
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
  const vcIdx = VC_STAGE_INDEX.get(normalized);
  if (vcIdx != null) return vcIdx;
  const pipeOrder = sampleTask?.pipeline_stage?.order_index;
  if (pipeOrder != null && Number.isFinite(pipeOrder)) return 100 + pipeOrder;
  return 900;
}

export function resolveCrmTaskStageLabel(task: CrmTask): string {
  if (task.logistics_pipeline_stage?.name) return task.logistics_pipeline_stage.name;
  if (task.pipeline_stage?.name) return task.pipeline_stage.name;
  const slug = normalizeCrmTaskStageSlug(task.stage_slug);
  const fromOrder = VC_STAGE_ORDER.find((s) => s.slug === slug);
  if (fromOrder) return fromOrder.label;
  if (!slug || slug === '_other') return 'Khác';
  if (slug === 'vc_other' || slug === 'sx_other') return 'Khác';
  if (slug.startsWith('vc_') || slug.startsWith('sx_')) {
    return slug
      .replace(/^(vc_|sx_)/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return slug.replace(/_/g, ' ');
}

/** Gom nhiệm vụ vào cột logistics_pipeline_stages — khớp CRMTasksTab trên web. */
export function resolveVcTaskPipelineStageId(
  task: CrmTask,
  vcStages: KanbanStage[],
): string | null {
  const stages = vcStages || [];
  if (!stages.length) return null;
  const validIds = new Set(stages.map((s) => String(s.id)));
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const pid = task.logistics_pipeline_stage_id || meta.logistics_pipeline_stage_id;
  if (pid && validIds.has(String(pid))) return String(pid);

  const slug = String(task.stage_slug || '').trim();
  if (slug.startsWith('vc_pl_')) {
    const prefix = slug.slice(6);
    const hit = stages.find((s) => s?.id && String(s.id).startsWith(prefix));
    if (hit && validIds.has(String(hit.id))) return String(hit.id);
  }

  const wsSlug = String(meta.guessed_stage_slug || slug.replace(/^vc_ws_/, '') || '').toLowerCase();
  const findByBucket = (pred: (b: string, n: string) => boolean) => stages.find((s) => {
    const b = String(s.bucket_slug || '').toLowerCase();
    const n = String(s.name || '').toLowerCase();
    return pred(b, n);
  });

  if (wsSlug === 'delivery_pending' || wsSlug === 'delivery-pending') {
    const col = findByBucket((b, n) => (
      b === 'delivery_pending'
      || n.includes('chờ vận')
      || n.includes('tiếp nhận')
    ));
    if (col?.id) return String(col.id);
  }
  if (wsSlug === 'installation' || wsSlug === 'installing') {
    const col = findByBucket((b, n) => n.includes('lắp đặt') || b === 'installation');
    if (col?.id) return String(col.id);
  }
  if (wsSlug === 'completed') {
    const col = findByBucket((b, n) => b === 'completed' || n.includes('hoàn thành'));
    if (col?.id) return String(col.id);
  }
  if (wsSlug === 'shipping' || wsSlug === 'delivery') {
    const col = findByBucket((b, n) => n.includes('đang vận') || (n.includes('vận chuyển') && b !== 'delivery_pending'));
    if (col?.id) return String(col.id);
  }

  return stages[0]?.id ? String(stages[0].id) : null;
}

/** Khớp web: tab VC deal chỉ hiện workshop logistics + crm_tasks vc_*. */
export function filterVcLogisticsUiTasks(tasks: CrmTask[]): CrmTask[] {
  return (tasks || []).filter((t) => (
    t.source === 'workshop'
    || t._workshop_project_task === true
    || String(t.stage_slug || '').startsWith('vc_')
  ));
}

export function isInstallLogisticsPipelineStage(
  stage: Pick<KanbanStage, 'name' | 'bucket_slug'> | null | undefined,
): boolean {
  if (!stage) return false;
  const name = String(stage.name || '').toLowerCase();
  const slug = String(stage.bucket_slug || '').toLowerCase();
  return (
    slug.includes('install')
    || name.includes('lắp')
    || name.includes('lap dat')
  );
}

function guessInstallFromTitle(title: string): boolean {
  const t = String(title || '').toLowerCase().trim();
  if (!t) return false;
  if (
    t.includes('vận chuyển')
    || t.includes('giao hàng')
    || t.includes('chờ vận')
    || t.includes('checklist hàng')
    || t.includes('phiếu giao')
    || t.includes('địa chỉ')
    || t.includes('chứng từ')
    || t.includes('thanh toán')
    || t.includes('trước khi lấy')
    || t.includes('lên xe')
    || t.includes('trước khi giao')
  ) {
    return false;
  }
  return (
    t.includes('nghiệm thu')
    || t.includes('quy trình lắp')
    || t.includes('lắp đặt')
    || t.includes('kiểm tra và nhận')
    || t.includes('kiểm tra nhận hàng')
    || t.includes('khảo sát')
    || t.includes('thi công')
    || t.includes('vận hành')
    || t.includes('dụng cụ')
    || t.includes('lắp ')
  );
}

/**
 * Lọc Vận chuyển / Lắp đặt — khớp CRMTasksTab (vcAreaTab) trên web.
 * Mặc định web = shipping.
 */
export function filterVcAreaTabTasks(
  tasks: CrmTask[],
  vcAreaTab: 'shipping' | 'install' | 'all' | null | undefined,
  vcStages: KanbanStage[] = [],
): CrmTask[] {
  if (!vcAreaTab || vcAreaTab === 'all') return tasks || [];
  if (vcAreaTab !== 'shipping' && vcAreaTab !== 'install') return tasks || [];
  const stages = Array.isArray(vcStages) ? vcStages : [];
  return (tasks || []).filter((t) => {
    const sid = resolveVcTaskPipelineStageId(t, stages);
    if (sid && stages.length) {
      const stage = stages.find((s) => String(s.id) === String(sid));
      if (stage) {
        const install = isInstallLogisticsPipelineStage(stage);
        return vcAreaTab === 'install' ? install : !install;
      }
    }
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
    const guessed = String(meta.guessed_stage_slug || '').toLowerCase();
    const slug = String(t.stage_slug || '').toLowerCase();
    const isInstall = guessed.includes('install')
      || slug.includes('install')
      || guessInstallFromTitle(t.title || '');
    return vcAreaTab === 'install' ? isInstall : !isInstall;
  });
}

/**
 * Lọc cột pipeline theo tab Vận chuyển / Lắp đặt (giống web listStagesToRender).
 */
export function filterVcStagesByAreaTab(
  stages: KanbanStage[],
  vcAreaTab: 'shipping' | 'install' | 'all' | null | undefined,
): KanbanStage[] {
  const list = Array.isArray(stages) ? stages : [];
  if (!vcAreaTab || vcAreaTab === 'all') return list;
  return list.filter((s) => {
    const install = isInstallLogisticsPipelineStage(s);
    return vcAreaTab === 'install' ? install : !install;
  });
}

/** Tạo nhiệm vụ VC/LĐ trên bảng tasks — khớp WorkshopProjectTasksPanel «Thêm việc». */
export async function createLogisticsWorkshopTask(input: {
  projectId: string;
  title: string;
  priority?: string;
  assignee_id?: string | null;
  logistics_pipeline_stage_id: string;
  guessed_stage_slug?: string;
  stage_id?: string | null;
}): Promise<CrmTask> {
  const guessed = String(input.guessed_stage_slug || 'shipping');
  const payload: Record<string, unknown> = {
    project_id: input.projectId,
    title: input.title.trim(),
    priority: input.priority || 'medium',
    status: 'todo',
    task_type: 'project',
    metadata: {
      workshop_area: 'logistics',
      logistics_pipeline_stage_id: input.logistics_pipeline_stage_id,
      guessed_stage_slug: guessed,
    },
  };
  if (input.assignee_id) payload.assignee_id = input.assignee_id;
  if (input.stage_id) payload.stage_id = input.stage_id;

  const { data } = await api.post<unknown>('/tasks', payload);
  const root = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const row = (root.task && typeof root.task === 'object' ? root.task : root) as Record<string, unknown>;
  // Nếu backend chưa lưu metadata (chưa deploy), gắn lại bằng PUT.
  if (row.id && (!row.metadata || !(row.metadata as Record<string, unknown>).workshop_area)) {
    try {
      await api.put(`/tasks/${row.id}`, {
        metadata: {
          workshop_area: 'logistics',
          logistics_pipeline_stage_id: input.logistics_pipeline_stage_id,
          guessed_stage_slug: guessed,
        },
      });
    } catch { /* cột/API cũ — bỏ qua */ }
  }
  return mapWorkshopTask({
    ...row,
    metadata: {
      ...(typeof row.metadata === 'object' && row.metadata ? row.metadata as object : {}),
      workshop_area: 'logistics',
      logistics_pipeline_stage_id: input.logistics_pipeline_stage_id,
      guessed_stage_slug: guessed,
    },
  });
}

/** Tạo crm_tasks vc_* theo cột pipeline — khớp CRMTasksTab «Thêm việc» (khi có deal). */
export async function createCrmLogisticsTask(
  dealId: string,
  input: {
    title: string;
    priority?: string;
    assignee_id?: string | null;
    logistics_pipeline_stage_id: string;
    order_index?: number;
  },
): Promise<CrmTask> {
  const stageId = String(input.logistics_pipeline_stage_id);
  const payload: Record<string, unknown> = {
    title: input.title.trim(),
    priority: input.priority || 'medium',
    status: 'pending',
    stage_slug: `vc_pl_${stageId.slice(0, 8)}`,
    order_index: input.order_index ?? 0,
    metadata: {
      workshop_area: 'logistics',
      workshop_module: 'logistics',
      logistics_pipeline_stage_id: stageId,
    },
  };
  if (input.assignee_id) {
    payload.assignee_id = input.assignee_id;
    payload.assignee_ids = [input.assignee_id];
  }
  const { data } = await api.post<Record<string, unknown>>(`/crm/leads/${dealId}/tasks`, payload);
  return mapCrmTask({
    ...(data || {}),
    logistics_pipeline_stage_id: stageId,
    stage_slug: (data?.stage_slug as string) || `vc_pl_${stageId.slice(0, 8)}`,
    metadata: {
      ...((data?.metadata && typeof data.metadata === 'object') ? data.metadata as object : {}),
      workshop_area: 'logistics',
      logistics_pipeline_stage_id: stageId,
    },
  });
}

export function groupCrmTasksByStage(
  tasks: CrmTask[],
  vcStages: KanbanStage[] = [],
  opts?: { includeEmpty?: boolean },
): { key: string; label: string; color?: string | null; tasks: CrmTask[]; openCount: number; doneCount: number }[] {
  const includeEmpty = !!opts?.includeEmpty;
  const stages = [...(vcStages || [])].sort(
    (a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0),
  );

  if (stages.length) {
    const map = new Map<string, CrmTask[]>();
    for (const s of stages) map.set(String(s.id), []);
    const orphanKey = '_other';
    for (const task of tasks) {
      const key = resolveVcTaskPipelineStageId(task, stages) || orphanKey;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    const sections: {
      key: string;
      label: string;
      color?: string | null;
      tasks: CrmTask[];
      openCount: number;
      doneCount: number;
    }[] = [];
    for (const s of stages) {
      const list = sortTasksInStage(map.get(String(s.id)) || []);
      if (!list.length && !includeEmpty) continue;
      sections.push({
        key: String(s.id),
        label: s.name || 'Giai đoạn',
        color: s.color,
        tasks: list,
        openCount: list.filter((t) => !isCrmProductionTaskDone(t.status)).length,
        doneCount: list.filter((t) => isCrmProductionTaskDone(t.status)).length,
      });
    }
    const orphans = sortTasksInStage(map.get(orphanKey) || []);
    if (orphans.length) {
      sections.push({
        key: orphanKey,
        label: 'Khác',
        color: '#64748b',
        tasks: orphans,
        openCount: orphans.filter((t) => !isCrmProductionTaskDone(t.status)).length,
        doneCount: orphans.filter((t) => isCrmProductionTaskDone(t.status)).length,
      });
    }
    return sections;
  }

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
        tasks: list,
        openCount: list.filter((t) => !isCrmProductionTaskDone(t.status)).length,
        doneCount: list.filter((t) => isCrmProductionTaskDone(t.status)).length,
      };
    });
}

export async function fetchProductionProjectDetail(projectId: string): Promise<ProductionProjectDetail> {
  const { data } = await api.get<{ project?: Record<string, unknown> }>(
    `/logistics/projects/${projectId}`,
  );
  const raw = (data?.project ?? data) as Record<string, unknown>;
  const base = mapProjectRow(raw);
  const customer = (raw.customer || {}) as Record<string, unknown>;
  const company = (raw.company || raw.logistics_company || {}) as Record<string, unknown>;
  const workshopType = (raw.workshop_type || {}) as Record<string, unknown>;
  const currentStage = (raw.current_stage || {}) as Record<string, unknown>;
  const vcStages = Array.isArray(raw.vcKanbanStages)
    ? raw.vcKanbanStages.map((s, i) => mapKanbanStage(s as Record<string, unknown>, i))
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
    sxKanbanStages: vcStages,
    vcKanbanStages: vcStages,
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
    logistics_person: mapPerson(raw.logistics_person),
    installer_person: mapPerson(raw.installer_person),
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
  opts?: { ownerCompanyId?: string | null },
): Promise<CrmTask[]> {
  const params: Record<string, string> = {
    task_scope: 'logistics',
    task_company_scope: 'own',
  };
  if (opts?.ownerCompanyId) params.owner_company_id = String(opts.ownerCompanyId);
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/tasks`, { params });
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => mapCrmTask(row as Record<string, unknown>));
}

const VC_WORKSHOP_STAGE_LABEL: Record<string, string> = {
  delivery_pending: 'Tiếp nhận VC',
  delivery: 'Vận chuyển',
  shipping: 'Vận chuyển',
  installation: 'Lắp đặt',
  installing: 'Lắp đặt',
  'customer-care': 'Bảo hành / CSKH',
  warranty: 'Bảo hành / CSKH',
};

function isLogisticsWorkshopTask(row: Record<string, unknown>): boolean {
  const meta = row.metadata && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>)
    : {};
  if (meta.workshop_area === 'production') return false;
  if (meta.workshop_area === 'logistics') return true;
  // Khớp frontend taskBelongsToWorkshopModule('vc') khi không có deal (WorkshopProjectTasksPanel)
  const stageSlug = row.stage && typeof row.stage === 'object'
    ? String((row.stage as Record<string, unknown>).slug || '')
    : '';
  const slug = String(meta.guessed_stage_slug || stageSlug || '').toLowerCase();
  return ['delivery', 'shipping', 'installation', 'installing', 'customer-care', 'delivery_pending'].includes(slug);
}

function mapWorkshopTask(row: Record<string, unknown>): CrmTask {
  const meta = row.metadata && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>)
    : {};
  const stageObj = row.stage && typeof row.stage === 'object'
    ? (row.stage as Record<string, unknown>)
    : null;
  const guessed = String(meta.guessed_stage_slug || stageObj?.slug || 'delivery_pending');
  const label = VC_WORKSHOP_STAGE_LABEL[guessed]
    || (stageObj?.name != null ? String(stageObj.name) : null)
    || guessed;
  const statusRaw = String(row.status || 'todo');
  const status = statusRaw === 'done' ? 'completed' : statusRaw === 'todo' ? 'pending' : statusRaw;
  const due = row.due_date != null ? String(row.due_date) : null;
  const description = row.description != null ? String(row.description) : null;
  // Ghi chú nhân viên ≠ mô tả mẫu — không map description → notes
  const staffNotes = Array.isArray(row.staff_notes) ? row.staff_notes as TaskStaffNote[] : undefined;
  const notePreview = staffNotes?.[0]?.text
    || (row.notes != null ? String(row.notes) : null);
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    status,
    stage_slug: guessed.startsWith('vc_') ? guessed : `vc_ws_${guessed}`,
    order_index: row.order_index != null ? Number(row.order_index) : undefined,
    deadline: due,
    due_date: due,
    notes: notePreview,
    description,
    priority: row.priority != null ? String(row.priority) : null,
    checklist: normalizeTaskChecklist(row.checklist ?? meta.checklist),
    note_count: Number(row.note_count ?? staffNotes?.length ?? 0),
    file_count: Number(row.file_count ?? 0),
    staff_notes: staffNotes,
    assignee: mapPerson(row.assignee),
    assignees: row.assignee ? [mapPerson(row.assignee)!].filter(Boolean) : [],
    pipeline_stage: {
      name: label,
      order_index: row.order_index != null ? Number(row.order_index) : undefined,
    },
    logistics_pipeline_stage_id: meta.logistics_pipeline_stage_id != null
      ? String(meta.logistics_pipeline_stage_id)
      : null,
    metadata: meta,
    _workshop_project_task: true,
    source: 'workshop',
  };
}

/** Nhiệm vụ VC/LĐ trên bảng `tasks` (bộ mẫu xưởng logistics) — nguồn chính khi deal chưa có crm_tasks vc_*. */
export async function fetchLogisticsWorkshopTasks(projectId: string): Promise<CrmTask[]> {
  const { data } = await api.get<{ tasks?: unknown[] }>('/tasks', {
    params: { project_id: projectId, page_size: 200 },
  });
  const list = Array.isArray(data?.tasks) ? data.tasks : [];
  return list
    .map((row) => row as Record<string, unknown>)
    .filter(isLogisticsWorkshopTask)
    .map(mapWorkshopTask);
}

function unwrapWorkshopTaskPayload(data: unknown, fallback: Record<string, unknown>): CrmTask {
  const root = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const row = (root.task && typeof root.task === 'object'
    ? root.task
    : root) as Record<string, unknown>;
  return mapWorkshopTask({ ...fallback, ...row });
}

function toWorkshopStatus(status: string): string {
  if (status === 'completed' || status === 'done') return 'done';
  if (status === 'pending' || status === 'todo') return 'todo';
  return status;
}

export async function updateWorkshopTaskStatus(taskId: string, status: string): Promise<CrmTask> {
  const apiStatus = toWorkshopStatus(status);
  const { data } = await api.patch<unknown>(`/tasks/${taskId}/status`, { status: apiStatus });
  return unwrapWorkshopTaskPayload(data, { id: taskId, status: apiStatus });
}

export async function updateWorkshopTask(
  taskId: string,
  updates: Record<string, unknown>,
): Promise<CrmTask> {
  const body: Record<string, unknown> = { ...updates };
  if (body.status != null) body.status = toWorkshopStatus(String(body.status));
  if (body.deadline !== undefined && body.due_date === undefined) {
    body.due_date = body.deadline;
    delete body.deadline;
  }
  if (body.assignee_ids != null && Array.isArray(body.assignee_ids)) {
    const ids = body.assignee_ids.map(String).filter(Boolean);
    body.assignee_id = ids[0] || null;
    delete body.assignee_ids;
  }
  // Không gửi notes lên PUT /tasks (bảng tasks không có cột notes)
  delete body.notes;
  delete body.staff_notes;
  delete body.note_count;
  delete body.source;
  delete body.pipeline_stage;
  delete body.assignees;
  delete body.assignee;
  delete body.file_count;
  delete body.attachment_count;
  delete body.deadline; // đã map sang due_date ở trên nếu cần
  const { data } = await api.put<unknown>(`/tasks/${taskId}`, body);
  return unwrapWorkshopTaskPayload(data, { id: taskId, ...body });
}

export async function deleteWorkshopTask(taskId: string): Promise<void> {
  await api.delete(`/tasks/${taskId}`);
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

export async function fetchWorkshopTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data } = await api.get<{ attachments?: unknown[] }>(`/tasks/${taskId}/attachments`, {
    params: { for_module: 'logistics' },
  });
  const list = Array.isArray(data?.attachments) ? data.attachments : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id || ''),
      name: r.file_name != null ? String(r.file_name) : (r.name != null ? String(r.name) : null),
      doc_type: r.doc_type != null ? String(r.doc_type) : null,
      file_url: r.file_url != null ? String(r.file_url) : null,
      file_name: r.file_name != null ? String(r.file_name) : null,
      mime_type: r.mime_type != null ? String(r.mime_type) : null,
      notes: r.notes != null ? String(r.notes) : null,
    };
  });
}

export async function deleteWorkshopTaskAttachment(taskId: string, attachmentId: string): Promise<void> {
  await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
}

export async function uploadWorkshopTaskFiles(
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
      original_name: upf.file_name || 'file',
      file_name: upf.file_name,
      file_url: upf.file_url,
      file_size: upf.file_size,
      mime_type: upf.mime_type,
      allowed_share_modules: ['logistics'],
    }));
  if (!items.length) throw new Error('Upload không trả về file_url');
  await api.post(`/tasks/${taskId}/attachments/bulk`, { items });
}

/** Ghi chú nhân viên trên nhiệm vụ xưởng — dùng task_comments (nhiều lần, không đụng mô tả). */
export async function fetchWorkshopTaskNotes(taskId: string): Promise<TaskStaffNote[]> {
  const { data } = await api.get<{ comments?: unknown[] }>(`/tasks/${taskId}/comments`);
  const list = Array.isArray(data?.comments) ? data.comments : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    const user = r.user && typeof r.user === 'object' ? (r.user as Record<string, unknown>) : null;
    return {
      id: String(r.id || ''),
      text: String(r.content || ''),
      created_at: r.created_at != null ? String(r.created_at) : null,
      user_name: user?.full_name != null ? String(user.full_name) : null,
    };
  }).filter((n) => n.id && n.text.trim());
}

export async function addWorkshopTaskNote(taskId: string, text: string): Promise<TaskStaffNote> {
  const content = text.trim();
  if (!content) throw new Error('Thiếu nội dung ghi chú');
  // Luôn POST /tasks/:id/comments — không PUT notes lên bảng tasks
  const { data } = await api.post<{ comment?: Record<string, unknown>; error?: string }>(
    `/tasks/${taskId}/comments`,
    { content },
  );
  const r = data?.comment;
  if (!r?.id) {
    throw new Error((data as { error?: string })?.error || 'Không lưu được ghi chú');
  }
  const user = r.user && typeof r.user === 'object' ? (r.user as Record<string, unknown>) : null;
  return {
    id: String(r.id),
    text: String(r.content || content),
    created_at: r.created_at != null ? String(r.created_at) : new Date().toISOString(),
    user_name: user?.full_name != null ? String(user.full_name) : null,
  };
}

export async function deleteWorkshopTaskNote(taskId: string, noteId: string): Promise<void> {
  await api.delete(`/tasks/${taskId}/comments/${noteId}`);
}

export async function fetchProjectActivities(projectId: string): Promise<ProjectActivity[]> {
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

export async function fetchDealIdForProject(projectId: string): Promise<string | null> {
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

export function taskDeadline(task: CrmTask): string | null {
  return task.deadline || task.due_date || null;
}

export async function updateCrmTask(
  dealId: string,
  taskId: string,
  updates: Record<string, unknown>,
): Promise<CrmTask> {
  const { data } = await api.put<Record<string, unknown>>(`/crm/leads/${dealId}/tasks/${taskId}`, updates);
  return mapCrmTask(data || { id: taskId, ...updates });
}

export async function deleteCrmTask(dealId: string, taskId: string): Promise<void> {
  await api.delete(`/crm/leads/${dealId}/tasks/${taskId}`);
}

export async function updateCrmTaskNotes(
  dealId: string,
  taskId: string,
  notes: string | null,
): Promise<CrmTask> {
  const { data } = await api.put<Record<string, unknown>>(`/crm/leads/${dealId}/tasks/${taskId}/notes`, {
    notes,
  });
  return mapCrmTask(data || { id: taskId, notes });
}

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
}

export async function addCrmTaskNote(
  dealId: string,
  taskId: string,
  text: string,
  name?: string,
): Promise<TaskAttachment> {
  const { data } = await api.post<Record<string, unknown>>(
    `/crm/leads/${dealId}/tasks/${taskId}/attachments`,
    {
      name: (name || 'Ghi chú').trim() || 'Ghi chú',
      doc_type: 'task_note',
      notes: text.trim(),
    },
  );
  return {
    id: String(data?.id || ''),
    name: data?.name != null ? String(data.name) : 'Ghi chú',
    doc_type: 'task_note',
    notes: text.trim(),
    file_url: null,
    file_name: null,
    mime_type: null,
  };
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
      doc_type: (upf.mime_type || '').startsWith('image/') ? 'image' : 'other',
      file_url: upf.file_url,
      file_name: upf.file_name,
      file_size: upf.file_size,
      mime_type: upf.mime_type,
    }));
  if (!items.length) throw new Error('Upload không trả về file_url');
  await api.post(`/crm/leads/${dealId}/tasks/${taskId}/attachments/bulk`, { items });
}

export async function fetchUsersForAssign(): Promise<PersonRef[]> {
  const { data } = await api.get<unknown>('/users');
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => mapPerson(row)).filter(Boolean) as PersonRef[];
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
    params: { for_module: 'logistics' },
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
