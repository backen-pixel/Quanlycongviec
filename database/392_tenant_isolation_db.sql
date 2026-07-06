-- ════════════════════════════════════════════════════════════
-- 392: Tenant isolation — DB helpers, constraints, audit log
-- Defense-in-depth; API layer (Express) là lớp chính.
-- Backend dùng service role → RLS không chặn API; hữu ích nếu truy cập trực tiếp qua PostgREST.
-- ════════════════════════════════════════════════════════════

-- ── Helper: tenant_id của công ty ──
CREATE OR REPLACE FUNCTION company_tenant_id(p_company_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT tenant_id FROM companies WHERE id = p_company_id LIMIT 1;
$$;

COMMENT ON FUNCTION company_tenant_id(UUID) IS 'Trả tenant_id của companies.id; NULL nếu không có.';

-- ── Helper: company thuộc tenant? ──
CREATE OR REPLACE FUNCTION company_belongs_to_tenant(p_company_id UUID, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_company_id IS NULL OR p_tenant_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = p_company_id AND c.tenant_id = p_tenant_id
    )
  END;
$$;

-- ── Danh sách company_id thuộc tenant (dùng trong view/report) ──
CREATE OR REPLACE FUNCTION tenant_company_ids(p_tenant_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM companies WHERE tenant_id = p_tenant_id;
$$;

-- ── NOT NULL tenant_id sau khi backfill 386 ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE tenant_id IS NULL LIMIT 1) THEN
    ALTER TABLE companies ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE '392: skip companies.tenant_id NOT NULL — %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE tenant_id IS NULL LIMIT 1) THEN
    ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE '392: skip users.tenant_id NOT NULL — %', SQLERRM;
END $$;

-- ── crm_leads: company_id bắt buộc thuộc công ty có tenant (khi company_id set) ──
CREATE OR REPLACE FUNCTION trg_validate_crm_lead_company_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  co_tenant UUID;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tenant_id INTO co_tenant FROM companies WHERE id = NEW.company_id;
  IF co_tenant IS NULL THEN
    RAISE EXCEPTION 'crm_leads.company_id % không tồn tại hoặc chưa gán tenant', NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_leads_company_tenant ON crm_leads;
CREATE TRIGGER trg_crm_leads_company_tenant
  BEFORE INSERT OR UPDATE OF company_id ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION trg_validate_crm_lead_company_tenant();

-- ── projects: company_id phải có tenant ──
CREATE OR REPLACE FUNCTION trg_validate_project_company_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  co_tenant UUID;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tenant_id INTO co_tenant FROM companies WHERE id = NEW.company_id;
  IF co_tenant IS NULL THEN
    RAISE EXCEPTION 'projects.company_id % không tồn tại hoặc chưa gán tenant', NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_company_tenant ON projects;
CREATE TRIGGER trg_projects_company_tenant
  BEFORE INSERT OR UPDATE OF company_id ON projects
  FOR EACH ROW
  EXECUTE FUNCTION trg_validate_project_company_tenant();

-- ── Audit log truy cập cross-tenant (Phase 6 lite) ──
CREATE TABLE IF NOT EXISTS tenant_access_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64),
  resource_id UUID,
  company_id UUID,
  ip INET,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_access_audit_tenant ON tenant_access_audit(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_access_audit_user ON tenant_access_audit(user_id, created_at DESC);

ALTER TABLE tenant_access_audit ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_all_tenant_access_audit" ON tenant_access_audit FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE tenant_access_audit IS 'Ghi nhận nghi ngờ truy cập cross-tenant từ API/Socket';
