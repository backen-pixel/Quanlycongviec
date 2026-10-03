-- Declared business scope, never a provider-completeness or spending approval.
BEGIN;
CREATE SCHEMA IF NOT EXISTS marketing_measurement;
REVOKE ALL ON SCHEMA marketing_measurement FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS marketing_measurement.source_registry(
 trial_id uuid PRIMARY KEY REFERENCES public.marketing_lead_trials(id),company_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),trial_revision integer NOT NULL,inventory_version text NOT NULL,
 account_ids text[] NOT NULL,entries jsonb NOT NULL,source_reference text NOT NULL,source_date date NOT NULL,
 source_note text NOT NULL,declaration_digest text NOT NULL,recorded_by uuid NOT NULL,recorded_at timestamptz NOT NULL,
 CHECK(jsonb_typeof(entries)='array'),CHECK(inventory_version~'^[a-f0-9]{64}$'),CHECK(declaration_digest~'^[a-f0-9]{64}$'));
CREATE TABLE IF NOT EXISTS marketing_measurement.source_registry_events(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,company_id uuid NOT NULL,trial_id uuid NOT NULL,
 command jsonb NOT NULL,before_state jsonb,result jsonb NOT NULL,after_state jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE marketing_measurement.source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_measurement.source_registry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_measurement.source_registry,marketing_measurement.source_registry_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION marketing_measurement.source_actor_current(p_actor uuid,p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT u.is_active IS TRUE AND to_jsonb(c)->>'is_active'='true'
  AND(to_jsonb(c)->>'tenant_id' IS NULL OR EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=(to_jsonb(c)->>'tenant_id')::uuid AND t.is_active IS TRUE))
  AND(u.role::text='platform_admin' OR(u.company_id=p_company AND u.role::text IN('admin','sales_admin') AND to_jsonb(u)->>'tenant_id' IS NOT DISTINCT FROM to_jsonb(c)->>'tenant_id')
   OR(u.role::text IN('ecosystem_admin','admin') AND u.company_id IS NULL AND to_jsonb(u)->>'tenant_id' IS NOT NULL AND to_jsonb(u)->>'tenant_id'=to_jsonb(c)->>'tenant_id'))
  FROM public.users u JOIN public.companies c ON c.id=p_company WHERE u.id=p_actor),false)
$$;

CREATE OR REPLACE FUNCTION marketing_measurement.source_inventory(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH t AS(SELECT * FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company),
 accounts AS(SELECT a.* FROM public.fb_ad_accounts a WHERE a.company_id=p_company ORDER BY a.ad_account_id LIMIT 101),
 pages AS(SELECT p.* FROM public.facebook_pages p WHERE p.default_company_id=p_company ORDER BY p.page_id LIMIT 101),
 bindings AS(SELECT b.* FROM public.marketing_fb_lead_bindings b WHERE b.company_id=p_company ORDER BY b.page_id,b.form_id LIMIT 1001),
 forms AS(SELECT page_id,form_id FROM(
  SELECT page_id,form_id FROM bindings
  UNION SELECT page_id,form_id FROM public.marketing_fb_lead_receipts WHERE company_id=p_company
  UNION SELECT f.page_id,f.form_id FROM public.marketing_fb_census_forms f JOIN public.marketing_fb_census_runs r ON r.id=f.run_id WHERE r.company_id=p_company
 )k ORDER BY page_id,form_id LIMIT 1001),
 body AS(SELECT jsonb_build_object('trial',to_jsonb(t),
  'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ad_account_id,'active',bat,'expiresAt',token_het_han) ORDER BY ad_account_id) FROM accounts),'[]'::jsonb),
  'pages',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',page_id,'active',is_active) ORDER BY page_id) FROM pages),'[]'::jsonb),
  'knownForms',coalesce((SELECT jsonb_agg(jsonb_build_object('pageId',f.page_id,'formId',f.form_id,'accountId',b.config->>'accountId','bindingActive',coalesce(b.config->>'active'='true',false)) ORDER BY f.page_id,f.form_id) FROM forms f LEFT JOIN bindings b ON b.page_id=f.page_id AND b.form_id=f.form_id),'[]'::jsonb),
  'complete',(SELECT count(*)<=100 FROM accounts) AND(SELECT count(*)<=100 FROM pages) AND(SELECT count(*)<=1000 FROM bindings) AND(SELECT count(*)<=1000 FROM forms)) value,
  jsonb_build_object('pageCredentials',coalesce((SELECT jsonb_agg(jsonb_build_object('id',page_id,'tokenHash',md5(coalesce(access_token,''))) ORDER BY page_id) FROM pages),'[]'::jsonb),
   'accountCredentials',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ad_account_id,'tokenHash',md5(coalesce(access_token,''))) ORDER BY ad_account_id) FROM accounts),'[]'::jsonb),
   'bindings',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY page_id,form_id) FROM bindings b),'[]'::jsonb)) private_value FROM t)
 SELECT value||jsonb_build_object('version',encode(sha256(convert_to((value||private_value)::text,'UTF8')),'hex')) FROM body
