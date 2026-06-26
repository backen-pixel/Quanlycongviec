-- 378: Tiền cọc trên dự án SX (công nợ tính theo phần còn lại = production_value - deposit_amount)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC;

COMMENT ON COLUMN projects.deposit_amount IS 'Tiền cọc đơn hàng SX; còn lại = production_value - deposit_amount';
