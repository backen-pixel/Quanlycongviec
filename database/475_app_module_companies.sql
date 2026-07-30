-- 475: Module tùy chỉnh — gắn nhiều công ty (chia sẻ)
-- company_ids rỗng + company_id NULL = dùng chung mọi công ty

BEGIN;

CREATE TABLE IF NOT EXISTS app_module_companies (
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (module_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_app_module_companies_company
  ON app_module_companies(company_id);

ALTER TABLE app_module_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_companies" ON app_module_companies;
CREATE POLICY "service_all_app_module_companies" ON app_module_companies FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE app_module_companies IS
  'Công ty được phép thấy / dùng module tùy chỉnh. Không có dòng nào + app_modules.company_id NULL = dùng chung mọi công ty.';

-- Backfill: module có company_id đơn → gắn vào bảng mới
INSERT INTO app_module_companies (module_id, company_id)
SELECT id, company_id
FROM app_modules
WHERE company_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