$$;

CREATE OR REPLACE FUNCTION marketing_measurement.source_registry_projection(p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i jsonb;r marketing_measurement.source_registry%ROWTYPE;author_current boolean;gaps jsonb:='[]';x jsonb;k jsonb;result jsonb;
BEGIN
 i:=marketing_measurement.source_inventory(p_company,p_trial);
 IF i IS NULL THEN RETURN NULL; END IF;
 IF i->>'complete' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'source inventory too large' USING ERRCODE='54000';END IF;
 SELECT * INTO r FROM marketing_measurement.source_registry WHERE trial_id=p_trial AND company_id=p_company;
 IF ARRAY(SELECT jsonb_array_elements_text(i->'trial'->'account_ids') ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT v->>'id' FROM jsonb_array_elements(i->'accounts')v ORDER BY 1)
 THEN gaps:=gaps||jsonb_build_array(jsonb_build_object('code','TRIAL_ACCOUNT_ROSTER_CHANGED'));END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(i->'accounts') LOOP
  IF x->>'active' IS DISTINCT FROM 'true' OR(x->>'expiresAt' IS NOT NULL AND(x->>'expiresAt')::timestamptz<=statement_timestamp()) THEN gaps:=gaps||jsonb_build_array(jsonb_build_object('code','ACCOUNT_UNAVAILABLE','accountId',x->>'id'));END IF;
 END LOOP;
 IF r.trial_id IS NULL THEN
  RETURN jsonb_build_object('version',1,'companyId',p_company,'trialId',p_trial,'asOf',statement_timestamp(),'inventoryVersion',i->>'version','inventory',i-'version'-'complete',
   'status','MISSING','declaration',NULL,'gaps',gaps,'providerCoverage','UNVERIFIED','allowBudgetExecution',false);
 END IF;
 author_current:=marketing_measurement.source_actor_current(r.recorded_by,p_company);
 FOR x IN SELECT value FROM jsonb_array_elements(r.entries) LOOP
  IF x->>'kind'='META_LEAD_ADS' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(i->'knownForms')f WHERE f->>'pageId'=x->>'pageId' AND f->>'formId'=x->>'formId' AND f->>'accountId'=x->>'accountId' AND f->>'bindingActive'='true') THEN gaps:=gaps||jsonb_build_array(jsonb_build_object('code','FORM_ROUTING_UNVERIFIED','accountId',x->>'accountId','pageId',x->>'pageId','formId',x->>'formId'));END IF;
  ELSE gaps:=gaps||jsonb_build_array(jsonb_build_object('code',CASE WHEN x->>'kind'='UNRESOLVED_FORM' THEN 'FORM_ACCOUNT_UNRESOLVED' ELSE 'ENTRYPOINT_COVERAGE_UNVERIFIED' END,'accountId',x->>'accountId','kind',x->>'kind','pageId',x->>'pageId','formId',x->>'formId'));END IF;
  IF x->>'pageId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(i->'pages')p WHERE p->>'pageId'=x->>'pageId' AND p->>'active'='true') THEN gaps:=gaps||jsonb_build_array(jsonb_build_object('code','PAGE_UNAVAILABLE','pageId',x->>'pageId'));END IF;
 END LOOP;
 FOR k IN SELECT value FROM jsonb_array_elements(i->'knownForms') LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.entries)e WHERE e->>'pageId'=k->>'pageId' AND e->>'formId'=k->>'formId' AND(e->>'kind'='UNRESOLVED_FORM' OR(e->>'kind'='META_LEAD_ADS' AND(k->>'accountId' IS NULL OR e->>'accountId'=k->>'accountId')))) THEN gaps:=gaps||jsonb_build_array(jsonb_build_object('code','KNOWN_FORM_NOT_DECLARED','pageId',k->>'pageId','formId',k->>'formId'));END IF;
 END LOOP;
 result:=jsonb_build_object('version',1,'companyId',p_company,'trialId',p_trial,'asOf',statement_timestamp(),'inventoryVersion',i->>'version','inventory',i-'version'-'complete',
  'status',CASE WHEN NOT author_current THEN 'STALE_AUTHORITY' WHEN r.inventory_version<>i->>'version' OR r.trial_revision<>(i->'trial'->>'revision')::integer THEN 'STALE_CONFIGURATION' ELSE 'CURRENT' END,
  'declaration',jsonb_build_object('revision',r.revision,'trialRevision',r.trial_revision,'accountIds',r.account_ids,'entries',r.entries,'sourceReference',r.source_reference,'sourceDate',r.source_date,'sourceNote',r.source_note,
   'declarationDigest',r.declaration_digest,'recordedBy',r.recorded_by,'recordedAt',r.recorded_at),
  'gaps',gaps,'providerCoverage','UNVERIFIED','allowBudgetExecution',false);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_source_registry_read(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current authority required' USING ERRCODE='42501';END IF;
 SELECT marketing_measurement.source_registry_projection(p_company,p_trial) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 RETURN result||jsonb_build_object('actorId',p_actor);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_source_registry_set(p_actor uuid,p_company uuid,p_trial uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i jsonb;v text;t public.marketing_lead_trials%ROWTYPE;r marketing_measurement.source_registry%ROWTYPE;e marketing_measurement.source_registry_events%ROWTYPE;
 entries jsonb;x jsonb;k jsonb;source_day date;result jsonb;before_value jsonb;recorded timestamptz;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current authority required' USING ERRCODE='42501';END IF;
 IF p_trial IS NULL OR p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_command->'expectedRevision') IS DISTINCT FROM 'number' OR(p_command->>'expectedRevision'~'^(0|[1-9][0-9]{0,8})$') IS NOT TRUE
  OR(p_command->>'expectedInventoryVersion'~'^[a-f0-9]{64}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'sourceReference') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'sourceReference')) NOT BETWEEN 8 AND 500
  OR jsonb_typeof(p_command->'sourceNote') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'sourceNote')) NOT BETWEEN 20 AND 2000
  OR(p_command->>'sourceDate'~'^\d{4}-\d{2}-\d{2}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'entries') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command)k WHERE k NOT IN('expectedRevision','expectedInventoryVersion','sourceReference','sourceDate','sourceNote','entries'))
 THEN RAISE EXCEPTION 'invalid declaration' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(p_command->'entries') NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'invalid entry count' USING ERRCODE='22023';END IF;
 source_day:=(p_command->>'sourceDate')::date;
 IF source_day>(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN RAISE EXCEPTION 'future declaration evidence' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_command->'entries') LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR jsonb_typeof(x->'kind') IS DISTINCT FROM 'string' OR x->>'kind' NOT IN('META_LEAD_ADS','MESSENGER','WEBSITE','PHONE','OTHER','NO_LEAD_SOURCE','UNRESOLVED_FORM')
   OR EXISTS(SELECT 1 FROM jsonb_each(x)f WHERE f.key IN('accountId','pageId','formId') AND jsonb_typeof(f.value) NOT IN('string','null'))
   OR(x->>'kind'<>'UNRESOLVED_FORM' AND(x->>'accountId'~'^act_[0-9]{1,32}$') IS NOT TRUE) OR(x->>'kind'='UNRESOLVED_FORM' AND x->>'accountId' IS NOT NULL)
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(x)k WHERE k NOT IN('accountId','kind','pageId','formId','destination')) THEN RAISE EXCEPTION 'invalid entry' USING ERRCODE='22023';END IF;
  IF x->>'kind'='UNRESOLVED_FORM' THEN
   IF(x->>'pageId'~'^[0-9]{1,32}$') IS NOT TRUE OR(x->>'formId'~'^[0-9]{1,32}$') IS NOT TRUE OR jsonb_typeof(x->'destination') IS DISTINCT FROM 'string' OR length(btrim(x->>'destination')) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'unresolved form needs reason' USING ERRCODE='22023';END IF;
  ELSIF x->>'kind' IN('META_LEAD_ADS','MESSENGER') THEN
   IF(x->>'pageId'~'^[0-9]{1,32}$') IS NOT TRUE OR x->>'destination' IS NOT NULL OR(x->>'kind'='META_LEAD_ADS' AND(x->>'formId'~'^[0-9]{1,32}$') IS NOT TRUE) OR(x->>'kind'='MESSENGER' AND x->>'formId' IS NOT NULL) THEN RAISE EXCEPTION 'invalid Page entry' USING ERRCODE='22023';END IF;
  ELSIF x->>'pageId' IS NOT NULL OR x->>'formId' IS NOT NULL OR jsonb_typeof(x->'destination') IS DISTINCT FROM 'string' OR length(btrim(x->>'destination')) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'destination required' USING ERRCODE='22023';END IF;
 END LOOP;
 SELECT jsonb_agg(v ORDER BY v::text) INTO entries FROM(SELECT jsonb_build_object('accountId',x->>'accountId','kind',x->>'kind','pageId',x->>'pageId','formId',x->>'formId','destination',CASE WHEN x->>'destination' IS NOT NULL THEN btrim(x->>'destination') ELSE NULL END)v FROM jsonb_array_elements(p_command->'entries')x)s;
 IF jsonb_array_length(entries)<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(entries)) THEN RAISE EXCEPTION 'duplicate entries' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-source-request:'||p_request::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('marketing-source-trial:'||p_trial::text,0));
 SELECT * INTO t FROM public.marketing_lead_trials WHERE id=p_trial AND company_id=p_company FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'trial denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM marketing_measurement.source_registry_events WHERE request_id=p_request;
 IF FOUND THEN
  IF e.actor_id<>p_actor OR e.company_id<>p_company OR e.trial_id<>p_trial OR e.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN e.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO r FROM marketing_measurement.source_registry WHERE trial_id=p_trial FOR UPDATE;
 IF r.company_id IS NOT NULL AND r.company_id<>p_company THEN RAISE EXCEPTION 'registry denied' USING ERRCODE='42501';END IF;
 IF coalesce(r.revision,0)<>(p_command->>'expectedRevision')::integer THEN RAISE EXCEPTION 'declaration changed' USING ERRCODE='40001';END IF;
 before_value:=CASE WHEN r.trial_id IS NOT NULL THEN to_jsonb(r) ELSE NULL END;
 PERFORM 1 FROM public.fb_ad_accounts WHERE company_id=p_company ORDER BY ad_account_id FOR SHARE;
 PERFORM 1 FROM public.facebook_pages WHERE default_company_id=p_company ORDER BY page_id FOR SHARE;
 PERFORM 1 FROM public.marketing_fb_lead_bindings WHERE company_id=p_company ORDER BY page_id,form_id FOR SHARE;
 i:=marketing_measurement.source_inventory(p_company,p_trial);v:=i->>'version';
 IF i->>'complete' IS DISTINCT FROM 'true' OR v IS DISTINCT FROM p_command->>'expectedInventoryVersion' THEN RAISE EXCEPTION 'inventory changed' USING ERRCODE='40001';END IF;
 IF ARRAY(SELECT v->>'id' FROM jsonb_array_elements(i->'accounts')v ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT unnest(t.account_ids) ORDER BY 1)
  OR ARRAY(SELECT DISTINCT v->>'accountId' FROM jsonb_array_elements(entries)v WHERE v->>'accountId' IS NOT NULL ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT unnest(t.account_ids) ORDER BY 1) THEN RAISE EXCEPTION 'all trial accounts required' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(entries) LOOP
  IF x->>'kind'='UNRESOLVED_FORM' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(i->'knownForms')f WHERE f->>'pageId'=x->>'pageId' AND f->>'formId'=x->>'formId') THEN RAISE EXCEPTION 'unknown historical form' USING ERRCODE='22023';END IF;
  ELSE
   IF x->>'pageId' IS NOT NULL AND EXISTS(SELECT 1 FROM public.facebook_pages WHERE page_id=x->>'pageId' AND default_company_id IS DISTINCT FROM p_company) THEN RAISE EXCEPTION 'Page belongs outside scope' USING ERRCODE='42501';END IF;
   IF x->>'formId' IS NOT NULL AND EXISTS(SELECT 1 FROM public.marketing_fb_lead_bindings b WHERE b.page_id=x->>'pageId' AND b.form_id=x->>'formId' AND b.company_id<>p_company) THEN RAISE EXCEPTION 'form outside scope' USING ERRCODE='42501';END IF;
  END IF;
  IF x->>'kind'='NO_LEAD_SOURCE' AND(SELECT count(*) FROM jsonb_array_elements(entries)y WHERE y->>'accountId'=x->>'accountId')<>1 THEN RAISE EXCEPTION 'conflicting destinations' USING ERRCODE='22023';END IF;
 END LOOP;
 FOR k IN SELECT value FROM jsonb_array_elements(i->'knownForms') LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(entries)x WHERE x->>'pageId'=k->>'pageId' AND x->>'formId'=k->>'formId' AND(x->>'kind'='UNRESOLVED_FORM' OR(x->>'kind'='META_LEAD_ADS' AND(k->>'accountId' IS NULL OR x->>'accountId'=k->>'accountId')))) THEN RAISE EXCEPTION 'known form omitted' USING ERRCODE='22023';END IF;
 END LOOP;
 recorded:=clock_timestamp();
 INSERT INTO marketing_measurement.source_registry(trial_id,company_id,revision,trial_revision,inventory_version,account_ids,entries,source_reference,source_date,source_note,declaration_digest,recorded_by,recorded_at)
 VALUES(p_trial,p_company,coalesce(r.revision,0)+1,t.revision,v,t.account_ids,entries,btrim(p_command->>'sourceReference'),source_day,btrim(p_command->>'sourceNote'),
  encode(sha256(convert_to(jsonb_build_object('company',p_company,'trial',p_trial,'trialRevision',t.revision,'accounts',t.account_ids,'entries',entries,'sourceReference',btrim(p_command->>'sourceReference'),'sourceDate',source_day,'sourceNote',btrim(p_command->>'sourceNote'),'inventoryVersion',v)::text,'UTF8')),'hex'),p_actor,recorded)
 ON CONFLICT(trial_id) DO UPDATE SET revision=EXCLUDED.revision,trial_revision=EXCLUDED.trial_revision,inventory_version=EXCLUDED.inventory_version,account_ids=EXCLUDED.account_ids,entries=EXCLUDED.entries,
 source_reference=EXCLUDED.source_reference,source_date=EXCLUDED.source_date,source_note=EXCLUDED.source_note,declaration_digest=EXCLUDED.declaration_digest,recorded_by=EXCLUDED.recorded_by,recorded_at=EXCLUDED.recorded_at RETURNING * INTO r;
 result:=jsonb_build_object('companyId',p_company,'trialId',p_trial,'requestId',p_request,'revision',r.revision,'recordedAt',recorded,'declarationDigest',r.declaration_digest,'replayed',false,'purpose','DECLARED_BUSINESS_SCOPE','allowBudgetExecution',false);
 INSERT INTO marketing_measurement.source_registry_events(request_id,actor_id,company_id,trial_id,command,before_state,result,after_state) VALUES(p_request,p_actor,p_company,p_trial,p_command,before_value,result,to_jsonb(r));
 IF v IS DISTINCT FROM marketing_measurement.source_inventory(p_company,p_trial)->>'version' THEN RAISE EXCEPTION 'inventory changed during declaration' USING ERRCODE='40001';END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION marketing_measurement.source_actor_current(uuid,uuid),marketing_measurement.source_inventory(uuid,uuid),marketing_measurement.source_registry_projection(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.marketing_source_registry_read(uuid,uuid,uuid),public.marketing_source_registry_set(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_source_registry_read(uuid,uuid,uuid),public.marketing_source_registry_set(uuid,uuid,uuid,uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.marketing_lead_trial_snapshot(p_actor uuid,p_company uuid,p_trial uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current authority required' USING ERRCODE='42501';END IF;
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
  'providerReconciliation',public.marketing_trial_census_inventory(p_company,p_trial),
  'sourceRegistry',marketing_measurement.source_registry_projection(p_company,p_trial),
  'surveyCoverage','NOT_CONNECTED') INTO result FROM trial t;
 IF result IS NULL THEN RAISE EXCEPTION 'trial missing' USING ERRCODE='P0002';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.marketing_lead_trial_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_lead_trial_snapshot(uuid,uuid,uuid) TO service_role;

COMMIT;
