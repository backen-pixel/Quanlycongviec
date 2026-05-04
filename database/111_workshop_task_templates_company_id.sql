-- Gắn bộ mẫu xưởng mặc định theo công ty (ưu tiên khi tạo dự án từ deal).
-- NULL company_id = mẫu toàn cục (fallback).

ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_task_templates_company_area
  ON workshop_task_templates(company_id, workshop_area)
  WHERE company_id IS NOT NULL;

COMMENT ON COLUMN workshop_task_templates.company_id IS
  'Khi có giá trị: bộ mẫu default của công ty đó; NULL = dùng chung toàn hệ thống.';
