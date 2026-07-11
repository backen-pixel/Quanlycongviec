-- 414_phuc_dat_logistics_ngoc_linh.sql
-- Công ty Nhôm Kính Phúc Đạt: gắn khối Vận chuyển & Lắp đặt, gán NV Nguyễn Ngọc Linh.
-- Idempotent.

BEGIN;

INSERT INTO company_division_units (company_id, division_unit_id, is_primary)
VALUES (
  '29677f68-967e-4256-92fd-492bb580e888',
  'b6829c28-40f4-4606-9bb6-3a8c8184f3a0',
  false
)
ON CONFLICT (company_id, division_unit_id) DO NOTHING;

INSERT INTO departments (name, slug, company_id, division_unit_id, is_active)
SELECT
  'Phòng vận chuyển - lắp đặt',
  'phong-van-chuyen-lap-dat',
  '29677f68-967e-4256-92fd-492bb580e888',
  'b6829c28-40f4-4606-9bb6-3a8c8184f3a0',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM departments
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND division_unit_id = 'b6829c28-40f4-4606-9bb6-3a8c8184f3a0'
);

UPDATE users
SET
  company_id = '29677f68-967e-4256-92fd-492bb580e888',
  department_id = (
    SELECT id FROM departments
    WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
      AND division_unit_id = 'b6829c28-40f4-4606-9bb6-3a8c8184f3a0'
    ORDER BY created_at
    LIMIT 1
  ),
  updated_at = NOW()
WHERE id = '5e07fb3b-3286-4ca3-a167-4edef16f3866';

COMMIT;
