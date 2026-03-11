-- ═══════════════════════════════════════════════════════════════
-- TẠO 4 KHỐI + 4 TÀI KHOẢN QUẢN LÝ
-- ═══════════════════════════════════════════════════════════════
-- Chạy script này trong Supabase SQL Editor

-- 1. XÓA DỮ LIỆU CŨ (NẾU CÓ)
DELETE FROM ecosystem_unit_members WHERE unit_id IN (
  SELECT id FROM ecosystem_units WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
);
DELETE FROM ecosystem_units WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
DELETE FROM users WHERE email IN ('kinhdoanh@tubep.vn', 'sanxuat@tubep.vn', 'vanchuyen@tubep.vn', 'lapdathb@tubep.vn');

-- 2. TẠO 4 KHỐI (DIVISIONS)
DO $$
DECLARE
  group_id UUID;
  level_division_id UUID;
  
  division_kd_id UUID;
  division_sx_id UUID;
  division_vc_id UUID;
  division_ld_id UUID;
BEGIN
  -- Lấy ID của "Tập đoàn" và Level "Khối"
  SELECT id INTO group_id FROM ecosystem_units WHERE slug = 'tubep-group' LIMIT 1;
  SELECT id INTO level_division_id FROM ecosystem_levels WHERE slug = 'division' LIMIT 1;
  
  -- Nếu chưa có Tập đoàn, tạo mới
  IF group_id IS NULL THEN
    INSERT INTO ecosystem_units (name, short_name, slug, code, level_id, parent_id, description, icon, color)
    VALUES ('Tập đoàn TuBep Pro', 'TUBEP GROUP', 'tubep-group', 'TBP', 
            (SELECT id FROM ecosystem_levels WHERE slug = 'group'),
            NULL, 'Tập đoàn sản xuất tủ bếp cao cấp', '🏛️', '#1E40AF')
    RETURNING id INTO group_id;
  END IF;

  -- Tạo 4 Khối
  INSERT INTO ecosystem_units (name, short_name, slug, code, level_id, parent_id, description, icon, color)
  VALUES 
    ('Khối Kinh doanh', 'KINH DOANH', 'kd', 'KD', level_division_id, group_id, 
     'Tư vấn, Thiết kế, Báo giá, Hợp đồng', '💼', '#3B82F6'),
    ('Khối Sản xuất', 'SẢN XUẤT', 'sx', 'SX', level_division_id, group_id, 
     'Lên KH, Vật tư, SX thùng, Hoàn thiện, ACS, Đóng gói', '🏭', '#F59E0B'),
    ('Khối Vận chuyển', 'VẬN CHUYỂN', 'vc', 'VC', level_division_id, group_id, 
     'Vận chuyển hàng đến công trình', '🚛', '#10B981'),
    ('Khối Lắp đặt & CSKH', 'LẮP ĐẶT', 'ld', 'LD', level_division_id, group_id, 
     'Lắp đặt, Nghiệm thu, Bàn giao, Chăm sóc khách hàng', '🔧', '#EF4444')
  ON CONFLICT (slug) DO UPDATE SET 
    name = EXCLUDED.name,
    short_name = EXCLUDED.short_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color
  RETURNING id INTO division_kd_id, division_sx_id, division_vc_id, division_ld_id;

  -- Gán Stage Groups cho từng Khối
  -- Khối Kinh doanh → business
  INSERT INTO ecosystem_unit_stage_groups (unit_id, stage_group_id, is_primary)
  SELECT division_kd_id, id, true FROM workflow_stage_groups WHERE slug = 'business'
  ON CONFLICT DO NOTHING;

  -- Khối Sản xuất → production
  INSERT INTO ecosystem_unit_stage_groups (unit_id, stage_group_id, is_primary)
  SELECT division_sx_id, id, true FROM workflow_stage_groups WHERE slug = 'production'
  ON CONFLICT DO NOTHING;

  -- Khối Vận chuyển → shipping
  INSERT INTO ecosystem_unit_stage_groups (unit_id, stage_group_id, is_primary)
  SELECT division_vc_id, id, true FROM workflow_stage_groups WHERE slug = 'shipping'
  ON CONFLICT DO NOTHING;

  -- Khối Lắp đặt & CSKH → installation + customer-care
  INSERT INTO ecosystem_unit_stage_groups (unit_id, stage_group_id, is_primary)
  SELECT division_ld_id, id, (slug = 'installation') FROM workflow_stage_groups 
  WHERE slug IN ('installation', 'customer-care')
  ON CONFLICT DO NOTHING;
