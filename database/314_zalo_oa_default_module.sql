-- Zalo OA: chọn module / loại bản ghi CRM khi tự tạo lead/deal (giống facebook_pages)
ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS default_target_type text;

UPDATE zalo_oa_accounts
SET default_target_type = COALESCE(NULLIF(default_target_type, ''), 'lead')
WHERE default_target_type IS NULL
   OR btrim(default_target_type) = '';

ALTER TABLE zalo_oa_accounts
  ALTER COLUMN default_target_type SET DEFAULT 'lead';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zalo_oa_accounts_default_target_type_check'
  ) THEN
    ALTER TABLE zalo_oa_accounts
      ADD CONSTRAINT zalo_oa_accounts_default_target_type_check
      CHECK (default_target_type IN ('lead', 'deal'));
  END IF;
END $$;

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS default_module_key text;

UPDATE zalo_oa_accounts
SET default_module_key = CASE
  WHEN COALESCE(NULLIF(default_target_type, ''), 'lead') = 'deal' THEN 'production'
  ELSE 'crm'
END
WHERE default_module_key IS NULL
   OR btrim(default_module_key) = '';

ALTER TABLE zalo_oa_accounts
  ALTER COLUMN default_module_key SET DEFAULT 'crm';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zalo_oa_accounts_default_module_key_check'
  ) THEN
    ALTER TABLE zalo_oa_accounts
      ADD CONSTRAINT zalo_oa_accounts_default_module_key_check
      CHECK (default_module_key IN ('crm', 'production', 'logistics'));
  END IF;
END $$;
