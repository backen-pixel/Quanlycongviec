-- Đơn hàng: snapshot giống báo giá (cọc, hiệu lực, điều khoản giao hàng) + DT chuẩn trên dòng hàng

ALTER TABLE orders ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_terms TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_received BOOLEAN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_label TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining_note TEXT;

COMMENT ON COLUMN orders.valid_until IS 'Hiệu lực (chép từ báo giá khi tạo đơn)';
COMMENT ON COLUMN orders.delivery_terms IS 'Điều khoản giao hàng (chép từ báo giá)';
COMMENT ON COLUMN orders.deposit_amount IS 'Tiền cọc theo BG';
COMMENT ON COLUMN orders.remaining_amount IS 'Khoản còn lại (theo BG)';

ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS standard_area NUMERIC;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS standard_area NUMERIC;
