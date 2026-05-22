-- 213_crm_task_blocks_stage_advance.sql
-- Cờ "chặn chuyển giai đoạn" cho nhiệm vụ CRM:
--   - Khi bật trên crm_task_template_items, task sinh từ mẫu sẽ kế thừa cờ.
--   - Khi tick trên crm_tasks, lead/deal không thể được chuyển sang giai đoạn
--     khác (kéo Kanban / PATCH stage) nếu task còn chưa hoàn thành.
--   - Vẫn cho phép chuyển sang cột Thắng / Thua / Huỷ (xử lý ở backend).
--   - Áp dụng cho cả Lead và Deal (giai đoạn được map qua stage_slug của task).
-- Idempotent.

BEGIN;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS blocks_stage_advance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_task_template_items.blocks_stage_advance IS
  'True: task sinh từ mẫu sẽ chặn chuyển giai đoạn của lead/deal đến khi hoàn thành.';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS blocks_stage_advance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_tasks.blocks_stage_advance IS
  'Kế thừa từ crm_task_template_items khi gen/tạo từ mẫu. True: lead/deal không thể chuyển giai đoạn (trừ Thắng/Thua/Huỷ) khi task chưa completed.';

-- Index cho gate query (lead_id + stage_slug + status còn chưa hoàn thành & blocks_stage_advance = true)
CREATE INDEX IF NOT EXISTS idx_crm_tasks_blocks_lookup
  ON crm_tasks (lead_id, stage_slug)
  WHERE blocks_stage_advance = true AND status <> 'completed' AND status <> 'cancelled';

COMMIT;
