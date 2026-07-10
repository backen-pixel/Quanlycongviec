-- 380: Tiền đã thu (tách khỏi tiền cọc) trên dự án SX
ALTER TABLE projects ADD COLUMN IF NOT EXISTS collected_amount NUMERIC;

COMMENT ON COLUMN projects.collected_amount IS 'Tổng tiền đã thu khách (không gồm tiền cọc); dùng khi chưa ghi qua HĐ CRM hoặc bổ sung theo dõi SX';
