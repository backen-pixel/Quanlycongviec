-- 22_spec_factor.sql
-- Thêm cột hệ số quy cách (spec_factor) vào quotation_items
-- Công thức: Thành tiền = spec_factor × SL × Đơn giá (nếu spec_factor > 0)
-- Nếu spec_factor = NULL hoặc 0: tính bình thường SL × Đơn giá

ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS spec_factor NUMERIC;

-- Cũng thêm vào order_items + invoice_items nếu cần dùng sau
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS spec_factor NUMERIC;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS spec_factor NUMERIC;

COMMENT ON COLUMN quotation_items.spec_factor IS 'Hệ số quy cách: nhân vào SL×ĐG. VD: mét dài ngang tủ = 5.175 → Thành tiền = 5.175 × 1 × 5,257,000';
COMMENT ON COLUMN order_items.spec_factor IS 'Hệ số quy cách: nhân vào SL×ĐG';
COMMENT ON COLUMN invoice_items.spec_factor IS 'Hệ số quy cách: nhân vào SL×ĐG';
