-- ════════════════════════════════════════════════════════════
-- 500: SaaS Tenants — bảng quản lý hệ sinh thái (multi-tenant)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  logo_url TEXT,
  domain TEXT,

  -- Subscription / billing
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  max_users INT DEFAULT 50,
  max_companies INT DEFAULT 5,
  subscription_start TIMESTAMPTZ,
  subscription_end TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  -- Tenant-level config overrides
  settings JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_all_tenants" ON tenants FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
