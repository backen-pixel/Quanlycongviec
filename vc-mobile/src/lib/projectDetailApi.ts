import { api } from '../api/client';
import type {
  CrmDealSummary,
  CrmTask,
  KanbanStage,
  PersonRef,
  ProductionProjectDetail,
  ProjectActivity,
  TaskStaffNote,
} from '../types';
import { mapProjectRow } from './logisticsApi';

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
    notes: raw.notes != null ? String(raw.notes) : null,
    description: raw.description != null ? String(raw.description) : null,
    priority: raw.priority != null ? String(raw.priority) : null,
    file_count: Number(raw.file_count ?? 0),
    note_count: Number(raw.note_count ?? 0),
    attachment_count: Number(raw.attachment_count ?? 0),
    assignee: mapPerson(raw.assignee),
    assignees,
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

export async function fetchCrmDealTasks(dealId: string): Promise<CrmTask[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/tasks`, {
    params: { task_scope: 'logistics' },
  });
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => ({ ...mapCrmTask(row as Record<string, unknown>), source: 'crm' as const }));
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
  if (meta.workshop_area === 'logistics' || meta.workshop_module === 'logistics') return true;
  const stageSlug = row.stage && typeof row.stage === 'object'
    ? String((row.stage as Record<string, unknown>).slug || '')
    : '';
  const slug = String(meta.guessed_stage_slug || stageSlug || '');
  return ['delivery_pending', 'delivery', 'shipping', 'installation', 'installing', 'customer-care', 'warranty'].includes(slug);
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
    stage_slug: guessed,
    order_index: row.order_index != null ? Number(row.order_index) : undefined,
    deadline: due,
    due_date: due,
    notes: notePreview,
    description,
    priority: row.priority != null ? String(row.priority) : null,
    note_count: Number(row.note_count ?? staffNotes?.length ?? 0),
    file_count: Number(row.file_count ?? 0),
    staff_notes: staffNotes,
    assignee: mapPerson(row.assignee),
    assignees: row.assignee ? [mapPerson(row.assignee)!].filter(Boolean) : [],
    pipeline_stage: {
      name: label,
      order_index: row.order_index != null ? Number(row.order_index) : undefined,
    },
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
