-- Bounded maintenance: restore a missing CRM label from original intake evidence.
-- This neither creates paid attribution nor qualifies a Lead. No live activation.
BEGIN;
CREATE SCHEMA IF NOT EXISTS crm_source_repair;
REVOKE ALL ON SCHEMA crm_source_repair FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS crm_source_repair.events(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,company_id uuid NOT NULL,
 command jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_source_repair.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_source_repair.events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_facebook_source_repair(
 p_actor uuid,p_company uuid,p_lead_ids uuid[],p_mode text,p_request_id uuid DEFAULT NULL,p_context_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $$
DECLARE ids uuid[];lead public.crm_leads%ROWTYPE;e public.crm_lead_source_evidence%ROWTYPE;
 receipt public.marketing_fb_lead_receipts%ROWTYPE;prior crm_source_repair.events%ROWTYPE;
 customer jsonb;page jsonb;src jsonb;proof_count integer;pages text[];scope jsonb;reason text;
 items jsonb:='[]';fingerprint jsonb:='[]';item jsonb;command jsonb;result jsonb;version text;changed integer:=0;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 IF p_actor IS NULL OR p_company IS NULL OR p_mode IS NULL OR p_mode NOT IN('preview','apply')
  OR coalesce(cardinality(p_lead_ids),0) NOT BETWEEN 1 AND 500 OR array_ndims(p_lead_ids) IS DISTINCT FROM 1
  OR array_position(p_lead_ids,NULL) IS NOT NULL
  OR (p_mode='preview' AND (p_request_id IS NOT NULL OR p_context_version IS NOT NULL))
  OR (p_mode='apply' AND (p_request_id IS NULL OR (p_context_version~'^[a-f0-9]{32}$') IS NOT TRUE)) THEN
  RAISE EXCEPTION 'invalid source repair command' USING ERRCODE='22023';END IF;
 SELECT array_agg(x ORDER BY x) INTO ids FROM(SELECT DISTINCT unnest(p_lead_ids) x)s;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 -- The older intake helper admits a NULL company-active flag. Maintenance
 -- requires positively active scope, including replay, while its row lock holds.
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=p_company AND is_active IS TRUE) THEN
  RAISE EXCEPTION 'company scope unavailable' USING ERRCODE='42501';END IF;
 -- This is a maintenance transaction, not an HTTP preflight. The existing gate
 -- protects enrollment. NOWAIT table locks additionally fence legacy writers
 -- which do not take that gate, including inserts into the evidence graph.
 -- Contention returns a conflict; callers must reconcile, never silently retry.
 PERFORM crm_care_control.connection_ready();
 LOCK TABLE public.crm_leads,public.customers,public.facebook_contacts,public.facebook_messages,
  public.facebook_comments,public.facebook_lead_ads,public.facebook_pages,
  public.marketing_fb_lead_receipts,public.crm_lead_source_evidence,public.crm_sources
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 IF (SELECT count(*) FROM public.crm_leads WHERE id=ANY(ids) AND company_id=p_company)<>cardinality(ids) THEN
  RAISE EXCEPTION 'source repair scope unavailable' USING ERRCODE='42501';END IF;
 command:=jsonb_build_object('leadIds',ids,'contextVersion',p_context_version);
 IF p_mode='apply' THEN
  SELECT * INTO prior FROM crm_source_repair.events WHERE request_id=p_request_id;
  IF FOUND THEN
   IF prior.actor_id<>p_actor OR prior.company_id<>p_company OR prior.command<>command THEN
    RAISE EXCEPTION 'source repair request conflict' USING ERRCODE='23505';END IF;
   RETURN prior.result||jsonb_build_object('replayed',true);
  END IF;
 END IF;
 scope:=public.crm_care_legacy_write_check(jsonb_build_object('pageIds','[]'::jsonb,'contactIds','[]'::jsonb,'leadIds',ids,'customerIds','[]'::jsonb));
 IF (scope->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'managed source repair scope' USING ERRCODE='40001';END IF;
 FOR lead IN SELECT * FROM public.crm_leads WHERE id=ANY(ids) ORDER BY id LOOP
  reason:=NULL;customer:=NULL;page:=NULL;src:=NULL;e:=NULL;receipt:=NULL;pages:='{}';
  IF lead.source_id IS NOT NULL THEN
   item:=jsonb_build_object('leadId',lead.id,'status','UNCHANGED','reason','EXISTING_SOURCE','sourceId',lead.source_id);
  ELSE
   SELECT to_jsonb(c) INTO customer FROM public.customers c WHERE id=lead.customer_id;
   IF lead.type IS DISTINCT FROM 'lead' OR customer->>'company_id' IS DISTINCT FROM p_company::text THEN reason:='CUSTOMER_OR_LEAD_REVIEW';END IF;
   SELECT count(*) INTO proof_count FROM public.crm_lead_source_evidence WHERE lead_id=lead.id;
   IF reason IS NULL AND proof_count<>1 THEN reason:=CASE WHEN proof_count=0 THEN 'NO_ORIGINAL_EVIDENCE' ELSE 'AMBIGUOUS_EVIDENCE' END;END IF;
   IF reason IS NULL THEN
    SELECT * INTO e FROM public.crm_lead_source_evidence WHERE lead_id=lead.id;
    SELECT * INTO receipt FROM public.marketing_fb_lead_receipts WHERE id=e.receipt_id;
    IF e.company_id<>p_company OR e.customer_id IS DISTINCT FROM lead.customer_id OR e.provider<>'META_LEAD_ADS_V1'
     OR jsonb_typeof(e.routing) IS DISTINCT FROM 'object'
     OR e.routing ? 'kind' OR (SELECT count(*) FROM jsonb_object_keys(e.routing))<>3
     OR NOT(e.routing ?& ARRAY['bindingRevision','config','approvedBy'])
     OR (e.routing->>'approvedBy'~'^[0-9a-f-]{36}$') IS NOT TRUE
     OR jsonb_typeof(e.routing->'config') IS DISTINCT FROM 'object'
     OR receipt.id IS NULL OR receipt.state IS DISTINCT FROM 'DONE' OR receipt.completed_at IS NULL
     OR receipt.company_id IS DISTINCT FROM p_company OR receipt.lead_id IS DISTINCT FROM lead.id
     OR receipt.customer_id IS DISTINCT FROM lead.customer_id
     OR e.routing->>'bindingRevision' IS DISTINCT FROM receipt.binding_revision::text
     OR e.routing->'config'->>'pageId' IS DISTINCT FROM receipt.page_id
     OR e.routing->'config'->>'formId' IS DISTINCT FROM receipt.form_id
     OR e.proof->>'provider' IS DISTINCT FROM e.provider OR e.proof->>'pageId' IS DISTINCT FROM receipt.page_id
     OR e.proof->>'formId' IS DISTINCT FROM receipt.form_id OR e.proof->>'leadgenId' IS DISTINCT FROM receipt.leadgen_id
     OR e.proof->>'source' IS DISTINCT FROM e.source_kind OR e.source_kind NOT IN('PAID','ORGANIC','UNKNOWN') THEN
     reason:='ORIGINAL_EVIDENCE_REVIEW';
    ELSE
     SELECT to_jsonb(p) INTO page FROM public.facebook_pages p WHERE page_id=receipt.page_id;
     IF page->>'default_company_id' IS DISTINCT FROM p_company::text OR page->>'is_active' IS DISTINCT FROM 'true' THEN reason:='PAGE_SCOPE_REVIEW';END IF;
     -- A current Page default is never provenance. Only the original routing ID
     -- can restore this label, and the referenced source must still be usable.
     SELECT to_jsonb(s) INTO src FROM public.crm_sources s WHERE id::text=e.routing->'config'->>'sourceId';
     IF src->>'company_id' IS DISTINCT FROM p_company::text OR src->>'is_active' IS DISTINCT FROM 'true' THEN reason:='SOURCE_SCOPE_REVIEW';END IF;
     SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO pages FROM(
      SELECT page_id x FROM public.facebook_contacts c WHERE c.lead_id=lead.id OR c.customer_id=lead.customer_id OR c.id=lead.facebook_contact_id
      UNION SELECT c.page_id FROM public.facebook_messages m JOIN public.facebook_contacts c ON c.id=m.contact_id WHERE m.lead_id=lead.id
      UNION SELECT page_id FROM public.facebook_comments WHERE lead_id=lead.id
      UNION SELECT page_id FROM public.facebook_lead_ads WHERE lead_id=lead.id OR customer_id=lead.customer_id
      UNION SELECT page_id FROM public.marketing_fb_lead_receipts WHERE lead_id=lead.id OR customer_id=lead.customer_id
      UNION SELECT proof->>'pageId' FROM public.crm_lead_source_evidence WHERE lead_id=lead.id OR customer_id=lead.customer_id
     )p WHERE x IS NOT NULL;
     IF pages IS DISTINCT FROM ARRAY[receipt.page_id] THEN reason:='MULTIPLE_PAGE_REVIEW';END IF;
    END IF;
   END IF;
   item:=jsonb_build_object('leadId',lead.id,'status',CASE WHEN reason IS NULL THEN 'READY' ELSE 'REVIEW' END,
    'reason',coalesce(reason,'ORIGINAL_INTAKE_SOURCE'),'sourceId',CASE WHEN reason IS NULL THEN src->>'id' ELSE NULL END);
  END IF;
  items:=items||jsonb_build_array(item);
  fingerprint:=fingerprint||jsonb_build_array(jsonb_build_object('lead',to_jsonb(lead),'customer',customer,'page',page,
   'source',src,'evidence',to_jsonb(e),'receipt',to_jsonb(receipt),'pages',pages,'decision',item));
 END LOOP;
 version:=md5(jsonb_build_object('policy','FACEBOOK_SOURCE_REPAIR_V1','companyId',p_company,'actorId',p_actor,'context',fingerprint)::text);
 IF p_mode='preview' THEN
  RETURN jsonb_build_object('policy','FACEBOOK_SOURCE_REPAIR_V1','mode','preview','companyId',p_company,'contextVersion',version,
   'items',items,'updated',0,'replayed',false,'restoresCrmLabelOnly',true);
 END IF;
 IF version IS DISTINCT FROM p_context_version THEN RAISE EXCEPTION 'source repair preview changed' USING ERRCODE='40001';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF item->>'status'='READY' THEN
   UPDATE public.crm_leads SET source_id=(item->>'sourceId')::uuid WHERE id=(item->>'leadId')::uuid AND company_id=p_company AND source_id IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'source repair changed' USING ERRCODE='40001';END IF;
   changed:=changed+1;
  END IF;
 END LOOP;
 SELECT jsonb_agg(CASE WHEN x->>'status'='READY' THEN x||jsonb_build_object('status','RESTORED') ELSE x END ORDER BY n)
  INTO items FROM jsonb_array_elements(items) WITH ORDINALITY a(x,n);
 result:=jsonb_build_object('policy','FACEBOOK_SOURCE_REPAIR_V1','mode','apply','companyId',p_company,'contextVersion',version,
  'requestId',p_request_id,'items',items,'updated',changed,'replayed',false,'restoresCrmLabelOnly',true);
 INSERT INTO crm_source_repair.events(request_id,actor_id,company_id,command,result) VALUES(p_request_id,p_actor,p_company,command,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_facebook_source_repair(uuid,uuid,uuid[],text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_facebook_source_repair(uuid,uuid,uuid[],text,uuid,text) TO service_role;
COMMIT;
