-- ════════════════════════════════════════════════════════════
-- 402: Giới hạn SaaS theo gói (lead/deal/tháng, lưu trữ, …)
-- Chạy sau 401_saas_free_plan_3_users.sql
-- ════════════════════════════════════════════════════════════

ALTER TABLE saas_plans ADD COLUMN IF NOT EXISTS quotas JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quotas JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN saas_plans.quotas IS 'Giới hạn: leads_per_month, deals_per_month, projects_total, storage_mb, crm_tasks_per_month, notes_mb, attachments_mb, voice_recordings_mb, api_requests_per_day (-1 = không giới hạn)';
COMMENT ON COLUMN tenants.quotas IS 'Ghi đè giới hạn theo tenant (merge với gói)';

-- Free
UPDATE saas_plans SET quotas = '{
  "leads_per_month": 30,
  "deals_per_month": 5,
  "projects_total": 10,
  "storage_mb": 50,
  "crm_tasks_per_month": 100,
  "notes_mb": 20,
  "attachments_mb": 30,
  "voice_recordings_mb": 0,
  "api_requests_per_day": 200
}'::jsonb, updated_at = now()
WHERE id = 'free';

-- Standard
UPDATE saas_plans SET quotas = '{
  "leads_per_month": 300,
  "deals_per_month": 80,
  "projects_total": 100,
  "storage_mb": 2048,
  "crm_tasks_per_month": 1000,
  "notes_mb": 500,
  "attachments_mb": 1500,
  "voice_recordings_mb": 100,
  "api_requests_per_day": 5000
}'::jsonb, updated_at = now()
WHERE id = 'standard';

-- Pro
UPDATE saas_plans SET quotas = '{
  "leads_per_month": 2000,
  "deals_per_month": 500,
  "projects_total": 500,
  "storage_mb": 10240,
  "crm_tasks_per_month": 10000,
  "notes_mb": 3000,
  "attachments_mb": 7000,
  "voice_recordings_mb": 500,
  "api_requests_per_day": 50000
}'::jsonb, updated_at = now()
WHERE id = 'pro';

-- Ultra (không giới hạn)
UPDATE saas_plans SET quotas = '{
  "leads_per_month": -1,
  "deals_per_month": -1,
  "projects_total": -1,
  "storage_mb": -1,
  "crm_tasks_per_month": -1,
  "notes_mb": -1,
  "attachments_mb": -1,
  "voice_recordings_mb": -1,
  "api_requests_per_day": -1
}'::jsonb, updated_at = now()
WHERE id = 'ultra';

-- Tenant Free hiện có — đồng bộ quota mặc định
UPDATE tenants t
SET quotas = p.quotas, updated_at = now()
FROM saas_plans p
WHERE p.id = 'free' AND t.tier = 'free' AND (t.quotas IS NULL OR t.quotas = '{}'::jsonb);
