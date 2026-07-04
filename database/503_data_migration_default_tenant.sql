-- ════════════════════════════════════════════════════════════
-- 503: Create default tenant and backfill existing data
-- ════════════════════════════════════════════════════════════

INSERT INTO tenants (name, slug, tier, max_users, max_companies)
VALUES ('Hệ sinh thái mặc định', 'default', 'enterprise', 9999, 999)
ON CONFLICT (slug) DO NOTHING;

UPDATE companies
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;

UPDATE users
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;

UPDATE ecosystem_units
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;

-- Copy default tier features to the default tenant
INSERT INTO tenant_features (tenant_id, feature_key, enabled, config)
SELECT
  (SELECT id FROM tenants WHERE slug = 'default'),
  tf.feature_key,
  tf.enabled,
  tf.config
FROM tier_features tf
WHERE tf.tier = 'enterprise'
ON CONFLICT (tenant_id, feature_key) DO NOTHING;
