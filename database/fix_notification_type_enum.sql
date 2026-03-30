-- ═══════════════════════════════════════════════════════════════
-- FIX: Chuyển notifications.type từ ENUM → TEXT
-- Nguyên nhân: enum notification_type không chứa các type mới
-- (lead_created, deal_created, quotation_created, order_created, 
--  invoice_created, payment_received, lead_stage_changed, ...)
-- ═══════════════════════════════════════════════════════════════

-- Bước 1: Đổi cột type sang TEXT
ALTER TABLE notifications ALTER COLUMN type TYPE TEXT USING type::TEXT;

-- Bước 2: Xóa enum cũ (nếu không dùng ở nơi khác)
-- DROP TYPE IF EXISTS notification_type;
