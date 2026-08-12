-- Nhiều đợt cọc trên báo giá / deal CRM (Cọc lần 1, Cọc lần 2, …)
-- Giữ deposit_amount / deposit_received / deposit_label làm tổng hợp để tương thích sync SX & UI cũ.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS deposit_installments JSONB;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS deposit_installments JSONB;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deposit_installments JSONB;

COMMENT ON COLUMN quotations.deposit_installments IS
  'Mảng đợt cọc [{amount, received, label}] — tổng hợp vào deposit_amount/received/label';
COMMENT ON COLUMN crm_leads.deposit_installments IS
  'Mảng đợt cọc [{amount, received, label}] trên deal CRM';
COMMENT ON COLUMN orders.deposit_installments IS
  'Snapshot đợt cọc từ báo giá khi tạo đơn';
