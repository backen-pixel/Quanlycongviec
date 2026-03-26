-- 35_document_sync_visibility.sql
-- 1. Thêm project_id vào lead_documents để sync với dự án
ALTER TABLE lead_documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 2. Thêm visibility (phân quyền xem)
-- allowed_departments: JSONB array of department_ids. NULL = tất cả được xem
ALTER TABLE lead_documents ADD COLUMN IF NOT EXISTS allowed_departments JSONB DEFAULT NULL;

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_lead_documents_project_id ON lead_documents(project_id);

-- 4. Backfill: link existing documents to project (từ deal đã có project_id)
UPDATE lead_documents ld
SET project_id = cl.project_id
FROM crm_leads cl
WHERE ld.lead_id = cl.id AND cl.project_id IS NOT NULL AND ld.project_id IS NULL;
