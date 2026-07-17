-- 439: MCP key — danh sách công ty được phép (multi-select)
-- NULL / '{}' + company_id NULL = tất cả công ty
-- company_id set = 1 công ty (legacy)
-- allowed_company_ids = subset cụ thể

ALTER TABLE external_api_keys
  ADD COLUMN IF NOT EXISTS allowed_company_ids uuid[] DEFAULT NULL;

COMMENT ON COLUMN external_api_keys.allowed_company_ids IS
  'MCP: danh sách company_id được phép. NULL/empty + company_id NULL = tất cả. Nếu company_id có giá trị thì ưu tiên 1 công ty đó.';
