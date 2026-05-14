-- 162_kpi_group_a_applies_to_sales_all.sql
-- Áp dụng toàn bộ KPI Nhóm A (A1..A6) cho cả Sales Admin và SAE (Sales Executive).
-- Trước đây: A1/A2/A3 = sales_admin, A4 = sales, A5 = deal, A6 = all → không thống nhất.
-- Sau khi chạy: tất cả KPI Nhóm A có applies_to = 'sales_all' (Sales + Sales Admin).
-- Idempotent.

BEGIN;

-- 1) Mở rộng CHECK constraint của applies_to để chấp nhận giá trị mới 'sales_all'.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'kpi_definitions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%applies_to%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE kpi_definitions DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE kpi_definitions
  ADD CONSTRAINT kpi_definitions_applies_to_check
  CHECK (applies_to IN ('sales','sales_admin','sales_all','deal','all'));

-- 2) Cập nhật toàn bộ KPI Nhóm A → áp dụng cho cả Sales + Sales Admin.
UPDATE kpi_definitions
SET applies_to = 'sales_all'
WHERE group_code = 'A';

COMMENT ON COLUMN kpi_definitions.applies_to IS
  'Đối tượng áp dụng: sales (SAE) | sales_admin | sales_all (Sales + Sales Admin) | deal | all';

COMMIT;
