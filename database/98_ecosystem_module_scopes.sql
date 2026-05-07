-- Quản lý: công ty thuộc khối (companies.division_unit_id = khối chính; company_division_units = mọi khối) → chỉ thấy module mà ít nhất một khối được phép.
-- Nếu không có dòng nào cho một module_key → module đó mở cho mọi khối (tương thích ngược).
-- Khi có dòng: chỉ công ty có division_unit_id nằm trong danh sách khối của module đó mới thấy module (sidebar + GET /ecosystem/my-module-access).

CREATE TABLE IF NOT EXISTS ecosystem_module_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key VARCHAR(64) NOT NULL,
  division_unit_id UUID NOT NULL REFERENCES ecosystem_units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_key, division_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_module_scopes_module
  ON ecosystem_module_scopes(module_key);

CREATE INDEX IF NOT EXISTS idx_ecosystem_module_scopes_division
  ON ecosystem_module_scopes(division_unit_id);

COMMENT ON TABLE ecosystem_module_scopes IS 'Theo module: các khối được phép; công ty thuộc khối ngoài danh sách không thấy module. Rỗng theo module = không giới hạn khối.';
COMMENT ON COLUMN ecosystem_module_scopes.module_key IS 'crm | production | logistics | projects | tasks | customers';

ALTER TABLE ecosystem_module_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_ecosystem_module_scopes" ON ecosystem_module_scopes;
CREATE POLICY "service_all_ecosystem_module_scopes" ON ecosystem_module_scopes FOR ALL USING (true) WITH CHECK (true);
