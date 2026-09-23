-- 624: Loại chi phí theo module, gắn bộ mẫu công việc, bắt upload Excel, dùng trong công thức.
-- Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS cost_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  region_id UUID REFERENCES company_regions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  module_key TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_types_company_code
  ON cost_types (company_id, lower(code))
  WHERE region_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_types_company_region_code
  ON cost_types (company_id, region_id, lower(code))
  WHERE region_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_types_company_module
  ON cost_types (company_id, module_key)
  WHERE is_active = TRUE;

ALTER TABLE cost_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_cost_types" ON cost_types;
CREATE POLICY "service_all_cost_types" ON cost_types FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE cost_types IS
  'Loại chi phí do user tạo: gắn module (SX/VC/CRM/…) và dùng làm toán hạng Excel trong công thức.';

CREATE TABLE IF NOT EXISTS cost_type_template_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_type_id UUID NOT NULL REFERENCES cost_types(id) ON DELETE CASCADE,
  template_kind TEXT NOT NULL CHECK (template_kind IN ('workshop', 'crm', 'app_module')),
  template_id UUID NOT NULL,
  require_excel BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cost_type_id, template_kind, template_id)
);

CREATE INDEX IF NOT EXISTS idx_cost_type_template_links_tpl
  ON cost_type_template_links (template_kind, template_id);

ALTER TABLE cost_type_template_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_cost_type_template_links" ON cost_type_template_links;
CREATE POLICY "service_all_cost_type_template_links" ON cost_type_template_links
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE cost_type_template_links IS
  'Bộ mẫu công việc (SX/VC/CRM) bắt upload Excel của loại chi phí này.';

CREATE TABLE IF NOT EXISTS cost_excel_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  cost_type_id UUID NOT NULL REFERENCES cost_types(id) ON DELETE CASCADE,
  module_key TEXT,
  file_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  row_count INT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_excel_uploads_project_type
  ON cost_excel_uploads (project_id, cost_type_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_excel_uploads_project
  ON cost_excel_uploads (project_id);

ALTER TABLE cost_excel_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_cost_excel_uploads" ON cost_excel_uploads;
CREATE POLICY "service_all_cost_excel_uploads" ON cost_excel_uploads
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE cost_excel_uploads IS
  'File Excel chi phí theo dự án + loại. amount = tổng cột tiền, đẩy lên sổ source excel.<code>.';

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS require_cost_excel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS cost_type_id UUID REFERENCES cost_types(id) ON DELETE SET NULL;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS require_cost_excel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS cost_type_id UUID REFERENCES cost_types(id) ON DELETE SET NULL;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS require_cost_excel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS cost_type_id UUID REFERENCES cost_types(id) ON DELETE SET NULL;

COMMIT;
