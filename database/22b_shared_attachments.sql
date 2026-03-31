-- ══════════════════════════════════════════════════════════════
-- 22b. Shared Task Attachments — Chia sẻ từng file/ghi chú riêng lẻ
-- ══════════════════════════════════════════════════════════════

-- Thêm cột shared_to_project vào crm_task_attachments
ALTER TABLE crm_task_attachments ADD COLUMN IF NOT EXISTS shared_to_project boolean DEFAULT false;

-- Index
CREATE INDEX IF NOT EXISTS idx_crm_task_att_shared ON crm_task_attachments (task_id, shared_to_project) WHERE shared_to_project = true;
