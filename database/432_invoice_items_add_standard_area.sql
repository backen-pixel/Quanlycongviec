-- Thêm cột standard_area cho invoice_items để đồng bộ với quotation_items / order_items
-- (dùng cho hiển thị "DT Chuẩn" / "DT Thực" giống giao diện Báo giá & Đơn hàng)
-- Đã áp dụng trực tiếp lên DB qua Supabase Management API.

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS standard_area numeric;
