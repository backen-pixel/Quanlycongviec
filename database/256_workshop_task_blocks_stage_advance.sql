-- 256_workshop_task_blocks_stage_advance.sql
-- Parity bộ nhiệm vụ Sản xuất với CRM:
--   A. workshop_task_template_items.blocks_stage_advance
--      → khi gen sx_* (crm_tasks) hoặc áp mẫu vào tasks dự án, kế thừa cờ.
--      → khi cờ bật + status chưa hoàn thành/hủy: KHÔNG cho kéo cột Kanban SX.
--   B/C. workshop_task_templates.production_stage_id / logistics_stage_id (migration 249 chưa apply trên môi trường này — gộp lại idempotent).
--        tasks.production_stage_id + tasks.blocks_stage_advance (track cột pipeline SX + cờ chặn cho tasks dự án).
--   D. crm_tasks.production_pipeline_stage_id (gắn task sx_* với cột pipeline SX thật của công ty + workshop_type).
--
-- Idempotent.

BEGIN;

-- ── A. Cờ chặn trên mẫu item ────────────────────────────────────────────────
ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS blocks_stage_advance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN workshop_task_template_items.blocks_stage_advance IS
  'True: task sinh từ mẫu xưởng (crm_tasks sx_* hoặc tasks dự án) sẽ chặn kéo cột Kanban SX khi chưa completed/cancelled. Áp dụng tương đương crm_task_template_items.blocks_stage_advance.';

-- ── B/C. Mẫu xưởng gắn cột pipeline + tasks dự án track cột pipeline + cờ ──
ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS production_stage_id UUID NULL
    REFERENCES production_pipeline_stages(id) ON DELETE CASCADE;

ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS logistics_stage_id UUID NULL
    REFERENCES logistics_pipeline_stages(id) ON DELETE CASCADE;

COMMENT ON COLUMN workshop_task_templates.production_stage_id IS
  'NOT NULL: bộ mẫu chỉ áp dụng cho 1 cột production_pipeline_stages. NULL = Global của công ty / toàn hệ thống.';
COMMENT ON COLUMN workshop_task_templates.logistics_stage_id IS
  'NOT NULL: bộ mẫu chỉ áp dụng cho 1 cột logistics_pipeline_stages. NULL = Global.';

CREATE INDEX IF NOT EXISTS idx_workshop_task_templates_production_stage
  ON workshop_task_templates (production_stage_id)
  WHERE production_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_task_templates_logistics_stage
  ON workshop_task_templates (logistics_stage_id)
  WHERE logistics_stage_id IS NOT NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS production_stage_id UUID NULL
    REFERENCES production_pipeline_stages(id) ON DELETE SET NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS blocks_stage_advance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.production_stage_id IS
  'Cột pipeline SX (production_pipeline_stages) mà task thuộc về — kế thừa từ workshop_task_templates.production_stage_id khi áp mẫu.';
COMMENT ON COLUMN tasks.blocks_stage_advance IS
  'True: task này chặn kéo cột Kanban SX của dự án khi chưa done/cancelled. Kế thừa từ workshop_task_template_items.blocks_stage_advance.';

CREATE INDEX IF NOT EXISTS idx_tasks_project_production_stage
  ON tasks (project_id, production_stage_id)
  WHERE production_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_production_blocking
  ON tasks (project_id, production_stage_id)
  WHERE blocks_stage_advance = true
    AND production_stage_id IS NOT NULL
    AND status <> 'done';

-- ── D. Liên kết sx_* CRM với cột pipeline thật ──────────────────────────────
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS production_pipeline_stage_id UUID NULL
    REFERENCES production_pipeline_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_tasks.production_pipeline_stage_id IS
  'Cột pipeline SX (production_pipeline_stages) mà task sx_* thuộc về — gen từ workshop_task_templates.production_stage_id. Dùng cho gate chặn kéo cột Kanban SX của project.';

CREATE INDEX IF NOT EXISTS idx_crm_tasks_production_pipeline_stage
  ON crm_tasks (lead_id, production_pipeline_stage_id)
  WHERE production_pipeline_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_sx_blocking
  ON crm_tasks (lead_id, production_pipeline_stage_id)
  WHERE blocks_stage_advance = true
    AND production_pipeline_stage_id IS NOT NULL
    AND status <> 'completed'
    AND status <> 'cancelled';

COMMIT;
