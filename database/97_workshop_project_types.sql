-- Loại dự án xưởng (SX / VC / cả hai) theo từng công ty — tương tự crm_lead_types

CREATE TABLE IF NOT EXISTS workshop_project_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('production', 'logistics', 'both')),
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workshop_project_types_company_name_uq
  ON workshop_project_types (company_id, lower(name));

CREATE INDEX IF NOT EXISTS workshop_project_types_company_active_idx
  ON workshop_project_types (company_id, is_active, order_index);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workshop_type_id UUID REFERENCES workshop_project_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_workshop_type_id_idx
  ON projects (workshop_type_id)
  WHERE workshop_type_id IS NOT NULL;

COMMENT ON TABLE workshop_project_types IS 'Phân loại dự án xưởng (sản xuất / vận chuyển) theo công ty';
COMMENT ON COLUMN projects.workshop_type_id IS 'Loại công việc xưởng (cùng bảng cho SX & VC)';
