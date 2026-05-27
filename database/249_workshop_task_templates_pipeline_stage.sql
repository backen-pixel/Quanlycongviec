-- 249_workshop_task_templates_pipeline_stage.sql
-- Gắn bộ mẫu xưởng theo cột pipeline SX / VC (theo công ty).
-- NULL *_stage_id = bộ mẫu chung (Global) của công ty hoặc toàn hệ thống.
-- Idempotent.

BEGIN;

ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS production_stage_id UUID NULL
    REFERENCES production_pipeline_stages(id) ON DELETE CASCADE;

ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS logistics_stage_id UUID NULL
    REFERENCES logistics_pipeline_stages(id) ON DELETE CASCADE;

COMMENT ON COLUMN workshop_task_templates.production_stage_id IS
  'Khi NOT NULL: bộ mẫu chỉ áp dụng cho cột production_pipeline_stages cụ thể. NULL = Global.';

COMMENT ON COLUMN workshop_task_templates.logistics_stage_id IS
  'Khi NOT NULL: bộ mẫu chỉ áp dụng cho cột logistics_pipeline_stages cụ thể. NULL = Global.';

CREATE INDEX IF NOT EXISTS idx_workshop_task_templates_production_stage
  ON workshop_task_templates (production_stage_id)
  WHERE production_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_task_templates_logistics_stage
  ON workshop_task_templates (logistics_stage_id)
  WHERE logistics_stage_id IS NOT NULL;

-- tasks: track which SX pipeline column spawned the task
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS production_stage_id UUID NULL
    REFERENCES production_pipeline_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN tasks.production_stage_id IS
  'Cột pipeline SX mà task thuộc về (kế thừa từ workshop_task_templates khi áp mẫu).';

CREATE INDEX IF NOT EXISTS idx_tasks_project_production_stage
  ON tasks (project_id, production_stage_id)
  WHERE production_stage_id IS NOT NULL;

COMMIT;
