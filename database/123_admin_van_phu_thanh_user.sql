-- 123: Ví dụ **Admin công ty** (khác **Admin hệ thống**): role admin + users.company_id = Vạn Phú Thành
-- Admin hệ thống: admin không gán company_id. Admin công ty: admin có company_id — API khóa phạm vi + GET /companies chỉ trả 1 công ty.
--
-- Mật khẩu mặc định: VptAdmin@2026  (bcrypt 12: tạo bởi bcryptjs trong backend)
-- Nên đổi mật khẩu sau lần đăng nhập đầu.
--
-- Nếu không tìm thấy công ty: chỉnh WHERE bên dưới cho khớp tên trong bảng `companies` của bạn.

ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

DO $$
DECLARE
  v_company_id UUID;
  v_hash TEXT := '$2b$12$HHOAM2Yb5RPBibscFcGpQetK4tgo4Dmpp.dBVv30TrKNcc2J9/iIm';
  v_email TEXT := 'admin.vpt@vanphuthanh.vn';
BEGIN
  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE
    c.name ILIKE '%Vạn Phú%Thành%'
    OR c.name ILIKE '%Van Phu%Thanh%'
    OR c.name ILIKE '%Vạn Phú Thành%'
    OR (c.name ILIKE '%Vạn Phú%' AND c.name ILIKE '%Thành%')
    OR c.short_name ILIKE '%VPT%'
  ORDER BY c.name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '123: Không tìm thấy công ty Vạn Phú Thành trong `companies`. Cập nhật điều kiện WHERE hoặc tạo công ty trước.';
  END IF;

  INSERT INTO users (email, password, full_name, role, company_id, is_active)
  VALUES (v_email, v_hash, 'Admin Vạn Phú Thành', 'admin', v_company_id, true)
  ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    full_name = EXCLUDED.full_name,
    role = 'admin',
    company_id = EXCLUDED.company_id,
    is_active = true,
    updated_at = now();
END $$;

COMMENT ON COLUMN users.company_id IS 'role=admin + company_id = Admin công ty (phạm vi một công ty). role=admin + NULL = Admin hệ thống.';
