-- Tách "Đơn hàng kế toán" (sales) khỏi "Đơn theo đợt nhiệm vụ" (fulfillment).
-- orders.order_kind:
--   - 'sales': đơn bán hàng/báo giá/hóa đơn (kế toán)
--   - 'fulfillment': đơn 1/2/3... chỉ để gom nhiệm vụ & chuyển module

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_kind TEXT NOT NULL DEFAULT 'sales';

CREATE INDEX IF NOT EXISTS idx_orders_kind ON orders(order_kind);

COMMENT ON COLUMN orders.order_kind IS
  'sales = đơn bán hàng/kế toán; fulfillment = đơn theo đợt nhiệm vụ (Đơn 1/2/3...), không dùng cho kế toán.';

