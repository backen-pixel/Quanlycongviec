export type CrmStage = {
  id: string;
  name: string;
  color?: string;
  icon?: string | null;
  pipeline_type?: string;
  order_index?: number;
  is_won?: boolean;
  is_lost?: boolean;
};

export type CrmLeadListItem = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
  stage_id?: string | null;
  company_id?: string | null;
  source_id?: string | null;
  description?: string | null;
  install_address?: string | null;
  phone?: string | null;
  assigned_to?: string | null;
  lead_owner_id?: string | null;
  stage?: CrmStage | null;
  customer?: {
    id?: string;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    company?: string | null;
  } | null;
  company?: { id?: string; name?: string | null; short_name?: string | null } | null;
  estimated_value?: number | null;
  created_at?: string | null;
  is_new_for_current_user?: boolean;
  assignee?: { id?: string; full_name?: string | null } | null;
  lead_owner?: { id?: string; full_name?: string | null } | null;
  source?: { id?: string; name?: string | null; icon?: string | null } | null;
};

export type CrmLeadDetail = CrmLeadListItem & {
  company_id?: string | null;
  customer?: {
    id?: string;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
    address?: string | null;
    tax_code?: string | null;
  } | null;
  assignee?: { id?: string; full_name?: string | null } | null;
  lead_owner?: { id?: string; full_name?: string | null } | null;
  source?: { id?: string; name?: string | null; icon?: string | null } | null;
  lost_reason?: string | null;
  lost_at?: string | null;
  project_id?: string | null;
};

export type CrmActivity = {
  id: string;
  type?: string;
  title?: string | null;
  description?: string | null;
  activity_date?: string | null;
  creator?: { id?: string; full_name?: string | null } | null;
};

export type CrmLeadMember = {
  id?: string;
  user_id: string;
  role?: string | null;
  user?: { id?: string; full_name?: string | null; email?: string | null } | null;
};

export type CrmLeadMessage = {
  id: string;
  lead_id?: string | null;
  user_id?: string | null;
  content?: string | null;
  created_at?: string | null;
  message_type?: string | null;
  is_system?: boolean;
  user?: { id?: string; full_name?: string | null } | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachments?: { name?: string; url?: string; type?: string }[] | null;
};

export type CrmDocument = {
  id: string;
  name?: string | null;
  doc_type?: string | null;
  file_url?: string | null;
  /** Bản sao từ file nhiệm vụ — ẩn khỏi danh sách «tài liệu lead» trên web */
  source_attachment_id?: string | null;
  is_from_task?: boolean;
};

export type CrmTask = {
  id: string;
  title?: string | null;
  description?: string | null;
  deadline?: string | null;
  priority?: string | null;
  stage_slug?: string | null;
  status?: string | null;
  assignee_id?: string | null;
  supervisor_id?: string | null;
  assignee?: { full_name?: string | null } | null;
  /** Ghi chú nhanh trên nhiệm vụ (API PUT .../notes) */
  notes?: string | null;
  shared_to_project?: boolean | null;
  file_count?: number | null;
  note_count?: number | null;
};

export type CrmCompany = { id: string; name?: string; short_name?: string | null };
export type CrmSource = {
  id: string;
  name?: string;
  code?: string | null;
  description?: string | null;
  icon?: string | null;
};

/** Bản ghi âm CRM (API `/voice-recordings`) */
export type CrmVoiceRecording = {
  id: string;
  user_id?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  duration_sec?: number | null;
  source?: string | null;
  device_label?: string | null;
  notes?: string | null;
  created_at?: string | null;
  phone_number?: string | null;
  direction?: string | null;
  audio_url?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  customer?: { id?: string; full_name?: string | null; phone?: string | null } | null;
  lead?: { id?: string; code?: string | null; title?: string | null; type?: string | null } | null;
  uploader?: { id?: string; full_name?: string | null; email?: string | null } | null;
};
