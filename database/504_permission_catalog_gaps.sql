-- 504_permission_catalog_gaps.sql
-- Bổ sung resource RBAC còn thiếu so với catalog chức năng / App Switcher.
-- Idempotent — pattern giống 352 / 440.
-- Đồng thời backfill role_permissions cho admin / sales_admin / module admins.

BEGIN;

DO $$
DECLARE
  has_description boolean;
  has_is_active   boolean;
  rec RECORD;
  cols text;
  vals text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='description')
    INTO has_description;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='is_active')
    INTO has_is_active;

  FOR rec IN
    SELECT * FROM (VALUES
      -- CRM — Tổng quan / cộng tác
      ('crm_events',        'view',  'Sự kiện CRM — Xem'),
      ('crm_events',        'edit',  'Sự kiện CRM — Sửa'),
      ('crm_events',        'admin', 'Sự kiện CRM — Admin'),
      ('crm_leaves',        'view',  'Lịch nghỉ — Xem'),
      ('crm_leaves',        'edit',  'Lịch nghỉ — Sửa'),
      ('crm_leaves',        'admin', 'Lịch nghỉ — Admin'),
      ('crm_messenger',     'view',  'Nhóm chat — Xem'),
      ('crm_messenger',     'edit',  'Nhóm chat — Sửa'),
      ('crm_messenger',     'admin', 'Nhóm chat — Admin'),
      ('crm_activity',      'view',  'Đang hoạt động — Xem'),
      ('crm_activity',      'edit',  'Đang hoạt động — Sửa'),
      ('crm_activity',      'admin', 'Đang hoạt động — Admin'),
      ('crm_feed',          'view',  'Bảng tin nội bộ — Xem'),
      ('crm_feed',          'edit',  'Bảng tin nội bộ — Sửa'),
      ('crm_feed',          'admin', 'Bảng tin nội bộ — Admin'),
      ('crm_voice',         'view',  'Cuộc gọi & ghi âm — Xem'),
      ('crm_voice',         'edit',  'Cuộc gọi & ghi âm — Sửa'),
      ('crm_voice',         'admin', 'Cuộc gọi & ghi âm — Admin'),
      -- CRM — Bán hàng bổ sung
      ('crm_dept_plan',     'view',  'Kế hoạch phòng ban — Xem'),
      ('crm_dept_plan',     'edit',  'Kế hoạch phòng ban — Sửa'),
      ('crm_dept_plan',     'admin', 'Kế hoạch phòng ban — Admin'),
      ('crm_lead_journey',  'view',  'Hành trình Lead — Xem'),
      ('crm_lead_journey',  'edit',  'Hành trình Lead — Sửa'),
      ('crm_lead_journey',  'admin', 'Hành trình Lead — Admin'),
      -- CRM — Dữ liệu
      ('crm_categories',    'view',  'Nhóm ngành — Xem'),
      ('crm_categories',    'edit',  'Nhóm ngành — Sửa'),
      ('crm_categories',    'admin', 'Nhóm ngành — Admin'),
      -- Sản xuất
      ('sx_approvals',      'view',  'Duyệt sản xuất — Xem'),
      ('sx_approvals',      'edit',  'Duyệt sản xuất — Sửa'),
      ('sx_approvals',      'admin', 'Duyệt sản xuất — Admin'),
      -- Vận chuyển
      ('vc_assignments',    'view',  'Giao việc VC — Xem'),
      ('vc_assignments',    'edit',  'Giao việc VC — Sửa'),
      ('vc_assignments',    'admin', 'Giao việc VC — Admin'),
      -- Kế toán
      ('ketoan_bank_accounts','view',  'Tài khoản ngân hàng — Xem'),
      ('ketoan_bank_accounts','edit',  'Tài khoản ngân hàng — Sửa'),
      ('ketoan_bank_accounts','admin', 'Tài khoản ngân hàng — Admin'),
      -- Tính toán
      ('calc_run',          'view',  'Tính toán — Chạy / lịch sử — Xem'),
      ('calc_run',          'edit',  'Tính toán — Chạy / lịch sử — Sửa'),
      ('calc_run',          'admin', 'Tính toán — Chạy / lịch sử — Admin'),
      ('calc_setup',        'view',  'Tính toán — Cấu hình — Xem'),
      ('calc_setup',        'edit',  'Tính toán — Cấu hình — Sửa'),
      ('calc_setup',        'admin', 'Tính toán — Cấu hình — Admin'),
      -- Kiến thức
      ('knowledge_learn',   'view',  'Kiến thức — Học tập — Xem'),
      ('knowledge_learn',   'edit',  'Kiến thức — Học tập — Sửa'),
      ('knowledge_learn',   'admin', 'Kiến thức — Học tập — Admin'),
      ('knowledge_admin',   'view',  'Kiến thức — Quản trị — Xem'),
      ('knowledge_admin',   'edit',  'Kiến thức — Quản trị — Sửa'),
      ('knowledge_admin',   'admin', 'Kiến thức — Quản trị — Admin'),
      -- Công việc (App Switcher)
      ('work_unified',      'view',  'Công việc tổng hợp — Xem'),
      ('work_unified',      'edit',  'Công việc tổng hợp — Sửa'),
      ('work_unified',      'admin', 'Công việc tổng hợp — Admin'),
      ('personal_tasks',    'view',  'Nhiệm vụ cá nhân — Xem'),
      ('personal_tasks',    'edit',  'Nhiệm vụ cá nhân — Sửa'),
      ('personal_tasks',    'admin', 'Nhiệm vụ cá nhân — Admin')
    ) AS t(resource, action, p_desc)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM permissions WHERE resource = rec.resource AND action = rec.action
    ) THEN
      cols := 'resource, action';
      vals := quote_literal(rec.resource) || ', ' || quote_literal(rec.action);
      IF has_description THEN
        cols := cols || ', description';
        vals := vals || ', ' || quote_literal(rec.p_desc);
      END IF;
      IF has_is_active THEN
        cols := cols || ', is_active';
        vals := vals || ', true';
      END IF;
      EXECUTE 'INSERT INTO permissions (' || cols || ') VALUES (' || vals || ')';
    ELSE
      IF has_description THEN
        EXECUTE 'UPDATE permissions SET description = $1'
                || CASE WHEN has_is_active THEN ', is_active = true' ELSE '' END
                || ' WHERE resource = $2 AND action = $3'
          USING rec.p_desc, rec.resource, rec.action;
      ELSIF has_is_active THEN
        EXECUTE 'UPDATE permissions SET is_active = true WHERE resource = $1 AND action = $2'
          USING rec.resource, rec.action;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Backfill full permissions cho admin / sales_admin
