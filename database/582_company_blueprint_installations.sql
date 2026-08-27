-- ============================================================
-- 582: Company-scoped Business Blueprint installations
-- Một tenant có thể cài cùng Blueprint cho nhiều công ty, mỗi công ty
-- giữ override riêng. Chỉ lưu cấu hình; không sao chép dữ liệu giao dịch.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS company_blueprint_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  blueprint_id UUID NOT NULL REFERENCES business_blueprints(id) ON DELETE RESTRICT,
  blueprint_version_id UUID NOT NULL REFERENCES business_blueprint_versions(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applying', 'active', 'failed')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  company_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_by UUID REFERENCES users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, blueprint_id),
  CHECK (jsonb_typeof(configuration) = 'object'),
  CHECK (jsonb_typeof(company_overrides) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_company_blueprint_installations_tenant
  ON company_blueprint_installations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_company_blueprint_installations_company
  ON company_blueprint_installations(company_id, status);

CREATE OR REPLACE FUNCTION enforce_company_blueprint_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM companies c
    WHERE c.id = NEW.company_id
      AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Công ty không thuộc tenant của Blueprint installation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_blueprint_tenant_scope
  ON company_blueprint_installations;
CREATE TRIGGER trg_company_blueprint_tenant_scope
  BEFORE INSERT OR UPDATE OF tenant_id, company_id
  ON company_blueprint_installations
  FOR EACH ROW
  EXECUTE FUNCTION enforce_company_blueprint_tenant_scope();

ALTER TABLE company_blueprint_installations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_company_blueprint_installations"
  ON company_blueprint_installations;
CREATE POLICY "service_all_company_blueprint_installations"
  ON company_blueprint_installations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON company_blueprint_installations FROM anon, authenticated;
GRANT ALL ON company_blueprint_installations TO service_role;

REVOKE ALL ON FUNCTION enforce_company_blueprint_tenant_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION enforce_company_blueprint_tenant_scope() TO service_role;

COMMENT ON TABLE company_blueprint_installations IS
  'Bản cài Blueprint theo công ty. configuration chứa effective definition; company_overrides được giữ khi nâng version. Không chứa dữ liệu giao dịch.';
COMMENT ON COLUMN company_blueprint_installations.company_overrides IS
  'Override module/phòng ban/quy trình riêng của công ty, được tái áp dụng khi nâng Blueprint.';

COMMIT;
