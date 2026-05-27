-- 251_production_pipeline_workshop_type.sql
-- Gắn pipeline xưởng theo Loại dự án (workshop_project_types) — phân loại của công ty.
-- NULL workshop_type_id = pipeline áp dụng cho mọi loại trong công ty đó (Global).
-- Idempotent.

BEGIN;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS workshop_type_id UUID NULL
    REFERENCES workshop_project_types(id) ON DELETE CASCADE;

COMMENT ON COLUMN production_pipeline_stages.workshop_type_id IS
  'Khi NOT NULL: cột pipeline chỉ áp dụng cho 1 loại dự án xưởng (workshop_project_types). NULL = áp dụng mọi loại trong công ty.';

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_workshop_type
  ON production_pipeline_stages (company_id, workshop_type_id)
  WHERE workshop_type_id IS NOT NULL;

COMMIT;
