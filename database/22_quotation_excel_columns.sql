-- 22_quotation_excel_columns.sql
-- Thêm columns cho quotation_items để hỗ trợ import Excel báo giá tủ bếp

-- Kích thước riêng lẻ (Ngang, Sâu, Cao)
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS height NUMERIC;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS width NUMERIC;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS length NUMERIC;

-- VAT per-item
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0;

-- Nhóm SP (dòng tiêu đề nhóm: "I. PHÒNG BẾP", "II. PHÒNG KHÁCH")
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS group_name TEXT;

-- Mã hàng hóa
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS product_code TEXT;

-- Ghi chú riêng item
-- (notes column đã có trong schema gốc)
