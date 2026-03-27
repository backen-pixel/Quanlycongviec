-- 38_document_sync_link.sql
-- Sync link giữa lead_documents ↔ crm_task_attachments
-- Khi thêm file/ghi chú vào task → auto tạo bản lead_document (và ngược lại)
-- Khi xóa 1 bên → xóa bên kia

-- 1. lead_documents: link ngược về crm_task_attachments
ALTER TABLE lead_documents ADD COLUMN IF NOT EXISTS source_attachment_id UUID REFERENCES crm_task_attachments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lead_documents_source_att ON lead_documents(source_attachment_id) WHERE source_attachment_id IS NOT NULL;

-- 2. crm_task_attachments: link ngược về lead_documents  
ALTER TABLE crm_task_attachments ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES lead_documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_task_att_source_doc ON crm_task_attachments(source_document_id) WHERE source_document_id IS NOT NULL;

-- 3. Backfill: Sync existing task attachments → lead_documents (nếu chưa có)
-- Tạo lead_document cho mỗi crm_task_attachment chưa có link
INSERT INTO lead_documents (lead_id, name, doc_type, file_url, file_name, file_size, mime_type, notes, created_by, source_attachment_id, allowed_departments, allowed_companies)
SELECT 
  a.lead_id,
  COALESCE('[' || t.title || '] ', '') || a.name,
  a.doc_type,
  a.file_url,
  a.file_name,
  a.file_size,
  a.mime_type,
  a.notes,
  a.created_by,
  a.id,
  a.allowed_departments,
  a.allowed_companies
FROM crm_task_attachments a
LEFT JOIN crm_tasks t ON a.task_id = t.id
WHERE NOT EXISTS (
  SELECT 1 FROM lead_documents ld WHERE ld.source_attachment_id = a.id
);
