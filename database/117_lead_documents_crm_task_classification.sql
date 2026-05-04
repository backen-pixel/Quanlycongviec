-- Phân loại tài liệu đồng bộ từ nhiệm vụ CRM: giai đoạn (module KD/Deal/SX) + liên kết task

ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS source_crm_task_id UUID REFERENCES crm_tasks(id) ON DELETE SET NULL;

ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS crm_stage_slug TEXT;

ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS crm_stage_group_label TEXT;

COMMENT ON COLUMN lead_documents.source_crm_task_id IS 'Nhiệm vụ CRM tạo ra bản ghi (ghi chú / đính kèm đồng bộ)';
COMMENT ON COLUMN lead_documents.crm_stage_slug IS 'stage_slug của crm_tasks — filter theo giai đoạn pipeline';
COMMENT ON COLUMN lead_documents.crm_stage_group_label IS 'Nhãn nhóm nhiệm vụ lớn (Tư vấn, Báo giá & HĐ, Tiếp nhận SX, …)';

CREATE INDEX IF NOT EXISTS idx_lead_documents_crm_stage ON lead_documents(lead_id, crm_stage_slug);
CREATE INDEX IF NOT EXISTS idx_lead_documents_source_crm_task ON lead_documents(source_crm_task_id) WHERE source_crm_task_id IS NOT NULL;
