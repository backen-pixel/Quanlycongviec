-- psql, defaults to dry-run. Approved apply: psql ... -v apply=true -f this-file
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply false
\endif
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE repair_targets ON COMMIT DROP AS
SELECT l.id,l.code,l.company_id,l.is_test,
  CASE l.code WHEN 'LEAD-2026-1442' THEN '23976669573'
              WHEN 'LEAD-2026-1443' THEN '24315831726' END AS campaign_id
FROM public.crm_leads l JOIN public.companies c ON c.id=l.company_id
WHERE c.tenant_id='7d42e731-895b-4ba8-99d6-0005c4e23544'
  AND l.company_id='991dc79d-cbf5-49f9-a364-35227cb47635'
  AND l.code IN ('LEAD-2026-1441','LEAD-2026-1442','LEAD-2026-1443');
-- Only identifiers/plan, no description, contact, click ID, or PII in output.
SELECT code, CASE WHEN campaign_id IS NULL THEN 'mark_test' ELSE 'insert_campaign_attribution_if_absent' END AS plan,
  campaign_id FROM repair_targets ORDER BY code;
\if :apply
  CREATE SCHEMA IF NOT EXISTS marketing_repair_private;
  REVOKE ALL ON SCHEMA marketing_repair_private FROM PUBLIC, anon, authenticated;
  CREATE TABLE IF NOT EXISTS marketing_repair_private.repair_20261008 (
    lead_id uuid PRIMARY KEY, company_id uuid NOT NULL, before_test boolean NOT NULL,
    after_test boolean NOT NULL, inserted_attribution jsonb
  );
  ALTER TABLE marketing_repair_private.repair_20261008 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON marketing_repair_private.repair_20261008 FROM PUBLIC, anon, authenticated;
  DO $$
  DECLARE t record; l public.crm_leads; a public.lead_attribution;
  BEGIN
    IF (SELECT count(*) FROM repair_targets) <> 3 THEN RAISE EXCEPTION 'Expected exactly 3 scoped targets'; END IF;
    FOR t IN SELECT * FROM repair_targets ORDER BY id LOOP
      SELECT * INTO STRICT l FROM public.crm_leads WHERE id=t.id AND company_id=t.company_id FOR UPDATE;
      PERFORM 1 FROM public.companies WHERE id=l.company_id
        AND tenant_id='7d42e731-895b-4ba8-99d6-0005c4e23544' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Tenant changed'; END IF;
      IF EXISTS (SELECT 1 FROM marketing_repair_private.repair_20261008 WHERE lead_id=l.id) THEN CONTINUE; END IF;
      IF t.campaign_id IS NULL THEN
        -- Explicit reviewed code, plus evidence guard; never bulk-guess from a source name.
        IF NOT (coalesce(l.title,'') ~* '\mTEST\M' OR coalesce(l.description,'') ~* '\mTEST\M') THEN
          RAISE EXCEPTION 'Test evidence changed; review required';
        END IF;
        UPDATE public.crm_leads SET is_test=true WHERE id=l.id AND company_id=t.company_id;
        INSERT INTO marketing_repair_private.repair_20261008 VALUES(l.id,l.company_id,l.is_test,true,NULL);
      ELSE
        IF position(t.campaign_id IN coalesce(l.description,''))=0 THEN RAISE EXCEPTION 'Campaign evidence changed'; END IF;
        -- Never enrich/replace a competing attribution; preserve it for manual reconciliation.
        IF EXISTS (SELECT 1 FROM public.lead_attribution WHERE lead_id=l.id) THEN
          RAISE EXCEPTION 'Attribution already exists without this repair journal';
        END IF;
        INSERT INTO public.lead_attribution(lead_id,company_id,kenh,platform,campaign_id,cham_dau_luc,raw)
          VALUES(l.id,l.company_id,'website','google',t.campaign_id,l.created_at,
            '{"repair":"marketing_20261008","evidence":"reviewed_description_campaign","touch_time_basis":"crm_received_at","click_time_unknown":true}'::jsonb)
          RETURNING * INTO a;
        -- Use the CRM receipt time, explicitly not a reconstructed click/contact time.
        INSERT INTO marketing_repair_private.repair_20261008 VALUES(l.id,l.company_id,l.is_test,l.is_test,to_jsonb(a));
      END IF;
    END LOOP;
  END $$;
  COMMIT;
\else
  ROLLBACK;
\endif
