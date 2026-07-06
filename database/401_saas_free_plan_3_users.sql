-- Free plan: tối đa 3 người dùng (Google signup + landing) — migration 401
UPDATE saas_plans
SET
  max_users = 3,
  highlights = '["CRM cơ bản","Quản lý công việc","Dự án","3 người dùng","1 công ty"]'::jsonb,
  updated_at = now()
WHERE id = 'free';

-- Tenant đang dùng tier free — đồng bộ giới hạn
UPDATE tenants
SET max_users = 3, updated_at = now()
WHERE tier = 'free' AND max_users > 3;
