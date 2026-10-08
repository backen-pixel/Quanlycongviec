-- PREPARED ONLY. Apply on staging before an explicitly approved production release.
BEGIN;
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_attribution jsonb,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE public.lead_attribution
  ADD COLUMN IF NOT EXISTS campaign_id text,
  ADD COLUMN IF NOT EXISTS adset_id text,
  ADD COLUMN IF NOT EXISTS ad_id text,
  ADD COLUMN IF NOT EXISTS gbraid text,
  ADD COLUMN IF NOT EXISTS wbraid text;

COMMENT ON COLUMN public.crm_leads.is_test IS 'Explicit test record; exclude from marketing reports, retain operational record.';
COMMENT ON COLUMN public.crm_leads.assigned_at IS 'Observed time of current assignment after migration; NULL means unknown or unassigned. Not customer contact time.';
COMMENT ON COLUMN public.crm_leads.intake_attribution IS 'Immutable allowlisted external intake receipt, projected atomically to lead_attribution. No description parsing.';
COMMENT ON COLUMN public.lead_attribution.campaign_id IS 'Platform-neutral campaign ID; never copy a Google campaign to fb_campaign_id.';

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
             'gclid','fbclid','gbraid','wbraid','landing_url'])
           OR jsonb_typeof(v) <> 'string' OR length(v #>> '{}') > 2048) THEN
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
    gclid, fbclid, gbraid, wbraid, landing_url, cham_dau_luc
  ) VALUES (
    NEW.id, NEW.customer_id, NEW.company_id, a->>'kenh', a->>'platform',
    a->>'campaign_id', a->>'adset_id', a->>'ad_id',
    CASE WHEN a->>'platform' IN ('facebook','instagram') THEN a->>'campaign_id' END,
    CASE WHEN a->>'platform' IN ('facebook','instagram') THEN a->>'adset_id' END,
    CASE WHEN a->>'platform' IN ('facebook','instagram') THEN a->>'ad_id' END,
    a->>'utm_source', a->>'utm_medium', a->>'utm_campaign', a->>'utm_content', a->>'utm_term',
    a->>'gclid', a->>'fbclid', a->>'gbraid', a->>'wbraid', a->>'landing_url', NEW.created_at
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.marketing_intake_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_intake_project() FROM PUBLIC, anon, authenticated;
-- Existing service-role-only tables, RLS and grants are unchanged; no new public API.
DROP TRIGGER IF EXISTS marketing_intake_guard ON public.crm_leads;
CREATE TRIGGER marketing_intake_guard BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.marketing_intake_guard();
DROP TRIGGER IF EXISTS marketing_intake_project ON public.crm_leads;
CREATE TRIGGER marketing_intake_project AFTER INSERT ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.marketing_intake_project();
COMMIT;
