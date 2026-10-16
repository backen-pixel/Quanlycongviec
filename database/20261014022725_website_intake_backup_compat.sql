-- Backup compatibility only: primary crm_leads rows include website_intake even
-- when NULL. Mirror that column so existing asynchronous replication can upsert
-- them. Do not install primary receipt-generating triggers on the replica:
-- a replicated row is not a new form submission or proof of a backend save.
-- No backfill, grants, policies, receipt/outbox tables or provider activation.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS website_intake jsonb;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_leads'
      AND column_name='website_intake' AND data_type='jsonb'
      AND is_nullable='YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'BACKUP_WEBSITE_INTAKE_SCHEMA_MISMATCH';
  END IF;
END
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
