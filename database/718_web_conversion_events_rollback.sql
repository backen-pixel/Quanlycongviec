-- Rollback 718: stop recording first (unset VPT_WEB_EVENTS_COMPANY_ID), then drop. Loses recorded clicks.
BEGIN;
DROP TABLE IF EXISTS public.web_conversion_events;
COMMIT;
