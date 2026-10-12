-- Rollback 720: stop MacroDroid from posting first (or the endpoint returns 503), then drop.
-- Loses the company link on phone-intake call logs; the rows themselves stay.
BEGIN;
SET LOCAL lock_timeout = '2s';
DROP INDEX IF EXISTS public.crm_call_logs_company_phone_started_idx;
ALTER TABLE public.crm_call_logs DROP COLUMN IF EXISTS company_id;
COMMIT;
