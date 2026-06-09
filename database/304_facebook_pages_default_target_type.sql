-- Facebook page: choose default CRM record type created from inbox
ALTER TABLE facebook_pages
  ADD COLUMN IF NOT EXISTS default_target_type text;

UPDATE facebook_pages
SET default_target_type = COALESCE(NULLIF(default_target_type, ''), 'lead')
WHERE default_target_type IS NULL
   OR btrim(default_target_type) = '';

ALTER TABLE facebook_pages
  ALTER COLUMN default_target_type SET DEFAULT 'lead';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'facebook_pages_default_target_type_check'
  ) THEN
    ALTER TABLE facebook_pages
      ADD CONSTRAINT facebook_pages_default_target_type_check
      CHECK (default_target_type IN ('lead', 'deal'));
  END IF;
END $$;
