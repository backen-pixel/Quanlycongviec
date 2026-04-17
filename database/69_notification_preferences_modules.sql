-- Bật/tắt thông báo theo module (CRM lead/deal, hạn CRM, hạn nhiệm vụ dự án-sản xuất).
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS lead_new BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS deal_new BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS production_deadlines BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS crm_lead_deadlines BOOLEAN DEFAULT true;

COMMENT ON COLUMN notification_preferences.lead_new IS 'Lead mới (lead_created, …)';
COMMENT ON COLUMN notification_preferences.deal_new IS 'Deal mới / giao deal (deal_created, deal_assigned, …)';
COMMENT ON COLUMN notification_preferences.production_deadlines IS 'Hạn nhiệm vụ dự án / SX (deadline_* entity task)';
COMMENT ON COLUMN notification_preferences.crm_lead_deadlines IS 'Hạn nhiệm vụ CRM trên lead (crm_deadline_*)';
