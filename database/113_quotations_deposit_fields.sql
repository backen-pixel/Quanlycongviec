-- Tiền cọc / còn lại (quét từ Excel báo giá) — hiển thị & chỉnh trên form báo giá

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS deposit_received BOOLEAN;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS deposit_label TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS remaining_note TEXT;

COMMENT ON COLUMN quotations.deposit_amount IS 'Số tiền cọc theo báo giá (VD Excel Phúc Đạt)';
COMMENT ON COLUMN quotations.deposit_received IS 'NULL: chưa rõ; true: đã nhận cọc; false: chưa nhận';
COMMENT ON COLUMN quotations.deposit_label IS 'Mô tả dòng cọc (VD ký HĐ, lệnh SX)';
COMMENT ON COLUMN quotations.remaining_amount IS 'Số tiền còn lại khi bàn giao/nghiệm thu (nếu có)';
COMMENT ON COLUMN quotations.remaining_note IS 'Diễn giải phần còn lại';
