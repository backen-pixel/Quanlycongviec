-- 293_production_workshop_type_default_staff.sql
-- NV mặc định gắn dự án SX theo phân loại xưởng (workshop_project_types) + công ty.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS production_workshop_type_default_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workshop_type_id UUID NOT NULL REFERENCES workshop_project_types(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (production_company_id, workshop_type_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_ws_type_staff_co_type
  ON production_workshop_type_default_staff (production_company_id, workshop_type_id);

COMMENT ON TABLE production_workshop_type_default_staff IS
  'Nhân viên mặc định khi dự án SX vào xưởng — theo (công ty, phân loại). Có thể nhiều NV / loại.';

CREATE TABLE IF NOT EXISTS project_production_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_production_staff_project
  ON project_production_staff (project_id);

COMMENT ON TABLE project_production_staff IS
  'Nhiều NV sản xuất gắn 1 dự án (copy từ defaults khi intake). production_person_id = NV đầu tiên.';

COMMIT;
