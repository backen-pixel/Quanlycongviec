-- Facebook page: choose business module for auto-created CRM records
ALTER TABLE facebook_pages
  ADD COLUMN IF NOT EXISTS default_module_key text;

UPDATE facebook_pages
SET default_module_key = CASE
  WHEN COALESCE(NULLIF(default_target_type, ''), 'lead') = 'deal' THEN 'production'
  ELSE 'crm'
END
WHERE default_module_key IS NULL
   OR btrim(default_module_key) = '';

ALTER TABLE facebook_pages
  ALTER COLUMN default_module_key SET DEFAULT 'crm';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'facebook_pages_default_module_key_check'
  ) THEN
    ALTER TABLE facebook_pages
      ADD CONSTRAINT facebook_pages_default_module_key_check
      CHECK (default_module_key IN ('crm', 'production', 'logistics'));
  END IF;
END $$;