DO $$
DECLARE
  rn text;
  rid uuid;
  role_names text[] := ARRAY['admin', 'sales_admin'];
BEGIN
  FOREACH rn IN ARRAY role_names LOOP
    SELECT id INTO rid FROM roles WHERE name = rn;
    IF rid IS NULL THEN
      RAISE NOTICE '504: bỏ qua role % — chưa tồn tại', rn;
      CONTINUE;
    END IF;
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rid, p.id
    FROM permissions p
    WHERE COALESCE(p.is_active, true) = true
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- SX admin: quyền sx_* mới (approvals) + work_unified view
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM roles WHERE name = 'production_admin';
  IF rid IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rid, p.id FROM permissions p
    WHERE COALESCE(p.is_active, true) = true
      AND (
        p.resource LIKE 'sx_%'
        OR p.resource IN ('work_unified', 'personal_tasks', 'projects', 'workflows', 'templates', 'reports')
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- VC admin: vc_assignments + work_unified
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM roles WHERE name = 'logistics_admin';
  IF rid IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rid, p.id FROM permissions p
    WHERE COALESCE(p.is_active, true) = true
      AND (
        p.resource LIKE 'vc_%'
        OR p.resource IN ('work_unified', 'personal_tasks', 'projects', 'workflows', 'templates', 'reports')
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- CRM + SX dual roles: CRM phụ + SX approvals
DO $$
DECLARE
  rn text;
  rid uuid;
  role_names text[] := ARRAY['crm_production_admin', 'crm_production_staff', 'production_staff'];
BEGIN
  FOREACH rn IN ARRAY role_names LOOP
    SELECT id INTO rid FROM roles WHERE name = rn;
    IF rid IS NULL THEN CONTINUE; END IF;
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rid, p.id FROM permissions p
    WHERE COALESCE(p.is_active, true) = true
      AND (
        p.resource LIKE 'crm_%'
        OR p.resource LIKE 'sx_%'
        OR p.resource IN ('work_unified', 'personal_tasks', 'projects', 'workflows', 'templates', 'reports', 'ecosystem')
      )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

COMMIT;
