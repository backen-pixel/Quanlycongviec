-- Đính kèm / ghi chú theo từng mục checklist con (crm_tasks.checklist[].id).
ALTER TABLE crm_task_attachments
  ADD COLUMN IF NOT EXISTS checklist_id TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_task_att_checklist
  ON crm_task_attachments (task_id, checklist_id)
  WHERE checklist_id IS NOT NULL;

-- Tab Tài liệu CRM: nhóm theo nhiệm vụ + mục checklist.
ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS source_checklist_id TEXT;

CREATE INDEX IF NOT EXISTS idx_lead_docs_checklist
  ON lead_documents (source_crm_task_id, source_checklist_id)
  WHERE source_checklist_id IS NOT NULL;
