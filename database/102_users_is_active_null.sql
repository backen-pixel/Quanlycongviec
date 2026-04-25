-- Fix: users có is_active = NULL bị loại bởi .eq('is_active', true) → login 401, danh bạ thiếu user.
-- Chuẩn hóa: NULL → true (đang hoạt động).

UPDATE users SET is_active = true WHERE is_active IS NULL;

-- Đặt default cho cột để tránh lặp lại
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true;

COMMENT ON COLUMN users.is_active IS 'false = vô hiệu hóa; true hoặc mặc định = hoạt động bình thường';