END $$;

-- 3. TẠO 4 TÀI KHOẢN USER
DO $$
DECLARE
  hashed_pw TEXT;
  user_kd_id UUID;
  user_sx_id UUID;
  user_vc_id UUID;
  user_ld_id UUID;
BEGIN
  -- Hash password 'admin123'
  SELECT crypt('admin123', gen_salt('bf', 12)) INTO hashed_pw;

  -- User 1: Quản lý Kinh doanh
  INSERT INTO users (email, password, full_name, role, phone, is_active, avatar_url)
  VALUES ('kinhdoanh@tubep.vn', hashed_pw, 'Trưởng Khối Kinh doanh', 'manager', '0901234001', true, NULL)
  ON CONFLICT (email) DO UPDATE SET 
    password = hashed_pw,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role
  RETURNING id INTO user_kd_id;

  -- User 2: Quản lý Sản xuất
  INSERT INTO users (email, password, full_name, role, phone, is_active, avatar_url)
  VALUES ('sanxuat@tubep.vn', hashed_pw, 'Trưởng Khối Sản xuất', 'manager', '0901234002', true, NULL)
  ON CONFLICT (email) DO UPDATE SET 
    password = hashed_pw,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role
  RETURNING id INTO user_sx_id;

  -- User 3: Quản lý Vận chuyển
  INSERT INTO users (email, password, full_name, role, phone, is_active, avatar_url)
  VALUES ('vanchuyen@tubep.vn', hashed_pw, 'Trưởng Khối Vận chuyển', 'manager', '0901234003', true, NULL)
  ON CONFLICT (email) DO UPDATE SET 
    password = hashed_pw,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role
  RETURNING id INTO user_vc_id;

  -- User 4: Quản lý Lắp đặt & CSKH
  INSERT INTO users (email, password, full_name, role, phone, is_active, avatar_url)
  VALUES ('lapdathb@tubep.vn', hashed_pw, 'Trưởng Khối Lắp đặt', 'manager', '0901234004', true, NULL)
  ON CONFLICT (email) DO UPDATE SET 
    password = hashed_pw,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role
  RETURNING id INTO user_ld_id;

  -- Gán users vào các Khối tương ứng (ecosystem_unit_members)
  INSERT INTO ecosystem_unit_members (unit_id, user_id, role)
  SELECT u.id, user_kd_id, 'manager' FROM ecosystem_units u WHERE u.slug = 'kd'
  ON CONFLICT (unit_id, user_id) DO UPDATE SET role = 'manager';

  INSERT INTO ecosystem_unit_members (unit_id, user_id, role)
  SELECT u.id, user_sx_id, 'manager' FROM ecosystem_units u WHERE u.slug = 'sx'
  ON CONFLICT (unit_id, user_id) DO UPDATE SET role = 'manager';

  INSERT INTO ecosystem_unit_members (unit_id, user_id, role)
  SELECT u.id, user_vc_id, 'manager' FROM ecosystem_units u WHERE u.slug = 'vc'
  ON CONFLICT (unit_id, user_id) DO UPDATE SET role = 'manager';

  INSERT INTO ecosystem_unit_members (unit_id, user_id, role)
  SELECT u.id, user_ld_id, 'manager' FROM ecosystem_units u WHERE u.slug = 'ld'
  ON CONFLICT (unit_id, user_id) DO UPDATE SET role = 'manager';
END $$;

-- ═══ HOÀN TẤT ═══
-- Verify
SELECT '✅ 4 Khối đã tạo:' AS status;
SELECT name, short_name, code, slug, icon FROM ecosystem_units 
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
ORDER BY code;

SELECT '✅ 4 Tài khoản đã tạo:' AS status;
SELECT email, full_name, role, phone FROM users 
WHERE email IN ('kinhdoanh@tubep.vn', 'sanxuat@tubep.vn', 'vanchuyen@tubep.vn', 'lapdathb@tubep.vn')
ORDER BY email;

SELECT '✅ Gán user vào Khối:' AS status;
SELECT u.name AS division, usr.full_name AS user, m.role
FROM ecosystem_unit_members m
JOIN ecosystem_units u ON m.unit_id = u.id
JOIN users usr ON m.user_id = usr.id
WHERE u.level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
ORDER BY u.code;
