-- 597: Tenant NextGo trên INSTANCE TRỐNG (Supabase mới).
-- CẤM chạy trên production Tủ Bếp (có công ty khác NextGo).
-- Không tạo company — import dump giữ UUID.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM companies WHERE name NOT ILIKE '%NextGo%'
  ) THEN
    RAISE EXCEPTION '597: DB có công ty không-NextGo — dừng. File này chỉ cho instance trống.';
  END IF;
END $$;

INSERT INTO tenants (name, slug, tier, max_users, max_companies, is_active)
SELECT 'NextGo', 'nextgo', 'enterprise', 200, 10, true
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'nextgo');

INSERT INTO tenant_features (tenant_id, feature_key, enabled, config)
SELECT t.id, f.feature_key, true, '{}'::jsonb
FROM tenants t
CROSS JOIN (
  SELECT unnest(ARRAY[
    'crm','tasks','projects','production','logistics','customers',
    'ai_assistant','drive','accounting','api_access','tinhtoan','purchasing'
  ]) AS feature_key
) f
WHERE t.slug = 'nextgo'
ON CONFLICT (tenant_id, feature_key) DO NOTHING;
