-- Restore only this repair, refuse attribution drift. Never touch contact/sales/timestamps.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE j record; l public.crm_leads; a public.lead_attribution;
BEGIN
  IF to_regclass('marketing_repair_private.repair_20261008') IS NULL THEN RETURN; END IF;
  FOR j IN SELECT * FROM marketing_repair_private.repair_20261008 ORDER BY lead_id LOOP
    SELECT * INTO STRICT l FROM public.crm_leads WHERE id=j.lead_id AND company_id=j.company_id FOR UPDATE;
    PERFORM 1 FROM public.companies WHERE id=l.company_id
      AND id='991dc79d-cbf5-49f9-a364-35227cb47635'
      AND tenant_id='7d42e731-895b-4ba8-99d6-0005c4e23544' FOR SHARE;
    IF NOT FOUND OR l.is_test IS DISTINCT FROM j.after_test THEN RAISE EXCEPTION 'Scope/flag drift'; END IF;
    IF j.inserted_attribution IS NOT NULL THEN
      SELECT * INTO STRICT a FROM public.lead_attribution
        WHERE id=(j.inserted_attribution->>'id')::uuid AND lead_id=j.lead_id FOR UPDATE;
      IF to_jsonb(a) IS DISTINCT FROM j.inserted_attribution THEN RAISE EXCEPTION 'Attribution drift'; END IF;
      DELETE FROM public.lead_attribution WHERE id=a.id AND lead_id=j.lead_id;
    END IF;
    UPDATE public.crm_leads SET is_test=j.before_test WHERE id=j.lead_id AND company_id=j.company_id;
    DELETE FROM marketing_repair_private.repair_20261008 WHERE lead_id=j.lead_id;
  END LOOP;
END $$;
COMMIT;
