-- Giảm giá tổng (khác chiết khấu) trên báo giá
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sale_discount_type TEXT DEFAULT 'amount';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sale_discount_value NUMERIC DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sale_discount_amount NUMERIC DEFAULT 0;

COMMENT ON COLUMN quotations.sale_discount_type IS 'Giảm giá tổng: percent | amount (áp sau chiết khấu tổng)';
COMMENT ON COLUMN quotations.sale_discount_value IS 'Giá trị % hoặc VNĐ giảm giá tổng';
COMMENT ON COLUMN quotations.sale_discount_amount IS 'Số tiền giảm giá tổng đã tính';
