-- Link báo giá (quotations) với "đơn theo đợt" (Đơn 1/2/3...) trong mô hình nhiệm vụ theo đơn.
-- Không ảnh hưởng module Đơn hàng/Hóa đơn; chỉ để truy vết Excel import: báo giá của Đơn nào, thuộc lead/deal nào.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS fulfillment_lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS fulfillment_label TEXT;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS source_task_id UUID REFERENCES crm_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_fulfillment_lead_id ON quotations(fulfillment_lead_id);
CREATE INDEX IF NOT EXISTS idx_quotations_source_task_id ON quotations(source_task_id);

COMMENT ON COLUMN quotations.fulfillment_lead_id IS 'Deal/lead con theo Đơn 1/2/3... dùng để chứa nhiệm vụ (fulfillment).';
COMMENT ON COLUMN quotations.fulfillment_label IS 'Nhãn đơn theo đợt (vd: Đơn 1) để hiển thị/trace trong báo giá.';
COMMENT ON COLUMN quotations.source_task_id IS 'Task CRM nơi thực hiện import Excel báo giá.';

