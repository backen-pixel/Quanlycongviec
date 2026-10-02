-- Default-off Lead Ads intake. No production configuration/backfill is inserted.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_fb_lead_bindings(
 page_id text NOT NULL,form_id text NOT NULL,company_id uuid NOT NULL,revision integer NOT NULL,
 config jsonb NOT NULL,approved_by uuid NOT NULL,PRIMARY KEY(page_id,form_id));
CREATE TABLE IF NOT EXISTS public.marketing_fb_lead_binding_events(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,company_id uuid NOT NULL,command jsonb NOT NULL,
 result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS public.marketing_fb_lead_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),page_id text NOT NULL,form_id text NOT NULL,leadgen_id text NOT NULL,
 company_id uuid NOT NULL,binding_revision integer,delivery_hash text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','LEASED','DONE','REVIEW')),
 attempts integer NOT NULL DEFAULT 0,lease_token uuid,lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 failure_code text,lead_id uuid,customer_id uuid,completed_at timestamptz,
 UNIQUE(page_id,leadgen_id));
CREATE INDEX IF NOT EXISTS marketing_fb_lead_pending ON public.marketing_fb_lead_receipts(page_id,next_attempt_at) WHERE state IN ('PENDING','LEASED');
CREATE TABLE IF NOT EXISTS public.crm_lead_source_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),receipt_id uuid NOT NULL UNIQUE,company_id uuid NOT NULL,
 lead_id uuid NOT NULL,customer_id uuid NOT NULL,provider text NOT NULL,source_kind text NOT NULL,
 acquired_at timestamptz NOT NULL,proof jsonb NOT NULL,routing jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
