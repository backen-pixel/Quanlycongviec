-- ════════════════════════════════════════════════════════════
-- 502: Add tenant_id FK to root tables
-- ════════════════════════════════════════════════════════════

ALTER TABLE companies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE ecosystem_units ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ecosystem_units_tenant ON ecosystem_units(tenant_id);

-- Add platform_admin to role enum (safe: no-op if already exists)
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'platform_admin';
EXCEPTION WHEN others THEN NULL;
END $$;
