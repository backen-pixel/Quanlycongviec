-- W2 (plan «Đo chuyển đổi website», Founder 11/10/2026): website clicks on call / Zalo / Messenger.
-- A click is NOT a lead: no name, phone or raw IP is stored. One row per visit session and kind.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.web_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  kind text NOT NULL CONSTRAINT web_conversion_events_kind_check CHECK (kind IN ('call','zalo','messenger')),
  session_key text NOT NULL CONSTRAINT web_conversion_events_session_check CHECK (session_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  platform text NOT NULL DEFAULT 'direct',
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  gclid text, fbclid text, gbraid text, wbraid text,
  campaign_id text, adset_id text, ad_id text,
  landing_url text, page_url text, referrer_host text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_conversion_events_once_per_session UNIQUE (company_id, session_key, kind),
  CONSTRAINT web_conversion_events_text_size_check CHECK (
    coalesce(length(utm_source),0) <= 256 AND coalesce(length(utm_medium),0) <= 256 AND
    coalesce(length(utm_campaign),0) <= 256 AND coalesce(length(utm_content),0) <= 256 AND
    coalesce(length(utm_term),0) <= 256 AND coalesce(length(gclid),0) <= 512 AND
    coalesce(length(fbclid),0) <= 512 AND coalesce(length(gbraid),0) <= 512 AND
    coalesce(length(wbraid),0) <= 512 AND coalesce(length(campaign_id),0) <= 64 AND
    coalesce(length(adset_id),0) <= 64 AND coalesce(length(ad_id),0) <= 64 AND
    coalesce(length(platform),0) <= 64 AND coalesce(length(landing_url),0) <= 1000 AND
    coalesce(length(page_url),0) <= 1000 AND coalesce(length(referrer_host),0) <= 253)
);
CREATE INDEX IF NOT EXISTS web_conversion_events_company_time_idx
  ON public.web_conversion_events(company_id, occurred_at DESC);

COMMENT ON TABLE public.web_conversion_events IS
  'Website click conversions (call/zalo/messenger) with visit-session attribution. Not leads; no PII or raw IP.';

ALTER TABLE public.web_conversion_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.web_conversion_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.web_conversion_events TO service_role;
COMMIT;
