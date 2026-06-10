-- 321: Cấp permissions cho production_admin và logistics_admin (246 chỉ tạo role, chưa gắn quyền).
-- Giống production_staff — vận hành đầy đủ module SX/VC trong phạm vi công ty.

BEGIN;

DO $$
DECLARE
  v_role_id UUID;
  v_role_name TEXT;
BEGIN
  FOREACH v_role_name IN ARRAY ARRAY['production_admin', 'logistics_admin']
  LOOP
    SELECT id INTO v_role_id FROM roles WHERE name = v_role_name;
    IF v_role_id IS NULL THEN
      RAISE NOTICE '% chưa tồn tại — bỏ qua.', v_role_name;
      CONTINUE;
    END IF;

    DELETE FROM role_permissions WHERE role_id = v_role_id;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id
    FROM permissions p
    WHERE p.resource IN ('projects', 'workflows', 'templates', 'reports', 'customers', 'ecosystem')
    ON CONFLICT DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id
    FROM permissions p
    WHERE p.resource IN ('users', 'settings') AND p.action = 'view'
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

COMMIT;
