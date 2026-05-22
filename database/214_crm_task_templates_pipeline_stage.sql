-- 214_crm_task_templates_pipeline_stage.sql
-- Tách bộ mẫu CRM theo pipeline thật của từng công ty.
--
-- Mỗi crm_task_templates có thể gắn vào 1 giai đoạn (crm_pipeline_stages) cụ thể:
--   - pipeline_stage_id IS NULL  → "Bộ mẫu chung (Global)" — áp dụng tất cả công ty
--     theo stage_slug (giữ tương thích với dữ liệu cũ).
--   - pipeline_stage_id = X      → bộ mẫu riêng cho pipeline chứa stage X
--     (chỉ hiện khi user chọn pipeline đó).
--
-- crm_tasks cũng lưu pipeline_stage_id để auto-gen / gate khớp chính xác,
-- không phụ thuộc string mapping stage_slug nữa.
--
-- Idempotent.

BEGIN;

-- ── crm_task_templates ──
ALTER TABLE crm_task_templates
  ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID NULL
    REFERENCES crm_pipeline_stages(id) ON DELETE CASCADE;

COMMENT ON COLUMN crm_task_templates.pipeline_stage_id IS
  'Khi NOT NULL: bộ mẫu chỉ áp dụng cho giai đoạn pipeline cụ thể của 1 công ty. '
  'Khi NULL: bộ mẫu chung (global) — match theo stage_slug như cũ.';

CREATE INDEX IF NOT EXISTS idx_crm_task_templates_pipeline_stage
  ON crm_task_templates (pipeline_stage_id)
  WHERE pipeline_stage_id IS NOT NULL;

-- ── crm_tasks ──
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID NULL
    REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_tasks.pipeline_stage_id IS
  'Giai đoạn pipeline thật mà task thuộc về (kế thừa từ crm_task_templates.pipeline_stage_id, '
  'hoặc set theo stage_id của lead khi auto-gen). Dùng cho gate chặn chuyển giai đoạn.';

CREATE INDEX IF NOT EXISTS idx_crm_tasks_pipeline_stage
  ON crm_tasks (lead_id, pipeline_stage_id)
  WHERE pipeline_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_blocks_pipeline_stage
  ON crm_tasks (lead_id, pipeline_stage_id)
  WHERE blocks_stage_advance = true
    AND pipeline_stage_id IS NOT NULL
    AND status <> 'completed'
    AND status <> 'cancelled';

COMMIT;
