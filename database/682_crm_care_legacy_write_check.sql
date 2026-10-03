-- Application preflight for old multi-request writers. This is a current
-- scope check, not a transaction spanning subsequent HTTP writes. Enrollment
-- still requires stopping and draining old writers before the switch.
BEGIN;
CREATE OR REPLACE FUNCTION public.crm_care_legacy_write_check(p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k text;v jsonb;pages text[];contacts uuid[];leads uuid[];customers uuid[];nodes jsonb;managed boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_scope) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_scope))<>4
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_scope)x WHERE x NOT IN('pageIds','contactIds','leadIds','customerIds')) THEN
  RAISE EXCEPTION 'invalid legacy scope' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['pageIds','contactIds','leadIds','customerIds'] LOOP
  IF jsonb_typeof(p_scope->k) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scope->k)>500 THEN
   RAISE EXCEPTION 'invalid legacy scope' USING ERRCODE='22023';END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(p_scope->k) LOOP
   IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR
    (CASE WHEN k='pageIds' THEN (v#>>'{}')~'^[0-9]{1,32}$' ELSE (v#>>'{}')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' END) IS NOT TRUE THEN
    RAISE EXCEPTION 'invalid legacy identity' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 SELECT coalesce(array_agg(value),'{}'::text[]) INTO pages FROM jsonb_array_elements_text(p_scope->'pageIds');
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO contacts FROM jsonb_array_elements_text(p_scope->'contactIds');
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO leads FROM jsonb_array_elements_text(p_scope->'leadIds');
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO customers FROM jsonb_array_elements_text(p_scope->'customerIds');
 IF cardinality(pages)+cardinality(contacts)+cardinality(leads)+cardinality(customers)=0 THEN RAISE EXCEPTION 'empty legacy scope' USING ERRCODE='22023';END IF;
 PERFORM crm_care_control.connection_ready();
 IF EXISTS(SELECT 1 FROM unnest(pages)x WHERE NOT EXISTS(SELECT 1 FROM public.facebook_pages p WHERE p.page_id=x))
  OR EXISTS(SELECT 1 FROM unnest(contacts)x WHERE NOT EXISTS(SELECT 1 FROM public.facebook_contacts c WHERE c.id=x))
  OR EXISTS(SELECT 1 FROM unnest(leads)x WHERE NOT EXISTS(SELECT 1 FROM public.crm_leads l WHERE l.id=x))
  OR EXISTS(SELECT 1 FROM unnest(customers)x WHERE NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=x)) THEN
  RAISE EXCEPTION 'legacy scope changed' USING ERRCODE='40001';END IF;
 -- Page is a terminal node: a Page-only check must not walk every contact on
 -- that Page. Entity checks follow shared Customer, direct and inverse links,
 -- and durable intake evidence even before any Messenger mapping exists.
 WITH RECURSIVE edges(a_kind,a_id,b_kind,b_id) AS(
  SELECT 'contact',id::text,'page',page_id FROM public.facebook_contacts
  UNION ALL SELECT 'contact',id::text,'lead',lead_id::text FROM public.facebook_contacts WHERE lead_id IS NOT NULL
  UNION ALL SELECT 'lead',lead_id::text,'contact',id::text FROM public.facebook_contacts WHERE lead_id IS NOT NULL
  UNION ALL SELECT 'contact',id::text,'customer',customer_id::text FROM public.facebook_contacts WHERE customer_id IS NOT NULL
  UNION ALL SELECT 'customer',customer_id::text,'contact',id::text FROM public.facebook_contacts WHERE customer_id IS NOT NULL
  UNION ALL SELECT 'contact',contact_id::text,'lead',lead_id::text FROM public.facebook_messages WHERE contact_id IS NOT NULL AND lead_id IS NOT NULL
  UNION ALL SELECT 'lead',lead_id::text,'contact',contact_id::text FROM public.facebook_messages WHERE contact_id IS NOT NULL AND lead_id IS NOT NULL
  UNION ALL SELECT 'lead',id::text,'contact',facebook_contact_id::text FROM public.crm_leads WHERE facebook_contact_id IS NOT NULL
  UNION ALL SELECT 'contact',facebook_contact_id::text,'lead',id::text FROM public.crm_leads WHERE facebook_contact_id IS NOT NULL
  UNION ALL SELECT 'lead',id::text,'customer',customer_id::text FROM public.crm_leads WHERE customer_id IS NOT NULL
  UNION ALL SELECT 'customer',customer_id::text,'lead',id::text FROM public.crm_leads WHERE customer_id IS NOT NULL
  UNION ALL SELECT 'lead',lead_id::text,'page',page_id FROM public.marketing_fb_lead_receipts WHERE lead_id IS NOT NULL
  UNION ALL SELECT 'customer',customer_id::text,'page',page_id FROM public.marketing_fb_lead_receipts WHERE customer_id IS NOT NULL
  UNION ALL SELECT 'lead',lead_id::text,'page',proof->>'pageId' FROM public.crm_lead_source_evidence
  UNION ALL SELECT 'customer',customer_id::text,'page',proof->>'pageId' FROM public.crm_lead_source_evidence
  UNION ALL SELECT 'lead',lead_id::text,'page',page_id FROM public.facebook_lead_ads WHERE lead_id IS NOT NULL
  UNION ALL SELECT 'customer',customer_id::text,'page',page_id FROM public.facebook_lead_ads WHERE customer_id IS NOT NULL
  UNION ALL SELECT 'lead',lead_id::text,'page',page_id FROM public.facebook_comments WHERE lead_id IS NOT NULL
 ),walk(kind,id) AS(
  SELECT 'page',unnest(pages) UNION SELECT 'contact',unnest(contacts)::text
  UNION SELECT 'lead',unnest(leads)::text UNION SELECT 'customer',unnest(customers)::text
  UNION
  SELECT e.b_kind,e.b_id FROM walk w JOIN edges e ON e.a_kind=w.kind AND e.a_id=w.id WHERE e.b_id IS NOT NULL
 ) SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO nodes FROM(SELECT kind,id FROM walk LIMIT 1001)x;
 IF jsonb_array_length(nodes)>=1001 THEN RAISE EXCEPTION 'legacy scope too broad' USING ERRCODE='54000';END IF;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(nodes)n JOIN crm_care_control.connection_pages p ON p.page_id=n->>'id' WHERE n->>'kind'='page') INTO managed;
 RETURN jsonb_build_object('policy','CARE_LEGACY_WRITE_CHECK_V1','scope',p_scope,'allowed',NOT managed,
  'reason',CASE WHEN managed THEN 'MANAGED_PAGE' ELSE 'LEGACY_SCOPE' END,'observedAt',clock_timestamp(),'reservationMade',false);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_legacy_write_check(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_legacy_write_check(jsonb) TO service_role;
COMMIT;
