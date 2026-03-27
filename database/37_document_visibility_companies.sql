-- 37_document_visibility_companies.sql
-- Mở rộng phân quyền: thêm allowed_companies bên cạnh allowed_departments

-- 1. Thêm cột allowed_companies vào lead_documents
ALTER TABLE lead_documents ADD COLUMN IF NOT EXISTS allowed_companies JSONB DEFAULT NULL;

-- 2. Thêm vào crm_task_attachments (tài liệu đính kèm CRM task)
ALTER TABLE crm_task_attachments ADD COLUMN IF NOT EXISTS allowed_companies JSONB DEFAULT NULL;
ALTER TABLE crm_task_attachments ADD COLUMN IF NOT EXISTS allowed_departments JSONB DEFAULT NULL;

-- Logic phân quyền:
-- allowed_companies = NULL AND allowed_departments = NULL → tất cả xem được
-- allowed_companies = ["company_id_1"] → chỉ user thuộc company đó
-- allowed_departments = ["dept_id_1"] → chỉ user thuộc department đó
-- Có cả 2 → user thuộc 1 trong 2 list đều được xem
-- Admin luôn xem được tất cả
