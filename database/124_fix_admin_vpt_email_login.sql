-- 124: Khắc phục đăng nhập sau khi đổi email admin VPT (.local → .vn)
--
-- Nguyên nhân thường gặp: đổi email trong DB nhưng UNIQUE trùng, hoặc nhập đăng nhập khác khoảng trắng/chữ hoa,
-- hoặc chỉ sửa file SQL mà chưa chạy UPDATE trên DB thật.
--
-- Chạy trên Supabase SQL Editor hoặc psql. Sau đó đăng nhập:
--   Email: admin.vpt@vanphuthanh.vn
--   Mật khẩu: VptAdmin@2026  (sau bước 2 dưới đây)

-- Bước 1 — Đổi email cũ → .vn (nếu tài khoản vẫn là .local)
UPDATE users
SET email = 'admin.vpt@vanphuthanh.vn',
    updated_at = now()
WHERE email = 'admin.vpt@vanphuthanh.local';

-- Bước 2 — Đặt lại mật khẩu chuẩn VptAdmin@2026 (bcrypt 12, khớp migration 123)
-- Bỏ qua bước này nếu bạn chắc mật khẩu vẫn đúng.
UPDATE users
SET password = '$2b$12$HHOAM2Yb5RPBibscFcGpQetK4tgo4Dmpp.dBVv30TrKNcc2J9/iIm',
    updated_at = now()
WHERE email = 'admin.vpt@vanphuthanh.vn'
  AND role = 'admin';

-- Kiểm tra nhanh (bỏ comment để chạy):
-- SELECT id, email, role, is_active, company_id FROM users WHERE email = 'admin.vpt@vanphuthanh.vn';
