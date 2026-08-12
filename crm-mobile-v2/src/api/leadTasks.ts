/**
 * CRM lead/deal tasks — CRUD, checklist, ghi chú, đính kèm.
 */
import { api, postMultipart } from './client';
import type { LeadCrmTask } from './leadDetail';

export type { LeadCrmTask };

export type TaskAttachment = {
  id: string;
  task_id?: string;
  checklist_id?: string | null;
  name?: string | null;
  doc_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  notes?: string | null;
  created_at?: string | null;
  creator?: { id?: string; full_name?: string | null } | null;
};

export type CreateTaskPayload = {
  title: string;
  priority?: string;
  deadline?: string | null;
  assignee_id?: string | null;
  pipeline_stage_id?: string | null;
  stage_slug?: string | null;
  order_index?: number;
};

export type UpdateTaskPayload = Partial<{
  title: string;
  description: string;
  status: string;
  priority: string;
  deadline: string | null;
  assignee_id: string | null;
  assignee_ids: string[];
  notes: string;
  checklist: unknown[];
  checklist_partial: boolean;
  order_index: number;
}>;

export async function fetchLeadTasks(
  leadId: string,
  opts?: {
    taskScope?: 'crm' | 'production' | 'logistics' | string;
    taskCompanyScope?: 'own' | 'shared' | 'all' | string;
  },
): Promise<LeadCrmTask[]> {
  const r = await api.get<LeadCrmTask[]>(`/crm/leads/${leadId}/tasks`, {
    params: {
      task_scope: opts?.taskScope || 'crm',
      ...(opts?.taskCompanyScope ? { task_company_scope: opts.taskCompanyScope } : {}),
    },
  });
  return r.data || [];
}

export async function createLeadTask(leadId: string, payload: CreateTaskPayload): Promise<LeadCrmTask> {
  const r = await api.post<LeadCrmTask>(`/crm/leads/${leadId}/tasks`, payload);
  return r.data;
}

export async function updateLeadTask(
  leadId: string,
  taskId: string,
  payload: UpdateTaskPayload,
): Promise<LeadCrmTask> {
  const r = await api.put<LeadCrmTask>(`/crm/leads/${leadId}/tasks/${taskId}`, payload);
  return r.data;
}

export async function deleteLeadTask(leadId: string, taskId: string): Promise<void> {
  await api.delete(`/crm/leads/${leadId}/tasks/${taskId}`);
}

export async function fetchTaskAttachments(leadId: string, taskId: string): Promise<TaskAttachment[]> {
  const r = await api.get<TaskAttachment[]>(`/crm/leads/${leadId}/tasks/${taskId}/attachments`);
  return r.data || [];
}

export async function addTaskAttachmentsBulk(
  leadId: string,
  taskId: string,
  items: {
    name?: string;
    doc_type?: string;
    file_url?: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    notes?: string;
  }[],
  checklistId?: string | null,
): Promise<TaskAttachment[]> {
  const r = await api.post<TaskAttachment[]>(`/crm/leads/${leadId}/tasks/${taskId}/attachments/bulk`, {
    items,
    checklist_id: checklistId || undefined,
  });
  return r.data || [];
}

export async function addTaskAttachmentNote(
  leadId: string,
  taskId: string,
  payload: { name?: string; notes: string; checklist_id?: string | null },
): Promise<TaskAttachment> {
  const r = await api.post<TaskAttachment>(`/crm/leads/${leadId}/tasks/${taskId}/attachments`, {
    name: payload.name || 'Ghi chú',
    doc_type: 'task_note',
    notes: payload.notes,
    checklist_id: payload.checklist_id || undefined,
  });
  return r.data;
}

export async function deleteTaskAttachment(
  leadId: string,
  taskId: string,
  attId: string,
): Promise<void> {
  await api.delete(`/crm/leads/${leadId}/tasks/${taskId}/attachments/${attId}`);
}

export async function updateTaskNotes(
  leadId: string,
  taskId: string,
  notes: string,
): Promise<{ id?: string; notes?: string | null; title?: string | null }> {
  const r = await api.put<{ id?: string; notes?: string | null; title?: string | null }>(
    `/crm/leads/${leadId}/tasks/${taskId}/notes`,
    { notes },
  );
  return r.data;
}

export async function updateChecklistNotes(
  leadId: string,
  taskId: string,
  checklistId: string,
  notes: string,
): Promise<{ checklist?: unknown[] }> {
  const r = await api.put<{ checklist?: unknown[] }>(
    `/crm/leads/${leadId}/tasks/${taskId}/checklist/${checklistId}/notes`,
    { notes },
  );
  return r.data;
}

export async function uploadDriveEntityFile(input: {
  entityType: 'lead' | 'deal';
  entityId: string;
  uri: string;
  name: string;
  mimeType?: string | null;
  folderId?: string | null;
}) {
  const fd = new FormData();
  fd.append(
    'file',
    {
      uri: input.uri,
      name: input.name,
      type: input.mimeType || 'application/octet-stream',
    } as unknown as Blob,
  );
  fd.append('entity_type', input.entityType);
  fd.append('entity_id', input.entityId);
  if (input.folderId) fd.append('folder_id', input.folderId);
  if (input.name) fd.append('name', input.name);
  const { data } = await postMultipart<{ file: { id: string; name: string } }>(
    '/drive/entity/upload',
    fd,
    { timeoutMs: 300000 },
  );
  return data;
}

export async function createDriveEntityFolder(
  entityType: 'lead' | 'deal',
  entityId: string,
  name: string,
  parentFolderId?: string | null,
) {
  const r = await api.post<{ folder: { id: string; name: string } }>(
    `/drive/entity/${entityType}/${entityId}/folders`,
    { name, parent_folder_id: parentFolderId || null },
  );
  return r.data.folder;
}
