-- 355: Drive ACL — cho phép cấp quyền theo khu vực (region).
--
-- Bổ sung 'region' vào CHECK constraint principal_type của drive_acl. Sau migration:
--   principal_type IN ('user','department','company','role','everyone','region')
--
-- Khi chia sẻ folder/file với principal_type='region', principal_id = company_regions.id.
-- Tất cả user thuộc khu vực đó (qua user_company_regions) sẽ nhận được role tương ứng.

BEGIN;

-- Drop & recreate CHECK constraint (tên do migration 347 đặt tự động — tìm tên động)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.drive_acl'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%principal_type%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE drive_acl DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE drive_acl
  ADD CONSTRAINT drive_acl_principal_type_check
  CHECK (principal_type IN ('user','department','company','role','everyone','region'));

COMMENT ON CONSTRAINT drive_acl_principal_type_check ON drive_acl IS
  'Loại principal nhận quyền: user/department/company/role/everyone/region';

COMMIT;
