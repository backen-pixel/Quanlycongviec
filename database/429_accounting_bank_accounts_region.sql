-- 429: STK kế toán chia thêm theo khu vực (company_regions) — không chỉ theo công ty

ALTER TABLE company_bank_accounts
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_region
  ON company_bank_accounts (region_id) WHERE is_active = true;

COMMENT ON COLUMN company_bank_accounts.region_id IS
  'Khu vực (chi nhánh) riêng của STK trong công ty — NULL = dùng chung mọi khu vực';

-- Cho phép nhiều default: 1 default / (company, không khu vực) + 1 default / (company, mỗi khu vực)
DROP INDEX IF EXISTS uq_company_bank_accounts_default;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_bank_accounts_default_noregion
  ON company_bank_accounts (company_id)
  WHERE is_default = true AND is_active = true AND region_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_bank_accounts_default_region
  ON company_bank_accounts (company_id, region_id)
  WHERE is_default = true AND is_active = true AND region_id IS NOT NULL;
