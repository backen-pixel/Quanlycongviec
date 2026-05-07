-- Phòng ban gắn với Khối HST (trong phạm vi công ty thuộc nhiều khối).
-- NULL = legacy: coi như thuộc khối chính của công ty (companies.division_unit_id).

DO $$ BEGIN
  ALTER TABLE departments ADD COLUMN division_unit_id UUID REFERENCES ecosystem_units(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_departments_division_unit ON departments(division_unit_id);

COMMENT ON COLUMN departments.division_unit_id IS 'Khối (ecosystem division depth 1) mà phòng ban thuộc';

-- Một công ty con trong HST chỉ một bản ghi cho mỗi (company_id, parent_khối)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecosystem_units_company_parent_division
ON ecosystem_units (company_id, parent_id)
WHERE company_id IS NOT NULL AND parent_id IS NOT NULL;

UPDATE departments d
SET division_unit_id = c.division_unit_id
FROM companies c
WHERE d.company_id = c.id
  AND d.division_unit_id IS NULL
  AND c.division_unit_id IS NOT NULL;
