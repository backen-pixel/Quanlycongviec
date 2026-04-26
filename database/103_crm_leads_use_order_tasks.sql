-- Task mode: gom nhiệm vụ mẫu vào "Đơn 1" cho Lead/Deal mới
-- use_order_tasks=true: Lead/Deal gốc KHÔNG hiển thị/auto-gen crm_tasks ở trên,
--                       thay vào đó tasks nằm trong deal con của các đơn (fulfillment_lead_id).

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS use_order_tasks BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_crm_leads_use_order_tasks ON crm_leads(use_order_tasks);

COMMENT ON COLUMN crm_leads.use_order_tasks IS
  'true: task mẫu được gom vào Đơn 1 (deal con theo order). Lead/Deal gốc không auto-gen tasks.';

