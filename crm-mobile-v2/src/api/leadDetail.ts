/**
 * API chi tiết Lead/Deal — nhiệm vụ, tài liệu, bình luận, thành viên, inbox FB/Zalo.
 */
import { api } from './client';
import type { DriveFile, DriveFolder } from './drive';

export type LeadDetailRow = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: 'lead' | 'deal' | string;
  company_id?: string | null;
  company?: { id?: string; name?: string | null; short_name?: string | null } | null;
  region_id?: string | null;
  /** Embed từ detail API (`crm_region`). */
  crm_region?: { id?: string; name?: string | null; code?: string | null } | null;
  region?: { id?: string; name?: string | null } | null;
  project_id?: string | null;
  inbox_channel?: string | null;
  source?: { id?: string; name?: string | null } | string | null;
  source_id?: string | null;
  lead_type_id?: string | null;
  lead_type?: { id?: string; name?: string | null } | null;
  customer_id?: string | null;
  customer?: {
    id?: string;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    company?: string | null;
    tax_code?: string | null;
  } | null;
  assigned_to?: string | null;
  assignee?: { id?: string; full_name?: string | null } | null;
  lead_owner?: { id?: string; full_name?: string | null } | null;
  stage?: { id?: string; name?: string | null; color?: string | null; is_won?: boolean | null } | null;
  estimated_value?: number | null;
  probability?: number | null;
  expected_close_date?: string | null;
  next_follow_up?: string | null;
  deposit_amount?: number | null;
  deposit_received?: boolean | null;
  deposit_label?: string | null;
  created_at?: string | null;
  deadline?: string | null;
  kanban_deadline_at?: string | null;
  kanban_deadline_reason?: string | null;
  install_address?: string | null;
  description?: string | null;
  linked_project?: {
    id?: string;
    code?: string | null;
    name?: string | null;
    order_date?: string | null;
    delivery_date?: string | null;
    production_deadline?: string | null;
  } | null;
  production_projects?: Array<{
    project_id?: string;
    code?: string | null;
    name?: string | null;
    company_name?: string | null;
    workshop_type_name?: string | null;
    is_primary?: boolean;
  }> | null;
};

export type LeadCrmTask = {
  id: string;
  title?: string | null;
  status?: string | null;
  stage_slug?: string | null;
  pipeline_stage_id?: string | null;
  order_index?: number | null;
  notes?: string | null;
  checklist?: unknown;
  assignee_id?: string | null;
  assignee?: { id?: string; full_name?: string | null } | null;
  attachment_count?: number | null;
  file_count?: number | null;
  note_count?: number | null;
  assignees?: { id?: string; full_name?: string | null }[];
  pipeline_stage?: {
    id?: string;
    name?: string | null;
    color?: string | null;
    icon?: string | null;
    order_index?: number | null;
  } | null;
  shared_view?: string | null;
  executor_company_id?: string | null;
};

export type LeadDocument = {
  id: string;
  name?: string | null;
  doc_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  notes?: string | null;
  created_at?: string | null;
  is_from_task?: boolean;
  creator?: { full_name?: string | null } | null;
};

export type LeadTaskDocument = {
  id: string;
  task_id?: string | null;
  task_title?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
  checklist_title?: string | null;
};

export type CommentReactionSummary = { emoji: string; count: number };
export type CommentReactions = {
  summary: CommentReactionSummary[];
  mine: string | null;
};

export type LeadCommentAttachment = {
  url?: string | null;
  file_url?: string | null;
  name?: string | null;
  file_name?: string | null;
  type?: string | null;
  mime_type?: string | null;
  size?: number | null;
  file_size?: number | null;
};

export type LeadComment = {
  id: number;
  lead_id?: string | null;
  user_id?: string | null;
  body?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  parent_id?: number | null;
  comment_type?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Đính kèm từ API (`url`/`name`/`type` sau normalize server). */
  attachments?: LeadCommentAttachment[] | null;
  reactions?: CommentReactions;
  user?: { id?: string; full_name?: string | null; avatar?: string | null } | null;
};

export type LeadMember = {
  id?: string;
  user_id?: string;
  role?: string | null;
  company_id?: string | null;
  user?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    avatar?: string | null;
    role?: string | null;
    company_id?: string | null;
    drive_module?: string | null;
  } | null;
};

export type LeadChatMessage = {
  id: string;
  content?: string | null;
  created_at?: string | null;
  message_type?: string | null;
  is_system?: boolean;
  attachments?: { name?: string; url?: string; type?: string }[] | null;
  user?: { id?: string; full_name?: string | null; avatar?: string | null } | null;
};

export type FacebookContact = {
  id: string;
  fb_name?: string | null;
  fb_profile_pic?: string | null;
  phone?: string | null;
};

