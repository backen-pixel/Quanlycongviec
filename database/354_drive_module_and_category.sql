-- 354: Drive module — thêm cấp phân loại Module (cấp 1) và Loại (giữa Khu vực ↔ Phòng ban).
--
-- Sau migration này, cây tổ chức Drive trở thành:
--    Module → Công ty → Khu vực → Loại → Phòng ban → Nhân viên
--
-- 2 cột mới (cùng nullable, an toàn cho dữ liệu cũ):
--   • users.drive_module        — module mặc định để xếp Drive cá nhân của user.
--                                  Giá trị: 'crm' | 'sx' | 'vc' | 'mkt' | 'other' (free-text, code FE map ra tên hiển thị).
--   • departments.drive_category — nhãn "Loại" gắn vào phòng ban (vd. "Văn phòng", "Kinh doanh", "Sản xuất", "Kho", "CSKH" …).
--                                  Có thể khác nhau giữa các phòng ban / công ty / khu vực.
--
-- Khi 1 trong 2 giá trị NULL, helper driveOrgPath sẽ dùng fallback "Khác" / "Chưa phân loại".

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS drive_module TEXT;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS drive_category TEXT;

COMMENT ON COLUMN users.drive_module IS
  'Module mặc định cho Drive cá nhân (crm|sx|vc|mkt|other). NULL = "Khác".';
COMMENT ON COLUMN departments.drive_category IS
  'Nhãn "Loại" (cấp giữa Khu vực và Phòng ban) hiển thị trong Drive org-tree. NULL = "Chưa phân loại".';

-- Index nhẹ để org-tree filter nhanh
CREATE INDEX IF NOT EXISTS idx_users_drive_module ON users(drive_module) WHERE drive_module IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_departments_drive_category ON departments(drive_category) WHERE drive_category IS NOT NULL;

COMMIT;
