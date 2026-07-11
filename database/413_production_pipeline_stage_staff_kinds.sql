-- 413_production_pipeline_stage_staff_kinds.sql
-- Phân loại NV tự thêm theo cột: sản xuất | vận chuyển | lắp đặt.
-- Idempotent.

BEGIN;

ALTER TABLE production_pipeline_stage_default_staff
  ADD COLUMN IF NOT EXISTS staff_kind TEXT NOT NULL DEFAULT 'production';

COMMENT ON COLUMN production_pipeline_stage_default_staff.staff_kind IS
  'production = đội SX; logistics = phụ trách vận chuyển; installation = người lắp đặt.';

-- Mỗi cột chỉ 1 NV logistics / 1 NV lắp đặt
CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_pipe_stage_staff_logistics_one
  ON production_pipeline_stage_default_staff (production_pipeline_stage_id)
  WHERE staff_kind = 'logistics';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_pipe_stage_staff_install_one
  ON production_pipeline_stage_default_staff (production_pipeline_stage_id)
  WHERE staff_kind = 'installation';

COMMIT;
