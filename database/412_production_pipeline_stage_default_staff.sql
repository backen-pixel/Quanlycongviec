-- 412_production_pipeline_stage_default_staff.sql
-- Thành viên tự động thêm vào deal/dự án khi kéo thẻ SX vào cột pipeline.
-- Idempotent.

BEGIN;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS auto_add_members_on_enter BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN production_pipeline_stages.auto_add_members_on_enter IS
  'Khi bật: mỗi lần dự án vào cột này, gộp NV cấu hình vào project_production_staff + tab Thành viên deal.';

CREATE TABLE IF NOT EXISTS production_pipeline_stage_default_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_pipeline_stage_id UUID NOT NULL REFERENCES production_pipeline_stages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (production_pipeline_stage_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_pipe_stage_staff_stage
  ON production_pipeline_stage_default_staff (production_pipeline_stage_id);

COMMENT ON TABLE production_pipeline_stage_default_staff IS
  'NV tự thêm khi dự án SX vào cột pipeline (gộp, không ghi đè NV hiện có).';

COMMIT;
