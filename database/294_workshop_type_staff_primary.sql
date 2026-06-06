-- 294_workshop_type_staff_primary.sql
-- Phụ trách chính riêng theo từng phân loại xưởng (không phụ thuộc thứ tự chọn).
-- Idempotent.

BEGIN;

ALTER TABLE production_workshop_type_default_staff
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE project_production_staff
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Backfill: NV đầu tiên (order_index nhỏ nhất) = primary nếu chưa có
UPDATE production_workshop_type_default_staff d
SET is_primary = true
WHERE NOT EXISTS (
  SELECT 1 FROM production_workshop_type_default_staff x
  WHERE x.production_company_id = d.production_company_id
    AND x.workshop_type_id = d.workshop_type_id
    AND x.is_primary = true
)
AND d.order_index = (
  SELECT MIN(d2.order_index)
  FROM production_workshop_type_default_staff d2
  WHERE d2.production_company_id = d.production_company_id
    AND d2.workshop_type_id = d.workshop_type_id
);

UPDATE project_production_staff p
SET is_primary = true
WHERE NOT EXISTS (
  SELECT 1 FROM project_production_staff x
  WHERE x.project_id = p.project_id AND x.is_primary = true
)
AND p.order_index = (
  SELECT MIN(p2.order_index) FROM project_production_staff p2 WHERE p2.project_id = p.project_id
);

COMMENT ON COLUMN production_workshop_type_default_staff.is_primary IS
  'NV phụ trách chính của phân loại — map sang projects.production_person_id khi intake.';

COMMENT ON COLUMN project_production_staff.is_primary IS
  'NV phụ trách chính trên dự án — trùng projects.production_person_id.';

COMMIT;
