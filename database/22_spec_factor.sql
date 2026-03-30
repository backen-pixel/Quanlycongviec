-- 22_spec_factor.sql
-- Thêm cột hệ số quy cách (spec_factor) + tên nhóm (group_name) vào quotation_items
-- Công thức: Thành tiền = spec_factor × SL × Đơn giá (nếu spec_factor > 0)
-- Nếu spec_factor = NULL hoặc 0: tính bình thường SL × Đơn giá

ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS spec_factor NUMERIC;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS group_name TEXT;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS spec_factor NUMERIC;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS group_name TEXT;

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS spec_factor NUMERIC;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS group_name TEXT;

COMMENT ON COLUMN quotation_items.spec_factor IS 'Hệ số quy cách: nhân vào SL×ĐG. VD: mét dài ngang tủ = 5.175';
COMMENT ON COLUMN quotation_items.group_name IS 'Tên nhóm hàng hóa (VD: I. PHÒNG BẾP, II. PHỤ KIỆN)';
COMMENT ON COLUMN order_items.spec_factor IS 'Hệ số quy cách: nhân vào SL×ĐG';
COMMENT ON COLUMN order_items.group_name IS 'Tên nhóm hàng hóa';
COMMENT ON COLUMN invoice_items.spec_factor IS 'Hệ số quy cách: nhân vào SL×ĐG';
COMMENT ON COLUMN invoice_items.group_name IS 'Tên nhóm hàng hóa';
