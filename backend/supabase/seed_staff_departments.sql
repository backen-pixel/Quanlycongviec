-- ═══════════════════════════════════════════════════════════════
-- SCRIPT NHÂN VIÊN VÀ PHÒNG BAN
-- Chạy trên Supabase SQL Editor SAU migration 01 + 02
-- Script này an toàn: dùng ON CONFLICT + IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════

-- ───────── PHÒNG BAN ─────────
INSERT INTO departments (name, slug, description, color) VALUES
  ('Ban Giám đốc',      'management',    'Quản lý chung',           '#6366F1'),
  ('Phòng Kinh doanh',  'sales',         'Tư vấn, bán hàng',       '#8B5CF6'),
  ('Phòng Thiết kế',    'design',        'Thiết kế 2D/3D',         '#EC4899'),
  ('Phòng Báo giá',     'quotation',     'Lập báo giá, dự toán',   '#F59E0B'),
  ('Phòng Hợp đồng',   'contract',      'Ký kết hợp đồng',        '#10B981'),
  ('Phòng Sản xuất',    'production',    'CNC, lắp ráp, sơn',      '#F97316'),
  ('Đội Vận chuyển',    'shipping',      'Đóng gói, giao hàng',    '#06B6D4'),
  ('Đội Lắp đặt',       'installation',  'Lắp đặt, nghiệm thu',   '#3B82F6'),
  ('Phòng CSKH',        'customer-care', 'Bảo hành, chăm sóc KH',  '#EF4444')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color;

-- ───────── NHÂN VIÊN ─────────
-- Password tất cả: admin123
-- Hash: $2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi

-- Admin (không có phòng ban)
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('admin@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Admin Hệ Thống', '0901234567', 'admin', 'Quản trị hệ thống', NULL, true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Manager (Ban Giám đốc)
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('manager@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Vũ Văn Quản Lý', '0912345007', 'manager', 'Giám đốc',
   (SELECT id FROM departments WHERE slug='management' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Kinh doanh / Tư vấn
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('sales@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Nguyễn Văn Bán', '0912345001', 'sales', 'NV Kinh doanh',
   (SELECT id FROM departments WHERE slug='sales' LIMIT 1), true),
  ('tuvan@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Phạm Thị Tư Vấn', '0911000001', 'sales', 'NV Tư vấn',
   (SELECT id FROM departments WHERE slug='sales' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Thiết kế
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('designer@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Trần Thị Thiết Kế', '0912345002', 'designer', 'NV Thiết kế',
   (SELECT id FROM departments WHERE slug='design' LIMIT 1), true),
  ('thietke@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Trần Văn Thiết Kế 2', '0911000002', 'designer', 'NV Thiết kế',
   (SELECT id FROM departments WHERE slug='design' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Báo giá
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('baogia@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Lê Thị Báo Giá', '0911000003', 'sales', 'NV Báo giá',
   (SELECT id FROM departments WHERE slug='quotation' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Hợp đồng
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('hopdong@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Nguyễn Văn Hợp Đồng', '0911000004', 'sales', 'NV Hợp đồng',
   (SELECT id FROM departments WHERE slug='contract' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Sản xuất
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('production@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Lê Văn Sản Xuất', '0912345003', 'production', 'NV Sản xuất',
   (SELECT id FROM departments WHERE slug='production' LIMIT 1), true),
  ('sanxuat@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Võ Văn Sản Xuất 2', '0911000005', 'production', 'NV Sản xuất',
   (SELECT id FROM departments WHERE slug='production' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Vận chuyển
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('vanchuyen@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Đặng Văn Vận Chuyển', '0911000006', 'driver', 'NV Vận chuyển',
   (SELECT id FROM departments WHERE slug='shipping' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- Lắp đặt
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('installer@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Hoàng Văn Lắp', '0912345005', 'installer', 'NV Lắp đặt',
   (SELECT id FROM departments WHERE slug='installation' LIMIT 1), true),
  ('lapdat@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Bùi Văn Lắp Đặt 2', '0911000007', 'installer', 'NV Lắp đặt',
   (SELECT id FROM departments WHERE slug='installation' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- CSKH
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('cskh@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Mai Thị Chăm Sóc', '0911000008', 'customer_care', 'NV CSKH',
   (SELECT id FROM departments WHERE slug='customer-care' LIMIT 1), true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = EXCLUDED.department_id, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- ───── NV CHƯA CÓ PHÒNG BAN (để test filter) ─────
INSERT INTO users (email, password, full_name, phone, role, position, department_id, is_active) VALUES
  ('thuctap1@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Nguyễn Văn Thực Tập', '0911009001', 'staff', 'Thực tập sinh', NULL, true),
  ('thuctap2@tubep.vn', '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
   'Trần Thị Mới', '0911009002', 'staff', 'NV mới', NULL, true)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role,
  position = EXCLUDED.position, department_id = NULL, is_active = true,
  password = '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';

-- ═══════════════════════════════════════════════════════════════
-- TỔNG KẾT:
-- 9 phòng ban (Giám đốc, KD, TK, BG, HĐ, SX, VC, LĐ, CSKH)
-- 16 nhân viên:
--   1 admin (không PB)
--   1 manager (Ban GĐ)
--   2 sales (P.KD)
--   2 designer (P.TK)
--   1 báo giá (P.BG)
--   1 hợp đồng (P.HĐ)
--   2 sản xuất (P.SX)
--   1 vận chuyển (Đ.VC)
--   2 lắp đặt (Đ.LĐ)
--   1 CSKH (P.CSKH)
--   2 staff (KHÔNG có phòng ban — test filter)
-- Tất cả password: admin123
-- ═══════════════════════════════════════════════════════════════