export type FacebookMessage = {
  id: string;
  content?: string | null;
  created_at?: string | null;
  direction?: 'inbound' | 'outbound' | string;
  message_type?: string | null;
  attachment_url?: string | null;
  contact?: FacebookContact | null;
};

export type ZaloContact = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  user_id?: string | null;
};

export type ZaloMessage = {
  id: string;
  content?: string | null;
  created_at?: string | null;
  direction?: 'inbound' | 'outbound' | string;
  message_type?: string | null;
  attachment_url?: string | null;
  contact?: ZaloContact | null;
};

export async function fetchLeadDetail(leadId: string): Promise<LeadDetailRow> {
  const r = await api.get<LeadDetailRow>(`/crm/leads/${leadId}/detail`);
  const row = r.data;
  // Detail đôi khi chưa embed linked_project — bổ sung từ GET /crm/leads/:id.
  if (row?.project_id && !row.linked_project) {
    try {
      const lite = await api.get<{ linked_project?: LeadDetailRow['linked_project'] }>(
        `/crm/leads/${leadId}`,
      );
      if (lite.data?.linked_project) row.linked_project = lite.data.linked_project;
    } catch {
      /* ignore */
    }
  }
  return row;
}

export async function fetchLeadTasks(leadId: string): Promise<LeadCrmTask[]> {
  const r = await api.get<LeadCrmTask[]>(`/crm/leads/${leadId}/tasks`, {
    params: { task_scope: 'crm' },
  });
  return r.data || [];
}

export async function fetchLeadDocuments(leadId: string): Promise<LeadDocument[]> {
  const r = await api.get<LeadDocument[]>(`/crm/leads/${leadId}/documents`);
  return r.data || [];
}

export async function fetchLeadTaskDocuments(leadId: string): Promise<LeadTaskDocument[]> {
  const r = await api.get<LeadTaskDocument[]>(`/crm/leads/${leadId}/task-documents`);
  return r.data || [];
}

export async function fetchLeadComments(leadId: string): Promise<LeadComment[]> {
  const r = await api.get<LeadComment[]>(`/crm/leads/${leadId}/comments`);
  return (r.data || []).map((c) => ({
    ...c,
    reactions: c.reactions || { summary: [], mine: null },
  }));
}

export type LeadCommentsIndexRow = {
  count: number;
  last_at?: string | null;
  last_user_id?: string | null;
};

/** Meta số lượng bình luận theo lead — GET /crm/lead-comments/index. */
export async function fetchLeadCommentsIndex(
  leadIds: string[],
): Promise<Record<string, LeadCommentsIndexRow>> {
  const ids = leadIds.map(String).filter(Boolean);
  if (!ids.length) return {};
  const { data } = await api.get<Record<string, LeadCommentsIndexRow>>('/crm/lead-comments/index', {
    params: { lead_ids: ids.join(',') },
  });
  return data || {};
}

export type LeadCommentReadReceipt = { user_id: string; last_read_at: string };

export async function fetchLeadCommentReadReceipts(
  leadId: string,
): Promise<{ receipts: LeadCommentReadReceipt[]; members?: unknown[] }> {
  const { data } = await api.get<{ receipts?: LeadCommentReadReceipt[]; members?: unknown[] }>(
    `/crm/leads/${leadId}/comments/read-receipts`,
  );
  return {
    receipts: Array.isArray(data?.receipts) ? data.receipts : [],
    members: data?.members,
  };
}

/** Đánh dấu đã đọc bình luận lead — PATCH /crm/leads/:id/comments/read. */
export async function markLeadCommentsRead(leadId: string): Promise<string> {
  const { data } = await api.patch<{ ok?: boolean; last_read_at?: string }>(
    `/crm/leads/${leadId}/comments/read`,
  );
  return String(data?.last_read_at || new Date().toISOString());
}

/** Số bình luận mới (sau last_read_at, không tính của mình). */
export function countUnreadLeadComments(
  comments: LeadComment[],
  myId: string,
  lastReadAt?: string | null,
): number {
  const cutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  const me = String(myId || '');
  let n = 0;
  for (const c of comments) {
    if (me && String(c.user_id || c.user?.id || '') === me) continue;
    const t = c.created_at ? new Date(c.created_at).getTime() : 0;
    if (!Number.isFinite(t)) continue;
    if (!cutoff || t > cutoff) n += 1;
  }
  return n;
}

export async function postLeadComment(
  leadId: string,
  body: string,
  opts?: {
    parent_id?: number | null;
    mention_user_ids?: string[];
    attachments?: LeadCommentAttachment[];
  },
): Promise<LeadComment> {
  const payload: Record<string, unknown> = { body };
  if (opts?.parent_id != null) payload.parent_id = opts.parent_id;
  if (opts?.mention_user_ids?.length) payload.mention_user_ids = opts.mention_user_ids;
  if (opts?.attachments?.length) payload.attachments = opts.attachments;
  const r = await api.post<LeadComment>(`/crm/leads/${leadId}/comments`, payload);
  return { ...r.data, reactions: r.data.reactions || { summary: [], mine: null } };
}

