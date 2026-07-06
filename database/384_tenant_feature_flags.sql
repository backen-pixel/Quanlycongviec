-- ════════════════════════════════════════════════════════════
-- 384: Tenant feature flags + tier defaults
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  UNIQUE(tenant_id, feature_key)
);

CREATE TABLE IF NOT EXISTS tier_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier VARCHAR(50) NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  UNIQUE(tier, feature_key)
);

-- Seed default tier features
INSERT INTO tier_features (tier, feature_key, enabled) VALUES
  ('free', 'crm', true),
  ('free', 'tasks', true),
  ('free', 'projects', true),
  ('starter', 'crm', true),
  ('starter', 'tasks', true),
  ('starter', 'projects', true),
  ('starter', 'production', true),
  ('starter', 'customers', true),
  ('pro', 'crm', true),
  ('pro', 'tasks', true),
  ('pro', 'projects', true),
  ('pro', 'production', true),
  ('pro', 'logistics', true),
  ('pro', 'customers', true),
  ('pro', 'ai_assistant', true),
  ('pro', 'drive', true),
  ('enterprise', 'crm', true),
  ('enterprise', 'tasks', true),
  ('enterprise', 'projects', true),
  ('enterprise', 'production', true),
  ('enterprise', 'logistics', true),
  ('enterprise', 'customers', true),
  ('enterprise', 'ai_assistant', true),
  ('enterprise', 'drive', true),
  ('enterprise', 'accounting', true),
  ('enterprise', 'api_access', true)
ON CONFLICT DO NOTHING;

ALTER TABLE tenant_features ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_all_tenant_features" ON tenant_features FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE tier_features ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_all_tier_features" ON tier_features FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
