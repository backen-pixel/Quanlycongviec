-- PREPARED ONLY: extend 717/718; review and test before any production release.
-- Generated with supabase migration new tiktok_attribution_receipt, then numbered
-- for this repository's existing database/NNN convention. Apply before backend/plugin.
-- No historical backfill: platform=tiktok without a paid medium or click ID is unknown.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.lead_attribution ADD COLUMN IF NOT EXISTS ttclid text;
ALTER TABLE public.web_conversion_events ADD COLUMN IF NOT EXISTS ttclid text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.lead_attribution'::regclass
      AND conname='lead_attribution_ttclid_size_check') THEN
    ALTER TABLE public.lead_attribution ADD CONSTRAINT lead_attribution_ttclid_size_check
      CHECK (length(ttclid) <= 512);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.web_conversion_events'::regclass
      AND conname='web_conversion_events_ttclid_size_check') THEN
    ALTER TABLE public.web_conversion_events ADD CONSTRAINT web_conversion_events_ttclid_size_check
      CHECK (length(ttclid) <= 512);
  END IF;
END $$;
COMMENT ON COLUMN public.lead_attribution.ttclid IS 'Visitor-supplied TikTok click ID; paid attribution signal, not a verified lead. First-touch identity.';
COMMENT ON COLUMN public.web_conversion_events.ttclid IS 'Visitor-supplied TikTok click ID retained with the visit; never count the click as a lead.';
-- Preserve existing service-role-only tables, RLS/grants, trigger identity and immutable receipt.
CREATE OR REPLACE FUNCTION public.marketing_intake_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.intake_attribution IS DISTINCT FROM OLD.intake_attribution THEN
      RAISE EXCEPTION 'intake_attribution is immutable';
    END IF;
    NEW.assigned_at := OLD.assigned_at;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      NEW.assigned_at := CASE WHEN NEW.assigned_to IS NOT NULL THEN statement_timestamp() END;
    END IF;
  ELSE
    NEW.assigned_at := CASE WHEN NEW.assigned_to IS NOT NULL THEN statement_timestamp() END;
    IF NEW.intake_attribution IS NOT NULL THEN
      IF jsonb_typeof(NEW.intake_attribution) <> 'object' THEN
        RAISE EXCEPTION 'Invalid intake attribution';
      END IF;
      IF NOT (NEW.intake_attribution ? 'kenh') OR
         NEW.intake_attribution->>'kenh' NOT IN ('website','messenger','lead_ads','comment','zalo','khac') OR
         EXISTS (SELECT 1 FROM jsonb_each(NEW.intake_attribution) AS e(k,v)
           WHERE k <> ALL(ARRAY['kenh','platform','campaign_id','adset_id','ad_id',
             'utm_source','utm_medium','utm_campaign','utm_content','utm_term',
             'gclid','fbclid','gbraid','wbraid','ttclid','landing_url'])
           OR jsonb_typeof(v) <> 'string' OR length(v #>> '{}') > 2048
           OR (k = 'ttclid' AND length(v #>> '{}') > 512)) THEN
        RAISE EXCEPTION 'Invalid intake attribution';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_intake_project()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE a jsonb := NEW.intake_attribution;
BEGIN
  IF a IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.lead_attribution (
    lead_id, customer_id, company_id, kenh, platform,
    campaign_id, adset_id, ad_id, fb_campaign_id, fb_adset_id, fb_ad_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    gclid, fbclid, gbraid, wbraid, ttclid, landing_url, cham_dau_luc
  ) VALUES (
    NEW.id, NEW.customer_id, NEW.company_id, a->>'kenh', a->>'platform',
    a->>'campaign_id', a->>'adset_id', a->>'ad_id',
    CASE WHEN a->>'platform' IN ('facebook','instagram') THEN a->>'campaign_id' END,
    CASE WHEN a->>'platform' IN ('facebook','instagram') THEN a->>'adset_id' END,
    CASE WHEN a->>'platform' IN ('facebook','instagram') THEN a->>'ad_id' END,
    a->>'utm_source', a->>'utm_medium', a->>'utm_campaign', a->>'utm_content', a->>'utm_term',
    a->>'gclid', a->>'fbclid', a->>'gbraid', a->>'wbraid', a->>'ttclid', a->>'landing_url', NEW.created_at
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.marketing_intake_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_intake_project() FROM PUBLIC, anon, authenticated;
COMMIT;
