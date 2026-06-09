-- 302: Danh sách công ty bên ngoài (đối tác B2B) theo công ty SX — chọn lại khi tạo đơn xưởng

CREATE TABLE IF NOT EXISTS production_external_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS production_external_companies_co_name_uq
  ON production_external_companies (production_company_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_production_external_companies_co
  ON production_external_companies (production_company_id)
  WHERE is_active = true;

COMMENT ON TABLE production_external_companies IS
  'Công ty đối tác / khách B2B ngoài hệ thống — lưu theo công ty SX để chọn lại khi tạo deal.';

ALTER TABLE production_external_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "production_external_companies_all" ON production_external_companies;
CREATE POLICY "production_external_companies_all" ON production_external_companies
  FOR ALL USING (true) WITH CHECK (true);
