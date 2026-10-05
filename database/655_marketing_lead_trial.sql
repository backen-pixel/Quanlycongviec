-- Measurement configuration only. Does not authorize advertising or spending.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_lead_trials(
 id uuid PRIMARY KEY,company_id uuid NOT NULL,name text NOT NULL,since date NOT NULL,until date NOT NULL,
 revision integer NOT NULL,account_ids text[] NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(until-since=29),CHECK(cardinality(account_ids) BETWEEN 1 AND 100));
CREATE TABLE IF NOT EXISTS public.marketing_lead_trial_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,actor_id uuid NOT NULL,
 request_id uuid NOT NULL,trial_id uuid NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(company_id,request_id));
ALTER TABLE public.marketing_lead_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_lead_trial_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_lead_trials,public.marketing_lead_trial_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_lead_trial_set(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.marketing_lead_trials%ROWTYPE;e public.marketing_lead_trial_events%ROWTYPE;accounts text[];result jsonb;a date;b date;
BEGIN
 PERFORM public.crm_identity_review_admin(p_actor,p_company);
 IF p_trial IS NULL OR p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'name')) NOT BETWEEN 3 AND 120
  OR (p_command->>'since'~'^\d{4}-\d{2}-\d{2}$') IS NOT TRUE OR (p_command->>'until'~'^\d{4}-\d{2}-\d{2}$') IS NOT TRUE
  OR (p_command->>'expectedRevision'~'^(0|[1-9][0-9]*)$') IS NOT TRUE
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('name','since','until','expectedRevision'))
 THEN RAISE EXCEPTION 'invalid trial configuration' USING ERRCODE='22023';END IF;
 a:=(p_command->>'since')::date;b:=(p_command->>'until')::date;
 IF b-a<>29 THEN RAISE EXCEPTION 'trial requires thirty whole local days' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-lead-trial-id:'||p_trial::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-lead-trial:'||p_company::text,0));
 SELECT * INTO e FROM public.marketing_lead_trial_events WHERE company_id=p_company AND request_id=p_request;
 IF FOUND THEN
  IF e.actor_id IS DISTINCT FROM p_actor OR e.trial_id IS DISTINCT FROM p_trial OR e.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN e.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO t FROM public.marketing_lead_trials WHERE id=p_trial FOR UPDATE;
 IF t.id IS NOT NULL AND t.company_id<>p_company THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 IF coalesce(t.revision,0)<>(p_command->>'expectedRevision')::integer THEN RAISE EXCEPTION 'trial changed' USING ERRCODE='40001';END IF;
 PERFORM 1 FROM public.fb_ad_accounts WHERE company_id=p_company ORDER BY ad_account_id FOR SHARE;
 SELECT array_agg(ad_account_id ORDER BY ad_account_id) INTO accounts FROM public.fb_ad_accounts WHERE company_id=p_company;
 IF coalesce(cardinality(accounts),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'account inventory required' USING ERRCODE='22023';END IF;
 INSERT INTO public.marketing_lead_trials(id,company_id,name,since,until,revision,account_ids)
 VALUES(p_trial,p_company,btrim(p_command->>'name'),a,b,coalesce(t.revision,0)+1,accounts)
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,since=EXCLUDED.since,until=EXCLUDED.until,revision=EXCLUDED.revision,account_ids=EXCLUDED.account_ids,updated_at=clock_timestamp()
 RETURNING * INTO t;
 result:=to_jsonb(t)||jsonb_build_object('replayed',false,'allowBudgetExecution',false,'purpose','MEASUREMENT_CONFIGURATION');
 INSERT INTO public.marketing_lead_trial_events(company_id,actor_id,request_id,trial_id,command,result) VALUES(p_company,p_actor,p_request,p_trial,p_command,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_lead_trial_list(p_actor uuid,p_company uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.crm_identity_review_admin(p_actor,p_company);
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC,t.id),'[]'::jsonb) INTO result FROM public.marketing_lead_trials t WHERE company_id=p_company;
 RETURN jsonb_build_object('companyId',p_company,'trials',result,'allowBudgetExecution',false);
END $$;


-- Pure read helpers share the650/654 fingerprint/inventory expressions.
-- They use the caller's one-statement MVCC snapshot and never enroll rows.
CREATE OR REPLACE FUNCTION public.marketing_trial_quality_context(lj jsonb,customer_json jsonb,region_json jsonb,assignee_json jsonb,cj jsonb,assigned_region boolean,versions jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE fingerprint jsonb;l public.crm_leads%ROWTYPE;
BEGIN
 l:=jsonb_populate_record(NULL::public.crm_leads,lj);
  fingerprint:=jsonb_build_object(
    'lead',jsonb_build_object('id',l.id,'company',l.company_id,'customer',l.customer_id,'region',l.region_id,
      'assigned',l.assigned_to,'owner',l.lead_owner_id,'title',lj->'title','description',lj->'description',
      'product',lj->'lead_type_id','phone',lj->'phone','email',lj->'email','address',lj->'install_address'),
    'customer',jsonb_build_object('company',customer_json->'company_id','name',customer_json->'full_name','phone',customer_json->'phone','email',customer_json->'email','address',customer_json->'address','city',customer_json->'city'),
    'regionActive',region_json->'is_active','assigneeActive',assignee_json->'is_active','assigneeCompany',assignee_json->'company_id','assigneeTenant',assignee_json->'tenant_id','companyTenant',cj->'tenant_id','assignedRegion',assigned_region);

 RETURN md5((fingerprint||jsonb_build_object('sourceVersions',versions))::text);
END $$;
CREATE OR REPLACE FUNCTION public.marketing_trial_identity_inventory(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 WITH ids AS(
  SELECT id FROM public.crm_leads WHERE company_id=p_company
  UNION SELECT lead_id FROM public.crm_lead_identity_nodes WHERE company_id=p_company
  UNION SELECT left_lead_id FROM public.crm_lead_identity_edges WHERE company_id=p_company
  UNION SELECT right_lead_id FROM public.crm_lead_identity_edges WHERE company_id=p_company
 ), limited AS(SELECT id FROM ids ORDER BY id LIMIT 5001), rows AS(
  SELECT x.id,l.company_id,l.customer_id,to_jsonb(l) lj,to_jsonb(c) cj,
   coalesce(n.generation,0) generation,coalesce(n.review_required,false) review_required,
   (l.id IS NOT NULL AND l.type IN('lead','deal') AND (l.customer_id IS NULL OR c.id IS NOT NULL)) available
  FROM limited x LEFT JOIN public.crm_leads l ON l.id=x.id AND l.company_id=p_company
  LEFT JOIN public.customers c ON c.id=l.customer_id AND c.company_id=p_company
  LEFT JOIN public.crm_lead_identity_nodes n ON n.company_id=p_company AND n.lead_id=x.id
 ), members AS(
  SELECT id,jsonb_build_object('leadId',id,'companyId',p_company,'available',coalesce(available,false),'generation',generation,'reviewRequired',review_required,
   'title',CASE WHEN available THEN lj->>'title' ELSE NULL END,
   'contacts',CASE WHEN available THEN jsonb_build_object('leadPhone',lj->'phone','leadEmail',lj->'email','customerPhone',cj->'phone','customerEmail',cj->'email') ELSE '{}'::jsonb END,
   'contextVersion',CASE WHEN available THEN md5(jsonb_build_object('lead',id,'company',company_id,'customer',customer_id,
    'phone',lj->'phone','email',lj->'email','name',cj->'full_name','customerPhone',cj->'phone','customerEmail',cj->'email','generation',generation)::text) ELSE NULL END,
   'foreignHistory',EXISTS(SELECT 1 FROM public.crm_lead_identity_edges e WHERE e.company_id<>p_company AND e.active AND(e.left_lead_id=id OR e.right_lead_id=id))) value FROM rows
 )
 SELECT jsonb_build_object('companyId',p_company,'policy','CRM_EXACT_CONTACT_REVIEW_V1','complete',(SELECT count(*)<=5000 FROM limited),'members',coalesce((SELECT jsonb_agg(value ORDER BY id) FROM members),'[]'::jsonb),
  'graphRevision',coalesce((SELECT revision FROM public.crm_lead_identity_scopes WHERE company_id=p_company),0),
  'edges',coalesce((SELECT jsonb_agg(jsonb_build_object('leftLeadId',left_lead_id,'rightLeadId',right_lead_id,'active',active,'revision',revision,'leftContext',left_context,'rightContext',right_context,'evidenceId',evidence_id) ORDER BY left_lead_id,right_lead_id) FROM public.crm_lead_identity_edges WHERE company_id=p_company),'[]'::jsonb),
  'distinctions',coalesce((SELECT jsonb_agg(jsonb_build_object('leftLeadId',left_lead_id,'rightLeadId',right_lead_id,'active',active,'revision',revision,'leftContext',left_context,'rightContext',right_context,'evidenceId',evidence_id) ORDER BY left_lead_id,right_lead_id) FROM public.crm_identity_distinctions WHERE company_id=p_company),'[]'::jsonb)) INTO result;

 RETURN result||jsonb_build_object('snapshotToken',md5(result::text),'asOf',statement_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.marketing_trial_quality_context(jsonb,jsonb,jsonb,jsonb,jsonb,boolean,jsonb),public.marketing_trial_identity_inventory(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_lead_trial_snapshot(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.crm_identity_review_admin(p_actor,p_company);
 -- All business inputs below are read by ONE SQL statement. Stable helpers
 -- retain that statement's MVCC snapshot, even during concurrent legacy writes.
 WITH trial AS(SELECT * FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company),
 leads AS(SELECT * FROM public.crm_leads WHERE company_id=p_company ORDER BY id LIMIT 5001),
 sources AS(SELECT * FROM public.crm_lead_source_evidence WHERE company_id=p_company ORDER BY id LIMIT 5001),
 receipts AS(SELECT * FROM public.marketing_fb_lead_receipts WHERE company_id=p_company ORDER BY id LIMIT 5001),
 identity AS(SELECT public.marketing_trial_identity_inventory(p_company) value),
 quality AS(
  SELECT l.id,to_jsonb(l) lj,coalesce(to_jsonb(c),'{}'::jsonb) cj,
   to_jsonb(r) rj,to_jsonb(u) uj,to_jsonb(co) company,
   EXISTS(SELECT 1 FROM public.user_company_regions WHERE user_id=l.assigned_to AND region_id=l.region_id) membership,
   (SELECT jsonb_object_agg(v.entity||':'||v.entity_id::text,v.revision) FROM public.crm_lead_quality_source_versions v
    WHERE (v.entity,v.entity_id) IN(('crm_leads',l.id),('customers',l.customer_id),('company_regions',l.region_id),('users',l.assigned_to))) versions,
   (SELECT to_jsonb(e) FROM public.crm_lead_quality_events e WHERE e.company_id=p_company AND e.lead_id=l.id ORDER BY revision DESC LIMIT 1) evidence
  FROM leads l LEFT JOIN public.customers c ON c.id=l.customer_id AND c.company_id=p_company
  LEFT JOIN public.company_regions r ON r.id=l.region_id AND r.company_id=p_company
  LEFT JOIN public.users u ON u.id=l.assigned_to AND u.company_id=p_company
  JOIN public.companies co ON co.id=p_company
 ), qualities AS(
  SELECT jsonb_build_object('leadId',id,'companyId',p_company,'regionId',lj->'region_id','ownerId',lj->'assigned_to',
   'firstKnownAt',(SELECT min(v::timestamptz) FROM (VALUES(lj->>'first_touch_time'),(lj->>'created_at'),(cj->>'created_at')) dates(v) WHERE v IS NOT NULL),
   'historyComplete',lj->>'created_at' IS NOT NULL AND(lj->>'customer_id' IS NULL OR cj->>'created_at' IS NOT NULL),
   'contextVersion',public.marketing_trial_quality_context(lj,cj,rj,uj,company,membership,versions),
   'routingReady',coalesce(membership AND rj->>'is_active'='true' AND uj->>'is_active'='true' AND uj->>'tenant_id' IS NOT DISTINCT FROM company->>'tenant_id',false),
   'evidence',CASE WHEN evidence IS NOT NULL THEN jsonb_build_object('id',evidence->'id','contextVersion',evidence->'context_version','status',evidence->'decision'->'status',
     'contactVerified',evidence->'decision'->'contactVerified','demandMatches',evidence->'decision'->'demandMatches','serviceAreaVerified',evidence->'decision'->'serviceAreaVerified',
     'recordedAt',evidence->'recorded_at','recordedBy',evidence->'actor_id') ELSE NULL END) value FROM quality
 )
 SELECT jsonb_build_object('companyId',p_company,'trial',to_jsonb(t),'asOf',clock_timestamp(),
  'complete',(SELECT count(*)<=5000 FROM leads) AND (SELECT count(*)<=5000 FROM sources) AND (SELECT count(*)<=5000 FROM receipts),
  'identity',(SELECT value FROM identity),
  'qualities',coalesce((SELECT jsonb_agg(value) FROM qualities),'[]'::jsonb),
  'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('ad_account_id',a.ad_account_id,'company_id',a.company_id,'bat',a.bat,'token_het_han',a.token_het_han)) FROM public.fb_ad_accounts a WHERE a.company_id=p_company OR a.ad_account_id=ANY(t.account_ids)),'[]'::jsonb),
  'runs',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT DISTINCT ON(ad_account_id) * FROM public.marketing_spend_sync_runs WHERE company_id=p_company AND ad_account_id=ANY(t.account_ids) ORDER BY ad_account_id,id DESC)x),'[]'::jsonb),
  'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'receiptId',s.receipt_id,'leadId',s.lead_id,'companyId',s.company_id,'provider',s.provider,'source',s.source_kind,'acquiredAt',s.acquired_at,'proof',s.proof)) FROM sources s),'[]'::jsonb),
  'receipts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'pageId',r.page_id,'formId',r.form_id,'leadgenId',r.leadgen_id,'state',r.state,'leadId',r.lead_id,'receivedAt',r.received_at,'failureCode',r.failure_code)) FROM receipts r),'[]'::jsonb),
  'providerReconciliation',jsonb_build_object('status','MISSING','reason','PROVIDER_CENSUS_NOT_CONNECTED'),
  'surveyCoverage','NOT_CONNECTED') INTO result FROM trial t;
 IF result IS NULL THEN RAISE EXCEPTION 'trial missing' USING ERRCODE='P0002';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.marketing_lead_trial_set(uuid,uuid,uuid,uuid,jsonb),public.marketing_lead_trial_list(uuid,uuid),public.marketing_lead_trial_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_lead_trial_set(uuid,uuid,uuid,uuid,jsonb),public.marketing_lead_trial_list(uuid,uuid),public.marketing_lead_trial_snapshot(uuid,uuid,uuid) TO service_role;
COMMIT;
