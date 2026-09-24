-- Messenger referral evidence; not customer qualification or revenue attribution.
BEGIN;
CREATE TABLE IF NOT EXISTS public.facebook_ad_touches (
  event_key text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  contact_id uuid NOT NULL REFERENCES public.facebook_contacts(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  ad_id text NOT NULL CHECK (ad_id ~ '^[0-9]{5,30}$'),
  occurred_at timestamptz NOT NULL,
  evidence_source text NOT NULL CHECK (evidence_source = 'messenger_referral'),
  verification_status text NOT NULL DEFAULT 'unverified_webhook'
    CHECK (verification_status IN ('unverified_webhook','verified')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facebook_ad_touches_page_time ON public.facebook_ad_touches(page_id,occurred_at,event_key);
CREATE INDEX IF NOT EXISTS idx_facebook_ad_touches_contact ON public.facebook_ad_touches(contact_id);
ALTER TABLE public.facebook_ad_touches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facebook_ad_touches FROM anon, authenticated;
GRANT SELECT, INSERT ON public.facebook_ad_touches TO service_role;
COMMIT;
-- Rollback: revert application commit first; retain evidence table for audit.
