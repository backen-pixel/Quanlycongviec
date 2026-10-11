-- Rollback 719: loses manually entered spend and its log. Export first if it holds real data.
BEGIN;
DROP TABLE IF EXISTS public.ad_spend_daily_manual_log;
DROP TABLE IF EXISTS public.ad_spend_daily_manual;
COMMIT;
