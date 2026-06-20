-- 354_backfill_role_tier_permissions.sql
-- Bổ sung quyền tier CRM/SX/VC/Kế toán (352) vào role_permissions cho các vai trò hệ thống.
-- Migration 216 cấp full permissions trước khi 352 chạy → admin/sales_admin thiếu quyền module mới.

BEGIN;

-- Vai trò full quyền hệ thống (toàn bộ permissions active)
DO $$
DECLARE
  rn text;
  rid uuid;
  role_names text[] := ARRAY['admin', 'sales_admin'];
BEGIN
  FOREACH rn IN ARRAY role_names LOOP
    SELECT id INTO rid FROM roles WHERE name = rn;
    IF rid IS NULL THEN
      RAISE NOTICE '354: bỏ qua role % — chưa tồn tại', rn;
      CONTINUE;
    END IF;
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rid, p.id
    FROM permissions p
    WHERE COALESCE(p.is_active, true) = true
    ON CONFLICT DO NOTHING;
    RAISE NOTICE '354: đã backfill permissions cho %', rn;
  END LOOP;
END $$;

-- Admin module SX
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM roles WHERE name = 'production_admin';
  IF rid IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rid, p.id FROM permissions p
    WHERE COALESCE(p.is_active, true) = true
      AND (p.resource LIKE 'sx_%' OR p.resource IN ('projects', 'workflows', 'templates', 'reports'))
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Admin module VC
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM roles WHERE name = 'logistics_admin';
  IF rid IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rid, p.id FROM permissions p
    WHERE COALESCE(p.is_active, true) = true
      AND (p.resource LIKE 'vc_%' OR p.resource IN ('projects', 'workflows', 'templates', 'reports'))
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- CRM + SX dual roles
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
        OR p.resource IN ('projects', 'workflows', 'templates', 'reports', 'ecosystem')
      )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Vai trò CSKH — đồng bộ users.role = customer_care
INSERT INTO roles (name, description, is_system)
VALUES ('customer_care', 'Chăm sóc khách hàng (CSKH)', true)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    is_system = EXCLUDED.is_system;

DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM roles WHERE name = 'customer_care';
  IF rid IS NULL THEN RETURN; END IF;
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rid, p.id FROM permissions p
  WHERE COALESCE(p.is_active, true) = true
    AND p.resource IN (
      'crm_dashboard', 'crm_pipeline', 'crm_leads', 'crm_deals', 'crm_tasks',
      'crm_follow_up', 'crm_customers', 'crm_assignments', 'crm_reports'
    )
    AND p.action IN ('view', 'edit')
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;
