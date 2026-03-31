-- ══════════════════════════════════════════════════════════════
-- 22. Shared Task Notes — Chia sẻ ghi chú nhiệm vụ CRM cho Khối khác
-- ══════════════════════════════════════════════════════════════

-- Thêm cột shared_to_project vào crm_tasks
-- Khi bật (true): ghi chú + đính kèm hiển thị trong ProjectDetail cho các Khối khác
-- Khi tắt (false): chỉ Khối Kinh doanh (CRM) mới thấy
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS shared_to_project boolean DEFAULT false;

-- Index cho query nhanh
CREATE INDEX IF NOT EXISTS idx_crm_tasks_shared ON crm_tasks (lead_id, shared_to_project) WHERE shared_to_project = true;
