-- PREPARED ONLY. Incoming calls reported by an Android phone (MacroDroid) via
-- POST /api/external/phone-calls. crm_call_logs (48_call_logs.sql) had no company scope;
-- the endpoint needs it for per-company dedupe ("same phone within 30 minutes") and linking.
-- Additive and idempotent. Apply on staging first; production needs separate Founder approval.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.crm_call_logs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.crm_call_logs.company_id IS
  'Company that received the call (set by phone-call intake from the API key). NULL for legacy Stringee rows.';

CREATE INDEX IF NOT EXISTS crm_call_logs_company_phone_started_idx
  ON public.crm_call_logs(company_id, provider, phone_from, started_at DESC);

-- Same posture as siblings after 700_revoke_anon_public_access.sql: backend service_role only.
ALTER TABLE public.crm_call_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_call_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.crm_call_logs TO service_role;
COMMIT;