-- No cascading entity FK: retries after legacy deletion must not create customers again.
ALTER TABLE public.marketing_fb_lead_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_fb_lead_binding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_fb_lead_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_source_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_fb_lead_bindings,public.marketing_fb_lead_binding_events,public.marketing_fb_lead_receipts,public.crm_lead_source_evidence FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_fb_intake_admin(p_actor uuid,p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users%ROWTYPE;c public.companies%ROWTYPE;t jsonb;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_actor FOR SHARE;
 IF NOT FOUND OR u.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'actor denied' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR SHARE;
 IF NOT FOUND OR to_jsonb(c)->>'is_active'='false' THEN RAISE EXCEPTION 'company denied' USING ERRCODE='42501';END IF;
 IF to_jsonb(c)->>'tenant_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO t FROM public.tenants x WHERE id=(to_jsonb(c)->>'tenant_id')::uuid FOR SHARE;
  IF NOT FOUND OR t->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'tenant denied' USING ERRCODE='42501';END IF;
 END IF;
 IF (u.role::text='platform_admin' OR
  (u.company_id=p_company AND u.role::text IN ('admin','sales_admin') AND to_jsonb(u)->>'tenant_id' IS NOT DISTINCT FROM to_jsonb(c)->>'tenant_id') OR
  (u.role::text IN ('ecosystem_admin','admin') AND u.company_id IS NULL AND to_jsonb(u)->>'tenant_id' IS NOT NULL AND to_jsonb(u)->>'tenant_id'=to_jsonb(c)->>'tenant_id')) IS NOT TRUE
 THEN RAISE EXCEPTION 'intake administration denied' USING ERRCODE='42501';END IF;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_binding_set(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b public.marketing_fb_lead_bindings%ROWTYPE;e public.marketing_fb_lead_binding_events%ROWTYPE;result jsonb;page public.facebook_pages%ROWTYPE;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR (p_command->>'pageId' ~ '^[0-9]{1,32}$') IS NOT TRUE OR (p_command->>'formId' ~ '^[0-9]{1,32}$') IS NOT TRUE
  OR (p_command->>'accountId' ~ '^act_[0-9]{1,32}$') IS NOT TRUE
  OR (p_command->>'expectedRevision' ~ '^(0|[1-9][0-9]*)$') IS NOT TRUE
  OR jsonb_typeof(p_command->'active') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(p_command->'approvalReference') IS DISTINCT FROM 'string' OR length(p_command->>'approvalReference') NOT BETWEEN 20 AND 2000
  OR jsonb_typeof(p_command->'fieldMap') IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('pageId','formId','accountId','expectedRevision','active','approvalReference','fieldMap','regionId','ownerId','pipelineId','stageId','sourceId','leadTypeId'))
  THEN RAISE EXCEPTION 'invalid binding' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_command->'fieldMap') x WHERE x.key NOT IN ('name','phone','email','request') OR jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}') NOT BETWEEN 1 AND 200)
  OR NOT ((p_command->'fieldMap')?'phone' OR (p_command->'fieldMap')?'email') THEN RAISE EXCEPTION 'invalid field map' USING ERRCODE='22023';END IF;
 -- Validate identifiers before persisting; current dependencies are rechecked by worker context.
 PERFORM (p_command->>'regionId')::uuid,(p_command->>'ownerId')::uuid,(p_command->>'pipelineId')::uuid,(p_command->>'stageId')::uuid,(p_command->>'sourceId')::uuid,(p_command->>'leadTypeId')::uuid;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['regionId','ownerId','pipelineId','stageId','sourceId','leadTypeId']) k WHERE p_command->>k IS NULL) THEN RAISE EXCEPTION 'missing routing' USING ERRCODE='22023';END IF;
 SELECT * INTO page FROM public.facebook_pages WHERE page_id=p_command->>'pageId' FOR SHARE;
 IF NOT FOUND OR page.default_company_id IS DISTINCT FROM p_company OR page.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'page denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fb-binding:'||(p_command->>'pageId')||':'||(p_command->>'formId'),0));
 SELECT * INTO e FROM public.marketing_fb_lead_binding_events WHERE request_id=p_request;
 IF FOUND THEN IF e.actor_id IS DISTINCT FROM p_actor OR e.company_id IS DISTINCT FROM p_company OR e.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;RETURN e.result;END IF;
 SELECT * INTO b FROM public.marketing_fb_lead_bindings WHERE page_id=p_command->>'pageId' AND form_id=p_command->>'formId' FOR UPDATE;
 IF b.company_id IS NOT NULL AND b.company_id<>p_company THEN RAISE EXCEPTION 'binding cannot transfer company' USING ERRCODE='42501';END IF;
 IF coalesce(b.revision,0)<>(p_command->>'expectedRevision')::integer THEN RAISE EXCEPTION 'binding changed' USING ERRCODE='40001';END IF;
 INSERT INTO public.marketing_fb_lead_bindings(page_id,form_id,company_id,revision,config,approved_by)
 VALUES(p_command->>'pageId',p_command->>'formId',p_company,coalesce(b.revision,0)+1,p_command-'expectedRevision',p_actor)
 ON CONFLICT(page_id,form_id) DO UPDATE SET revision=excluded.revision,config=excluded.config,approved_by=excluded.approved_by RETURNING * INTO b;
 result:=jsonb_build_object('pageId',b.page_id,'formId',b.form_id,'revision',b.revision,'active',b.config->'active');
 INSERT INTO public.marketing_fb_lead_binding_events VALUES(p_request,p_actor,p_company,p_command,result,clock_timestamp());
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_enqueue(p_events jsonb,p_delivery_hash text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb;page public.facebook_pages%ROWTYPE;b public.marketing_fb_lead_bindings%ROWTYPE;r public.marketing_fb_lead_receipts%ROWTYPE;n integer:=0;
BEGIN
 IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 100 OR (p_delivery_hash~'^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid receipt' USING ERRCODE='22023';END IF;
 -- Stable order for mixed batch/repeated delivery concurrency.
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) ORDER BY value->>'pageId',value->>'leadgenId' LOOP
  IF (e->>'pageId'~'^[0-9]{1,32}$') IS NOT TRUE OR (e->>'formId'~'^[0-9]{1,32}$') IS NOT TRUE OR (e->>'leadgenId'~'^[0-9]{1,32}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid receipt' USING ERRCODE='22023';END IF;
  SELECT * INTO page FROM public.facebook_pages WHERE page_id=e->>'pageId' FOR SHARE;
  IF NOT FOUND OR page.default_company_id IS NULL OR page.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'page unavailable' USING ERRCODE='42501';END IF;
  SELECT * INTO b FROM public.marketing_fb_lead_bindings WHERE page_id=e->>'pageId' AND form_id=e->>'formId' FOR SHARE;
  INSERT INTO public.marketing_fb_lead_receipts(page_id,form_id,leadgen_id,company_id,binding_revision,delivery_hash)
   VALUES(e->>'pageId',e->>'formId',e->>'leadgenId',page.default_company_id,b.revision,p_delivery_hash) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.marketing_fb_lead_receipts WHERE page_id=e->>'pageId' AND leadgen_id=e->>'leadgenId' FOR UPDATE;
  IF r.form_id<>e->>'formId' OR r.company_id<>page.default_company_id THEN
   UPDATE public.marketing_fb_lead_receipts SET state='REVIEW',failure_code='ENVELOPE_SCOPE_CONFLICT',lease_token=NULL,lease_until=NULL WHERE id=r.id;
  END IF;
  n:=n+1;
 END LOOP;RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_claim(p_pages text[],p_token uuid)
RETURNS SETOF public.marketing_fb_lead_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_token IS NULL OR coalesce(cardinality(p_pages),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid lease' USING ERRCODE='22023';END IF;
 RETURN QUERY WITH picked AS(SELECT id FROM public.marketing_fb_lead_receipts
  WHERE page_id=ANY(p_pages) AND ((state='PENDING' AND next_attempt_at<=clock_timestamp()) OR (state='LEASED' AND lease_until<=clock_timestamp()))
  ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
 UPDATE public.marketing_fb_lead_receipts r SET state='LEASED',lease_token=p_token,lease_until=clock_timestamp()+interval '120 seconds',attempts=attempts+1
 FROM picked WHERE r.id=picked.id RETURNING r.*;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_context(p_id uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.marketing_fb_lead_receipts%ROWTYPE;b public.marketing_fb_lead_bindings%ROWTYPE;page public.facebook_pages%ROWTYPE;
 account public.fb_ad_accounts%ROWTYPE;c public.companies%ROWTYPE;u public.users%ROWTYPE;rr jsonb;pipe jsonb;stage jsonb;src jsonb;kind jsonb;result jsonb;
BEGIN
 SELECT * INTO r FROM public.marketing_fb_lead_receipts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.state<>'LEASED' OR r.lease_token IS DISTINCT FROM p_token OR r.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'lease lost' USING ERRCODE='40001';END IF;
 SELECT * INTO b FROM public.marketing_fb_lead_bindings WHERE page_id=r.page_id AND form_id=r.form_id FOR SHARE;
 IF NOT FOUND OR b.company_id<>r.company_id OR b.revision IS DISTINCT FROM r.binding_revision OR b.config->>'active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'routing unresolved' USING ERRCODE='40001';END IF;
 PERFORM public.marketing_fb_intake_admin(b.approved_by,b.company_id);
 SELECT * INTO page FROM public.facebook_pages WHERE page_id=r.page_id FOR SHARE;
 IF NOT FOUND OR page.is_active IS DISTINCT FROM true OR page.default_company_id IS DISTINCT FROM r.company_id THEN RAISE EXCEPTION 'page revoked' USING ERRCODE='42501';END IF;
 SELECT * INTO account FROM public.fb_ad_accounts WHERE company_id=r.company_id AND ad_account_id=b.config->>'accountId' AND bat IS TRUE AND (token_het_han IS NULL OR token_het_han>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ad account revoked' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.companies WHERE id=r.company_id FOR SHARE;
 SELECT * INTO u FROM public.users WHERE id=(b.config->>'ownerId')::uuid FOR SHARE;
 IF NOT FOUND OR u.is_active IS DISTINCT FROM true OR u.company_id IS DISTINCT FROM r.company_id OR to_jsonb(u)->>'tenant_id' IS DISTINCT FROM to_jsonb(c)->>'tenant_id' THEN RAISE EXCEPTION 'receiver revoked' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO rr FROM public.company_regions x WHERE id=(b.config->>'regionId')::uuid AND company_id=r.company_id AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'region revoked' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.user_company_regions WHERE user_id=u.id AND region_id=(b.config->>'regionId')::uuid FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'receiver region revoked' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO pipe FROM public.crm_pipelines x WHERE id=(b.config->>'pipelineId')::uuid AND company_id=r.company_id AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND OR (pipe->>'region_id' IS NOT NULL AND pipe->>'region_id'<>b.config->>'regionId') THEN RAISE EXCEPTION 'pipeline revoked' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO stage FROM public.crm_pipeline_stages x WHERE id=(b.config->>'stageId')::uuid AND pipeline_id=(b.config->>'pipelineId')::uuid AND is_active IS TRUE AND pipeline_type='lead' AND coalesce(is_won,false)=false AND coalesce(is_lost,false)=false FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'stage revoked' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO src FROM public.crm_sources x WHERE id=(b.config->>'sourceId')::uuid AND company_id=r.company_id AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'source revoked' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO kind FROM public.crm_lead_types x WHERE id=(b.config->>'leadTypeId')::uuid AND company_id=r.company_id AND is_active IS TRUE AND applies_to IN ('lead','both') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'product revoked' USING ERRCODE='42501';END IF;
 result:=jsonb_build_object('companyId',r.company_id,'bindingRevision',b.revision,'routing',b.config,'approvedBy',b.approved_by,
  'fieldMap',b.config->'fieldMap','accountId',account.ad_account_id,'pageToken',page.access_token,'accountToken',account.access_token);
 IF r.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'lease expired while locking routing' USING ERRCODE='40001';END IF;
 RETURN result||jsonb_build_object('contextVersion',md5(result::text));
END $$;

CREATE OR REPLACE FUNCTION public.crm_accept_facebook_lead(p_id uuid,p_token uuid,p_context_version text,p_proof jsonb,p_contact jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.marketing_fb_lead_receipts%ROWTYPE;ctx jsonb;cfg jsonb;customer_uuid uuid:=gen_random_uuid();lead_uuid uuid:=gen_random_uuid();proof_uuid uuid;
BEGIN
 SELECT * INTO r FROM public.marketing_fb_lead_receipts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'receipt missing' USING ERRCODE='P0002';END IF;
 -- Completed receipts never create another Lead, even after legacy deletion.
 IF r.state='DONE' AND r.lease_token=p_token THEN RETURN jsonb_build_object('leadId',r.lead_id,'replayed',true);END IF;
 ctx:=public.marketing_fb_lead_context(p_id,p_token);cfg:=ctx->'routing';
 IF ctx->>'contextVersion' IS DISTINCT FROM p_context_version THEN RAISE EXCEPTION 'routing changed' USING ERRCODE='40001';END IF;
 IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object' OR p_proof->>'provider' IS DISTINCT FROM 'META_LEAD_ADS_V1'
  OR p_proof->>'pageId' IS DISTINCT FROM r.page_id OR p_proof->>'formId' IS DISTINCT FROM r.form_id OR p_proof->>'leadgenId' IS DISTINCT FROM r.leadgen_id
  OR (p_proof->>'source' IN ('PAID','ORGANIC','UNKNOWN')) IS NOT TRUE
  OR p_proof->>'acquiredAt' IS NULL OR (p_proof->>'acquiredAt')::timestamptz>clock_timestamp()+interval '5 minutes'
  OR p_proof->>'fetchedAt' IS NULL OR (p_proof->>'fetchedAt')::timestamptz<clock_timestamp()-interval '5 minutes' OR (p_proof->>'fetchedAt')::timestamptz>clock_timestamp()+interval '5 minutes'
  OR (p_proof->>'graphVersion'~'^v[0-9]{2,3}\.0$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid provider proof' USING ERRCODE='22023';END IF;
 IF p_proof->>'source'='PAID' THEN
  IF p_proof->>'accountId' IS DISTINCT FROM cfg->>'accountId' OR EXISTS(SELECT 1 FROM unnest(ARRAY['adId','adsetId','campaignId']) k WHERE (p_proof->>k~'^[0-9]{1,32}$') IS NOT TRUE) THEN RAISE EXCEPTION 'paid scope mismatch' USING ERRCODE='22023';END IF;
 ELSIF EXISTS(SELECT 1 FROM unnest(ARRAY['accountId','adId','adsetId','campaignId']) k WHERE p_proof->>k IS NOT NULL) THEN RAISE EXCEPTION 'unverified paid fields' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_contact) IS DISTINCT FROM 'object' OR jsonb_typeof(p_contact->'name') IS DISTINCT FROM 'string' OR length(p_contact->>'name') NOT BETWEEN 1 AND 200
  OR jsonb_typeof(p_contact->'phone') IS DISTINCT FROM 'string' OR length(p_contact->>'phone')>60
  OR jsonb_typeof(p_contact->'email') IS DISTINCT FROM 'string' OR length(p_contact->>'email')>254
  OR jsonb_typeof(p_contact->'request') IS DISTINCT FROM 'string' OR length(p_contact->>'request')>4000 THEN RAISE EXCEPTION 'invalid contact' USING ERRCODE='22023';END IF;
 -- Cutover: never guess that a legacy or partial import can safely be recreated.
 IF EXISTS(SELECT 1 FROM public.facebook_lead_ads WHERE leadgen_id=r.leadgen_id)
  OR EXISTS(SELECT 1 FROM public.facebook_contacts WHERE page_id=r.page_id AND psid='leadad_'||r.leadgen_id) THEN
  UPDATE public.marketing_fb_lead_receipts SET state='REVIEW',failure_code='LEGACY_RECONCILIATION_REQUIRED',lease_token=NULL,lease_until=NULL WHERE id=p_id;
  RETURN jsonb_build_object('status','REVIEW','reason','LEGACY_RECONCILIATION_REQUIRED');
 END IF;
 INSERT INTO public.customers(id,full_name,phone,email,company_id,assigned_to,source)
 VALUES(customer_uuid,p_contact->>'name',p_contact->>'phone',nullif(p_contact->>'email',''),r.company_id,(cfg->>'ownerId')::uuid,'Facebook');
 INSERT INTO public.crm_leads(id,code,title,type,customer_id,company_id,region_id,assigned_to,lead_owner_id,created_by,pipeline_id,stage_id,source_id,lead_type_id,description,first_touch_time)
 VALUES(lead_uuid,'LEAD-FB-'||replace(lead_uuid::text,'-',''),'[FB] '||(p_contact->>'name'),'lead',customer_uuid,r.company_id,(cfg->>'regionId')::uuid,(cfg->>'ownerId')::uuid,(cfg->>'ownerId')::uuid,(ctx->>'approvedBy')::uuid,(cfg->>'pipelineId')::uuid,(cfg->>'stageId')::uuid,(cfg->>'sourceId')::uuid,(cfg->>'leadTypeId')::uuid,p_contact->>'request',(p_proof->>'acquiredAt')::timestamptz);
 INSERT INTO public.crm_lead_source_evidence(receipt_id,company_id,lead_id,customer_id,provider,source_kind,acquired_at,proof,routing)
 VALUES(p_id,r.company_id,lead_uuid,customer_uuid,'META_LEAD_ADS_V1',p_proof->>'source',(p_proof->>'acquiredAt')::timestamptz,p_proof,jsonb_build_object('bindingRevision',r.binding_revision,'config',cfg,'approvedBy',ctx->>'approvedBy')) RETURNING id INTO proof_uuid;
 -- A trigger or FK lock may have waited after context validation. Roll back
 -- Customer/Lead/proof too if the lease expired while writing.
 IF r.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'lease expired while writing CRM' USING ERRCODE='40001';END IF;
 -- Audit/source and CRM data are committed together. No public raw/PII mirror or phone merge.
 UPDATE public.marketing_fb_lead_receipts SET state='DONE',lead_id=lead_uuid,customer_id=customer_uuid,completed_at=clock_timestamp(),lease_until=NULL,failure_code=NULL WHERE id=p_id;
 RETURN jsonb_build_object('status','DONE','leadId',lead_uuid,'sourceEvidenceId',proof_uuid,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_retry(p_id uuid,p_token uuid,p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (p_code~'^[A-Z_]{1,64}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid failure' USING ERRCODE='22023';END IF;
 UPDATE public.marketing_fb_lead_receipts SET state=CASE WHEN attempts>=10 THEN 'REVIEW' ELSE 'PENDING' END,
 failure_code=p_code,next_attempt_at=clock_timestamp()+least(300,15*attempts)*interval '1 second',lease_token=NULL,lease_until=NULL
 WHERE id=p_id AND state='LEASED' AND lease_token=p_token AND lease_until>clock_timestamp();
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_fb_lead_status(p_actor uuid,p_company uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE bindings jsonb;counts jsonb;pending jsonb;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 SELECT coalesce(jsonb_agg(jsonb_build_object('pageId',page_id,'formId',form_id,'revision',revision,'configuration',config) ORDER BY page_id,form_id),'[]'::jsonb)
 INTO bindings FROM public.marketing_fb_lead_bindings WHERE company_id=p_company;
 SELECT coalesce(jsonb_object_agg(state,n),'{}'::jsonb) INTO counts FROM(SELECT state,count(*) n FROM public.marketing_fb_lead_receipts WHERE company_id=p_company GROUP BY state)x;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO pending FROM(SELECT id,page_id,form_id,state,failure_code,attempts,received_at FROM public.marketing_fb_lead_receipts WHERE company_id=p_company AND state<>'DONE' ORDER BY received_at,id LIMIT 50)x;
 RETURN jsonb_build_object('bindings',bindings,'receiptCounts',counts,'oldestPending',pending,'uniquePaidCoverage','INCOMPLETE');
END $$;
REVOKE ALL ON FUNCTION public.marketing_fb_lead_status(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_fb_lead_status(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.marketing_fb_intake_admin(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.marketing_fb_lead_binding_set(uuid,uuid,uuid,jsonb),public.marketing_fb_lead_enqueue(jsonb,text),public.marketing_fb_lead_claim(text[],uuid),public.marketing_fb_lead_context(uuid,uuid),public.crm_accept_facebook_lead(uuid,uuid,text,jsonb,jsonb),public.marketing_fb_lead_retry(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_fb_lead_binding_set(uuid,uuid,uuid,jsonb),public.marketing_fb_lead_enqueue(jsonb,text),public.marketing_fb_lead_claim(text[],uuid),public.marketing_fb_lead_context(uuid,uuid),public.crm_accept_facebook_lead(uuid,uuid,text,jsonb,jsonb),public.marketing_fb_lead_retry(uuid,uuid,text) TO service_role;
COMMIT;
