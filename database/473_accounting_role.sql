-- 473_accounting_role.sql
-- Vai trò hệ thống «Kế toán» (users.role = accounting đã có trong enum user_role — 366a).
-- Mẫu quyền: xem CRM/SX/VC/Drive/báo cáo; vận hành module Kế toán (view+edit); không admin/tương tác CRM.

BEGIN;

INSERT INTO roles (name, description, is_system)
VALUES (
  'accounting',
  'Kế toán — xem CRM/SX/VC, vận hành Báo giá/ĐH/HĐ; không tham gia sửa pipeline CRM',
  true
)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    is_system = EXCLUDED.is_system;

DO $$
DECLARE
  rid uuid;
BEGIN
  SELECT id INTO rid FROM roles WHERE name = 'accounting';
  IF rid IS NULL THEN
    RAISE NOTICE '473: roles.accounting chưa tạo — bỏ qua cấp permissions';
    RETURN;
  END IF;

  DELETE FROM role_permissions WHERE role_id = rid;

  -- CRM / SX / VC: chỉ xem
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rid, p.id
  FROM permissions p
  WHERE COALESCE(p.is_active, true) = true
    AND (
      p.resource LIKE 'crm_%'
      OR p.resource LIKE 'sx_%'
      OR p.resource LIKE 'vc_%'
    )
    AND p.action = 'view'
  ON CONFLICT DO NOTHING;

  -- Module Kế toán: xem + sửa (BG / ĐH / HĐ)
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rid, p.id
  FROM permissions p
  WHERE COALESCE(p.is_active, true) = true
    AND p.resource LIKE 'ketoan_%'
    AND p.action IN ('view', 'edit')
  ON CONFLICT DO NOTHING;

  -- Drive: chỉ xem
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rid, p.id
  FROM permissions p
  WHERE COALESCE(p.is_active, true) = true
    AND p.resource = 'drive'
    AND p.action = 'view'
  ON CONFLICT DO NOTHING;

  -- Công việc / báo cáo / tổ chức: chỉ xem
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rid, p.id
  FROM permissions p
  WHERE COALESCE(p.is_active, true) = true
    AND p.resource IN ('projects', 'workflows', 'templates', 'reports', 'customers', 'ecosystem', 'users')
    AND p.action = 'view'
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '473: đã seed role_permissions cho accounting';
END $$;

COMMIT;
