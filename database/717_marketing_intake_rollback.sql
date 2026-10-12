-- Roll back the application first. Preserve all collected metadata and test flags.
-- Do not drop columns: doing so would lose receipts and let older reports count tests.
BEGIN;
DROP TRIGGER IF EXISTS marketing_intake_project ON public.crm_leads;
DROP TRIGGER IF EXISTS marketing_intake_guard ON public.crm_leads;
DROP FUNCTION IF EXISTS public.marketing_intake_project();
DROP FUNCTION IF EXISTS public.marketing_intake_guard();
COMMIT;
