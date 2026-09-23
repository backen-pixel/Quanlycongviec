-- 623: Setup công thức chi phí theo khu vực (ghi đè mặc định toàn công ty).
-- Additive. Không xóa dữ liệu 622. region_id NULL = mặc định toàn công ty.

BEGIN;

ALTER TABLE cost_categories
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE CASCADE;
ALTER TABLE cost_source_defs
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE CASCADE;
ALTER TABLE cost_formulas
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS uq_cost_categories_company_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_categories_company_code
  ON cost_categories (company_id, lower(code))
  WHERE region_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_categories_company_region_code
  ON cost_categories (company_id, region_id, lower(code))
  WHERE region_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_categories_region
  ON cost_categories (company_id, region_id)
  WHERE region_id IS NOT NULL;

DROP INDEX IF EXISTS uq_cost_source_defs_company_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_source_defs_company_key
  ON cost_source_defs (company_id, source_key)
  WHERE region_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_source_defs_company_region_key
  ON cost_source_defs (company_id, region_id, source_key)
  WHERE region_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_source_defs_region
  ON cost_source_defs (company_id, region_id)
  WHERE region_id IS NOT NULL;

DROP INDEX IF EXISTS uq_cost_formulas_company_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_formulas_company_code
  ON cost_formulas (company_id, lower(code))
  WHERE region_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_formulas_company_region_code
  ON cost_formulas (company_id, region_id, lower(code))
  WHERE region_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_formulas_region
  ON cost_formulas (company_id, region_id)
  WHERE region_id IS NOT NULL;

COMMENT ON COLUMN cost_categories.region_id IS
  'NULL = mặc định toàn công ty. Có giá trị = setup riêng khu vực (sao chép rồi chỉnh).';
COMMENT ON COLUMN cost_source_defs.region_id IS
  'NULL = mặc định toàn công ty. Có giá trị = setup riêng khu vực.';
COMMENT ON COLUMN cost_formulas.region_id IS
  'NULL = mặc định toàn công ty. Có giá trị = công thức riêng khu vực.';

COMMIT;
