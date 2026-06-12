-- 338: Nhân viên Công ty NextGo (Marketing + Admin Sản xuất)
-- Email tự sinh @nextgo.vn — mật khẩu mặc định: tubep123 (bcrypt cost 12, giống seed_staff)
-- Idempotent — chạy lại an toàn.

DO $$
DECLARE
  v_company_id UUID;
  v_hash TEXT := '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi';
  v_dept_marketing UUID;
  v_dept_production UUID;
BEGIN
  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE c.name ILIKE '%NextGo%'
     OR c.short_name ILIKE '%NextGo%'
  ORDER BY c.name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '338: Không tìm thấy công ty NextGo trong `companies`.';
  END IF;

  INSERT INTO departments (name, slug, description, color, company_id, is_active)
  VALUES (
    'Marketing',
    'nextgo-marketing',
    'Phòng Marketing — NextGo [seed-338]',
    '#8B5CF6',
    v_company_id,
    true
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    company_id = EXCLUDED.company_id,
    is_active = true,
    description = EXCLUDED.description
  RETURNING id INTO v_dept_marketing;

  IF v_dept_marketing IS NULL THEN
    SELECT id INTO v_dept_marketing FROM departments WHERE slug = 'nextgo-marketing' LIMIT 1;
  END IF;

  INSERT INTO departments (name, slug, description, color, company_id, is_active)
  VALUES (
    'Sản xuất',
    'nextgo-production',
    'Phòng Sản xuất — NextGo [seed-338]',
    '#EA580C',
    v_company_id,
    true
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    company_id = EXCLUDED.company_id,
    is_active = true,
    description = EXCLUDED.description
  RETURNING id INTO v_dept_production;

  IF v_dept_production IS NULL THEN
    SELECT id INTO v_dept_production FROM departments WHERE slug = 'nextgo-production' LIMIT 1;
  END IF;

  -- Biện Anh Pháp — Marketing (nhân viên)
  INSERT INTO users (email, password, full_name, role, position, company_id, department_id, is_active)
  VALUES (
    'bien.anh.phap@nextgo.vn',
    v_hash,
    'Biện Anh Pháp',
    'staff',
    'NV Marketing',
    v_company_id,
    v_dept_marketing,
    true
  )
  ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    position = EXCLUDED.position,
    company_id = EXCLUDED.company_id,
    department_id = EXCLUDED.department_id,
    is_active = true,
    updated_at = now();

  -- Trần thị ngọc Hân — Marketing (nhân viên)
  INSERT INTO users (email, password, full_name, role, position, company_id, department_id, is_active)
  VALUES (
    'tran.thi.ngoc.han@nextgo.vn',
    v_hash,
    'Trần thị ngọc Hân',
    'staff',
    'NV Marketing',
    v_company_id,
    v_dept_marketing,
    true
  )
  ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    position = EXCLUDED.position,
    company_id = EXCLUDED.company_id,
    department_id = EXCLUDED.department_id,
    is_active = true,
    updated_at = now();

  -- Hải Hiền — Sản xuất (admin)
  INSERT INTO users (email, password, full_name, role, position, company_id, department_id, is_active)
  VALUES (
    'hai.hien@nextgo.vn',
    v_hash,
    'Hải Hiền',
    'production_admin',
    'Admin Sản xuất',
    v_company_id,
    v_dept_production,
    true
  )
  ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    position = EXCLUDED.position,
    company_id = EXCLUDED.company_id,
    department_id = EXCLUDED.department_id,
    is_active = true,
    updated_at = now();

  RAISE NOTICE '338: NextGo staff OK — company_id=% marketing=% production=%',
    v_company_id, v_dept_marketing, v_dept_production;
END $$;
