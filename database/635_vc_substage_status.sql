-- 635: Tích hoàn thành cột VC/LĐ dùng chung bảng project_substage_status.
-- stage_id (SX) giữ nguyên. Cột VC ghi logistics_stage_id, stage_id để trống.
-- Idempotent.

ALTER TABLE project_substage_status
  ALTER COLUMN stage_id DROP NOT NULL;

ALTER TABLE project_substage_status
  ADD COLUMN IF NOT EXISTS logistics_stage_id uuid
    REFERENCES logistics_pipeline_stages(id) ON DELETE CASCADE;

ALTER TABLE project_substage_status
  DROP CONSTRAINT IF EXISTS project_substage_status_one_stage_chk;

ALTER TABLE project_substage_status
  ADD CONSTRAINT project_substage_status_one_stage_chk CHECK (
    (stage_id IS NOT NULL AND logistics_stage_id IS NULL)
    OR (stage_id IS NULL AND logistics_stage_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS project_substage_status_vc_uniq
  ON project_substage_status (project_id, logistics_stage_id)
  WHERE logistics_stage_id IS NOT NULL;

COMMENT ON COLUMN project_substage_status.logistics_stage_id IS
  'Cot pipeline VC/LD. Chi dien khi stage_id (SX) de trong.';
