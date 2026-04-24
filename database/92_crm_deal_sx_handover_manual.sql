-- Migration 92: Bàn giao deal CRM → Sản xuất thủ công (xác nhận sale + ngày kế hoạch)
-- crm_leads: thời điểm xác nhận + ngày; projects: đồng bộ ngày cho xưởng

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS sx_handover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sx_handover_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS construction_start_date DATE,
  ADD COLUMN IF NOT EXISTS expected_production_start_date DATE,
  ADD COLUMN IF NOT EXISTS expected_production_end_date DATE;

COMMENT ON COLUMN crm_leads.sx_handover_at IS 'Sale đã xác nhận bàn giao SX trong chi tiết deal — trước đó không tự đổi stage CRM theo Kanban xưởng';
COMMENT ON COLUMN crm_leads.construction_start_date IS 'Ngày bắt đầu công trình (kế hoạch)';
COMMENT ON COLUMN crm_leads.expected_production_start_date IS 'Ngày dự kiến bắt đầu sản xuất';
COMMENT ON COLUMN crm_leads.expected_production_end_date IS 'Ngày dự kiến hoàn thành sản xuất';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS construction_start_date DATE,
  ADD COLUMN IF NOT EXISTS expected_production_start_date DATE;

-- Deal đã gắn dự án trước migration: coi như đã bàn giao để không đứng pipeline
UPDATE crm_leads
SET sx_handover_at = COALESCE(updated_at, created_at, NOW())
WHERE type = 'deal'
  AND project_id IS NOT NULL
  AND sx_handover_at IS NULL;
