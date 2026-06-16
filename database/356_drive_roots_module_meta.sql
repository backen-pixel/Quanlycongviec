-- 356: metadata module / shared trên drive_roots — lọc Drive theo module, công ty, khu vực.
BEGIN;

ALTER TABLE drive_roots ADD COLUMN IF NOT EXISTS module_key TEXT;
ALTER TABLE drive_roots ADD COLUMN IF NOT EXISTS shared_kind TEXT;
ALTER TABLE drive_roots ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE drive_roots ADD COLUMN IF NOT EXISTS region_id UUID;

COMMENT ON COLUMN drive_roots.module_key IS 'Module Drive: crm|sx|vc|mkt|other. NULL = không gắn module.';
COMMENT ON COLUMN drive_roots.shared_kind IS 'Loại shared: shared_company | shared_region | custom | NULL.';
COMMENT ON COLUMN drive_roots.company_id IS 'Công ty gắn với root shared (shared_company).';
COMMENT ON COLUMN drive_roots.region_id IS 'Khu vực gắn với root shared (shared_region).';

CREATE INDEX IF NOT EXISTS idx_drive_roots_module_company
  ON drive_roots(module_key, company_id)
  WHERE shared_kind = 'shared_company';

CREATE INDEX IF NOT EXISTS idx_drive_roots_module_region
  ON drive_roots(module_key, region_id)
  WHERE shared_kind = 'shared_region';

COMMIT;
