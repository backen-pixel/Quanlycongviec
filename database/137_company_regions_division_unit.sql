-- Company regions per division_unit (Khối)
-- When a company belongs to multiple divisions, each division can have its own CRM regions.

DO $$ BEGIN
  ALTER TABLE company_regions ADD COLUMN division_unit_id UUID REFERENCES ecosystem_units(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_regions_company_division
  ON company_regions(company_id, division_unit_id, is_active, order_index);

COMMENT ON COLUMN company_regions.division_unit_id IS 'Khối (division unit depth 1) mà khu vực CRM thuộc về';

-- Backfill legacy rows (no division_unit_id) → gán về khối chính của công ty
UPDATE company_regions r
SET division_unit_id = c.division_unit_id
FROM companies c
WHERE r.company_id = c.id
  AND r.division_unit_id IS NULL
  AND c.division_unit_id IS NOT NULL;

