-- Thông tin chuyển đơn theo đợt nhiệm vụ sang module Sản xuất (SX)
-- (áp dụng cho đơn fulfillment / Đơn 1-2-3..., không phải đơn kế toán)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sx_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sx_start_date DATE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sx_expected_end_date DATE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sx_construction_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_sx_company_id ON orders(sx_company_id);

COMMENT ON COLUMN orders.sx_company_id IS 'Công ty/phân hệ SX nhận đơn (dùng để lọc module production).';
COMMENT ON COLUMN orders.sx_start_date IS 'Ngày bắt đầu sản xuất dự kiến cho đơn theo đợt.';
COMMENT ON COLUMN orders.sx_expected_end_date IS 'Ngày dự kiến hoàn thành sản xuất cho đơn theo đợt.';
COMMENT ON COLUMN orders.sx_construction_assignee_id IS 'Người dự kiến thi công/lắp đặt (phục vụ SX).';

