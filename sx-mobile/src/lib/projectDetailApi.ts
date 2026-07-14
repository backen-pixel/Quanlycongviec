import { api } from '../api/client';
import type { CrmDealSummary, CrmTask, KanbanStage, PersonRef, ProductionProjectDetail, ProjectActivity } from '../types';
import { mapProjectRow } from './productionApi';

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

function mapCrmTask(raw: Record<string, unknown>): CrmTask {
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((a) => mapPerson(a)).filter(Boolean) as PersonRef[]
    : [];
  const deadline = raw.deadline != null ? String(raw.deadline) : null;
  return {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    status: String(raw.status || 'pending'),
    stage_slug: raw.stage_slug != null ? String(raw.stage_slug) : null,
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
  const pipeOrder = sampleTask?.pipeline_stage?.order_index;
  if (pipeOrder != null && Number.isFinite(pipeOrder)) return 100 + pipeOrder;
  return 900;
}

export function resolveCrmTaskStageLabel(task: CrmTask): string {
  if (task.pipeline_stage?.name) return task.pipeline_stage.name;
  const slug = normalizeCrmTaskStageSlug(task.stage_slug);
  const fromOrder = SX_STAGE_ORDER.find((s) => s.slug === slug);
  if (fromOrder) return fromOrder.label;
  if (!slug || slug === '_other') return 'Khác';
  if (slug === 'sx_other') return 'Khác';
  if (slug.startsWith('sx_')) {
    return slug
      .replace(/^sx_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return slug.replace(/_/g, ' ');
}

export function groupCrmTasksByStage(tasks: CrmTask[]): { key: string; label: string; tasks: CrmTask[] }[] {
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
    .map(([key, v]) => ({
      key,
      label: v.label,
      tasks: sortTasksInStage(v.tasks),
    }));
}

export async function fetchProductionProjectDetail(projectId: string): Promise<ProductionProjectDetail> {
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

export async function fetchCrmDealTasks(dealId: string): Promise<CrmTask[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/tasks`, {
    params: { task_scope: 'production' },
  });
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => mapCrmTask(row as Record<string, unknown>));
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