/** Cập nhật tiền cọc — PUT /crm/leads/:id. */
export async function updateLeadDeposit(
  leadId: string,
  input: {
    deposit_amount: number | null;
    deposit_received: boolean | null;
    deposit_label: string | null;
  },
): Promise<void> {
  await api.put(`/crm/leads/${leadId}`, {
    deposit_amount: input.deposit_amount != null && input.deposit_amount > 0 ? input.deposit_amount : null,
    deposit_received: input.deposit_received,
    deposit_label: input.deposit_label?.trim() || null,
  });
}

/** Cập nhật một phần trường Lead/Deal — PUT /crm/leads/:id. */
export async function updateLeadFields(
  leadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await api.put(`/crm/leads/${leadId}`, patch);
}

/** Cập nhật khách hàng — PUT /customers/:id. */
export async function updateCustomerFields(
  customerId: string,
  patch: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    company?: string | null;
    tax_code?: string | null;
  },
): Promise<void> {
  await api.put(`/customers/${customerId}`, patch);
}

export async function patchLeadComment(commentId: number, body: string): Promise<LeadComment> {
  const r = await api.patch<LeadComment>(`/crm/lead-comments/${commentId}`, { body });
  return { ...r.data, reactions: r.data.reactions || { summary: [], mine: null } };
}

export async function deleteLeadComment(commentId: number): Promise<void> {
  await api.delete(`/crm/lead-comments/${commentId}`);
}

export async function setLeadCommentReaction(
  commentId: number,
  emoji: string | null,
): Promise<CommentReactions> {
  const r = await api.put<CommentReactions>(`/crm/lead-comments/${commentId}/reaction`, { emoji });
  return r.data || { summary: [], mine: null };
}

export async function fetchLeadMembers(leadId: string): Promise<LeadMember[]> {
  const r = await api.get<LeadMember[]>(`/crm/leads/${leadId}/members`);
  return r.data || [];
}

export async function fetchLeadChat(leadId: string): Promise<LeadChatMessage[]> {
  const r = await api.get<LeadChatMessage[]>(`/crm/leads/${leadId}/chat`);
  return r.data || [];
}

export async function postLeadChat(leadId: string, content: string): Promise<LeadChatMessage> {
  const r = await api.post<LeadChatMessage>(`/crm/leads/${leadId}/chat`, { content });
  return r.data;
}

export async function fetchFacebookLeadMessages(leadId: string): Promise<FacebookMessage[]> {
  const r = await api.get<FacebookMessage[]>(`/facebook/leads/${leadId}/messages`);
  return r.data || [];
}

export async function sendFacebookReply(
  contactId: string,
  message: string,
  companyId?: string | null,
): Promise<FacebookMessage> {
  const qs = companyId ? `?company_id=${encodeURIComponent(companyId)}` : '';
  const r = await api.post<FacebookMessage>(`/facebook/contacts/${contactId}/reply${qs}`, { message });
  return r.data;
}

export async function fetchZaloLeadMessages(leadId: string): Promise<ZaloMessage[]> {
  const r = await api.get<ZaloMessage[]>(`/zalo/leads/${leadId}/messages`);
  return r.data || [];
}

export async function sendZaloReply(contactId: string, text: string): Promise<{ message?: ZaloMessage }> {
  const r = await api.post<{ message?: ZaloMessage }>(`/zalo/contacts/${contactId}/messages`, { text });
  return r.data;
}

export type DriveEntityChildren = {
  folders: DriveFolder[];
  files: DriveFile[];
  folder?: DriveFolder | null;
  breadcrumb?: { type: string; id: string; name: string }[];
};

export type DriveEntityLink = {
  id: string;
  file_id: string;
  note?: string | null;
  created_at?: string | null;
  file?: DriveFile | null;
};

export async function fetchDriveEntityChildren(
  entityType: 'lead' | 'deal',
  entityId: string,
  folderId?: string | null,
): Promise<DriveEntityChildren> {
  const r = await api.get<DriveEntityChildren>(`/drive/entity/${entityType}/${entityId}/children`, {
    params: folderId ? { folder_id: folderId } : {},
  });
  return r.data;
}

export async function fetchDriveLinksByEntity(
  entityType: 'lead' | 'deal',
  entityId: string,
): Promise<DriveEntityLink[]> {
  const r = await api.get<{ links: DriveEntityLink[] }>(`/drive/links/by-entity/${entityType}/${entityId}`);
  return r.data.links || [];
}
