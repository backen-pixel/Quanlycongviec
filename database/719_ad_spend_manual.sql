-- W3 (plan «Đo chuyển đổi website», Founder 11/10/2026): ad spend for channels without an API sync yet
-- (Google Ads, ChatGPT Ads, …), entered by a company admin per day and campaign. Facebook stays on
-- fb_ad_spend_daily. Every write is also appended to the log, so overwrites keep their history.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.ad_spend_daily_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  provider text NOT NULL CONSTRAINT ad_spend_manual_provider_check
    CHECK (provider IN ('GOOGLE','CHATGPT','TIKTOK','ZALO','OTHER')),
  campaign_key text NOT NULL DEFAULT '' CONSTRAINT ad_spend_manual_campaign_key_check CHECK (length(campaign_key) <= 200),
  campaign_name text CONSTRAINT ad_spend_manual_campaign_name_check CHECK (length(campaign_name) <= 300),
  ngay date NOT NULL,
  chi_tieu_vnd bigint NOT NULL CONSTRAINT ad_spend_manual_amount_check CHECK (chi_tieu_vnd >= 0),
  nguon text NOT NULL DEFAULT 'manual' CONSTRAINT ad_spend_manual_source_check CHECK (nguon IN ('manual','csv','api')),
  entered_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_spend_manual_once_per_day UNIQUE (company_id, provider, campaign_key, ngay)
);
CREATE INDEX IF NOT EXISTS ad_spend_manual_company_day_idx ON public.ad_spend_daily_manual(company_id, ngay);

CREATE TABLE IF NOT EXISTS public.ad_spend_daily_manual_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL,
  provider text NOT NULL,
  campaign_key text NOT NULL,
  ngay date NOT NULL,
  chi_tieu_vnd bigint NOT NULL,
  nguon text NOT NULL,
  entered_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_spend_daily_manual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_spend_daily_manual_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_spend_daily_manual, public.ad_spend_daily_manual_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ad_spend_daily_manual TO service_role;
GRANT SELECT, INSERT ON TABLE public.ad_spend_daily_manual_log TO service_role;
COMMIT;
