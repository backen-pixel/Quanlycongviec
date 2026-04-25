-- Đơn hàng con trên dự án: nhãn hiển thị, thứ tự, pipeline nội bộ, deal con (nhiệm vụ + VC), project VC sau khi đẩy.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_label TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sort_index INT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_phase TEXT NOT NULL DEFAULT 'draft';
-- draft | confirmed | in_production | ready_logistics | in_logistics | completed

ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS logistics_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_project_sort ON orders(project_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_lead ON orders(fulfillment_lead_id);
CREATE INDEX IF NOT EXISTS idx_orders_logistics_project ON orders(logistics_project_id);

COMMENT ON COLUMN orders.display_label IS 'Tên hiển thị đơn con (vd: Đơn 1) trong tab Đơn hàng dự án';
COMMENT ON COLUMN orders.order_phase IS 'Pipeline nội bộ theo đơn: draft→confirmed→in_production→ready_logistics→in_logistics→completed';
COMMENT ON COLUMN orders.fulfillment_lead_id IS 'Deal CRM con cho đơn (nhiệm vụ riêng; project_id chuyển sang logistics_project khi đẩy VC)';
COMMENT ON COLUMN orders.logistics_project_id IS 'Dự án con trên Kanban VC sau khi bàn giao đơn';

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS parent_lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_parent_lead ON crm_leads(parent_lead_id);

COMMENT ON COLUMN crm_leads.parent_lead_id IS 'Deal/lead cha (vd deal tổng — deal con theo từng đơn hàng)';
