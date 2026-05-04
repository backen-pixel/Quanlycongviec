-- Liên kết lead_documents mirror với nhiệm vụ dự án (tasks) để đồng bộ ghi chú qua module.

ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS source_project_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_documents_source_project_task
  ON lead_documents(source_project_task_id)
  WHERE source_project_task_id IS NOT NULL;

COMMENT ON COLUMN lead_documents.source_project_task_id IS
  'Nếu có: bản ghi là ảnh ghi chú/mô tả đồng bộ từ tasks (NV dự án).';
