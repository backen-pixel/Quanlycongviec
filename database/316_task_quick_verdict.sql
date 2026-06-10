-- 316: Ghi chú nhanh Đã đủ / Chưa + lý do (yes/no) trên nhiệm vụ.
-- Idempotent.

BEGIN;

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS requires_quick_verdict BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN workshop_task_template_items.requires_quick_verdict IS
  'True: NV phải chọn Đã đủ hoặc Chưa (+ lý do) trước khi hoàn thành / chuyển pipeline.';

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS requires_quick_verdict BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS requires_quick_verdict BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS quick_verdict TEXT NULL;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS quick_verdict_reason TEXT NULL;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS quick_verdict_at TIMESTAMPTZ NULL;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS quick_verdict_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_quick_verdict_check'
  ) THEN
    ALTER TABLE crm_tasks
      ADD CONSTRAINT crm_tasks_quick_verdict_check
      CHECK (quick_verdict IS NULL OR quick_verdict IN ('sufficient', 'insufficient'));
  END IF;
END $$;

COMMENT ON COLUMN crm_tasks.quick_verdict IS 'sufficient = Đã đủ; insufficient = Chưa (kèm quick_verdict_reason).';
COMMENT ON COLUMN crm_tasks.quick_verdict_reason IS 'Lý do bắt buộc khi quick_verdict = insufficient.';

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS requires_quick_verdict BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS quick_verdict TEXT NULL;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS quick_verdict_reason TEXT NULL;

COMMIT;
