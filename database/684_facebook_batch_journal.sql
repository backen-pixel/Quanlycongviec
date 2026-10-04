-- Durable observation and one-shot dispatch for the legacy batch creator.
-- An UNKNOWN item keeps its contact claim. No lease expiry or automatic retry.
BEGIN;
CREATE SCHEMA IF NOT EXISTS crm_batch_control;
REVOKE ALL ON SCHEMA crm_batch_control FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS crm_batch_control.runs(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,company_id uuid NOT NULL,contact_ids uuid[] NOT NULL,
 token_hash text NOT NULL,state text NOT NULL CHECK(state IN('RUNNING','COMPLETED','REVIEW')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS crm_batch_control.items(
 request_id uuid NOT NULL,contact_id uuid NOT NULL,ordinal integer NOT NULL,
 state text NOT NULL CHECK(state IN('PENDING','RUNNING','LINKED','SKIPPED','UNKNOWN','CANCELLED')),
 result jsonb,PRIMARY KEY(request_id,contact_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_batch_contact_claim ON crm_batch_control.items(contact_id)
 WHERE state IN('PENDING','RUNNING','UNKNOWN');
ALTER TABLE crm_batch_control.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_batch_control.items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_batch_control.runs,crm_batch_control.items FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_batch_control.authorize(p_actor uuid,p_company uuid,p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.users%ROWTYPE;c public.companies%ROWTYPE;p public.facebook_pages%ROWTYPE;t jsonb;r record;l public.crm_leads%ROWTYPE;wide boolean;role_name text;
BEGIN
 SELECT * INTO a FROM public.users WHERE id=p_actor FOR SHARE;
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR SHARE;
 IF a.id IS NULL OR a.is_active IS DISTINCT FROM true OR c.id IS NULL OR c.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'batch scope denied' USING ERRCODE='42501';END IF;
 IF c.tenant_id IS NOT NULL THEN
  SELECT to_jsonb(x) INTO t FROM public.tenants x WHERE id=c.tenant_id FOR SHARE;
  IF t->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'batch tenant denied' USING ERRCODE='42501';END IF;
 END IF;
 role_name:=lower(btrim(coalesce(a.role::text,'')));
 IF role_name='' THEN RAISE EXCEPTION 'batch role denied' USING ERRCODE='42501';END IF;
 IF role_name='ecosystem_admin' OR (role_name='admin' AND a.company_id IS NULL) THEN
  IF a.tenant_id IS NULL OR a.tenant_id IS DISTINCT FROM c.tenant_id THEN RAISE EXCEPTION 'batch tenant denied' USING ERRCODE='42501';END IF;
 ELSIF role_name<>'platform_admin' AND (a.company_id IS DISTINCT FROM p_company OR a.tenant_id IS DISTINCT FROM c.tenant_id) THEN
  RAISE EXCEPTION 'batch company denied' USING ERRCODE='42501';
 END IF;
 wide:=role_name IN('admin','ecosystem_admin') OR (a.company_id IS NOT NULL AND role_name IN('sales_admin','crm_production_admin'));
 IF cardinality(p_ids)<>(SELECT count(*) FROM public.facebook_contacts WHERE id=ANY(p_ids)) THEN RAISE EXCEPTION 'batch contacts unavailable' USING ERRCODE='42501';END IF;
 FOR r IN SELECT * FROM public.facebook_contacts WHERE id=ANY(p_ids) ORDER BY id FOR SHARE LOOP
  SELECT * INTO p FROM public.facebook_pages WHERE page_id=r.page_id FOR SHARE;
  IF p.page_id IS NULL OR p.default_company_id IS DISTINCT FROM p_company THEN RAISE EXCEPTION 'batch page scope changed' USING ERRCODE='42501';END IF;
  IF NOT wide THEN
   PERFORM 1 FROM public.user_company_regions m JOIN public.company_regions g ON g.id=m.region_id
    WHERE m.user_id=p_actor AND m.region_id=p.default_region_id AND g.company_id=p_company AND g.is_active IS TRUE FOR SHARE OF m,g;
   IF NOT FOUND OR (role_name NOT IN('region_admin','accounting','superadmin','super_admin','administrator') AND coalesce(p.default_lead_owner_id,p.created_by) IS DISTINCT FROM p_actor) THEN
    RAISE EXCEPTION 'batch assignment denied' USING ERRCODE='42501';END IF;
  END IF;
  IF r.lead_id IS NOT NULL THEN
   SELECT * INTO l FROM public.crm_leads WHERE id=r.lead_id FOR SHARE;
   IF l.id IS NULL OR l.company_id IS DISTINCT FROM p_company OR (NOT wide AND (l.region_id IS DISTINCT FROM p.default_region_id
    OR (role_name<>'region_admin' AND l.assigned_to IS DISTINCT FROM p_actor AND l.lead_owner_id IS DISTINCT FROM p_actor))) THEN
    RAISE EXCEPTION 'batch target denied' USING ERRCODE='42501';END IF;
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION crm_batch_control.view_run(p_request uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('policy','FACEBOOK_BATCH_JOURNAL_V1','requestId',r.request_id,'companyId',r.company_id,'actorId',r.actor_id,
  'state',r.state,'createdAt',r.created_at,'updatedAt',r.updated_at,'items',
  (SELECT jsonb_agg(jsonb_build_object('contactId',i.contact_id,'state',i.state,'result',i.result) ORDER BY i.ordinal)
   FROM crm_batch_control.items i WHERE i.request_id=r.request_id)) FROM crm_batch_control.runs r WHERE r.request_id=p_request
$$;

CREATE OR REPLACE FUNCTION crm_batch_control.authorize_history(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_batch_control.runs%ROWTYPE;a public.users%ROWTYPE;i record;l public.crm_leads%ROWTYPE;p public.facebook_pages%ROWTYPE;wide boolean;role_name text;
BEGIN
 SELECT * INTO r FROM crm_batch_control.runs WHERE request_id=p_request;
 SELECT * INTO a FROM public.users WHERE id=r.actor_id FOR SHARE;
 role_name:=lower(btrim(coalesce(a.role::text,'')));
 wide:=role_name IN('admin','ecosystem_admin') OR(a.company_id IS NOT NULL AND role_name IN('sales_admin','crm_production_admin'));
 FOR i IN SELECT contact_id,result FROM crm_batch_control.items WHERE request_id=p_request AND state='LINKED' LOOP
  SELECT * INTO l FROM public.crm_leads WHERE id::text=i.result->>'lead_id' FOR SHARE;
  SELECT p0.* INTO p FROM public.facebook_contacts f JOIN public.facebook_pages p0 ON p0.page_id=f.page_id WHERE f.id=i.contact_id FOR SHARE OF f,p0;
  IF l.id IS NULL OR l.company_id IS DISTINCT FROM r.company_id OR (NOT wide AND (l.region_id IS DISTINCT FROM p.default_region_id
   OR(role_name<>'region_admin' AND l.assigned_to IS DISTINCT FROM a.id AND l.lead_owner_id IS DISTINCT FROM a.id))) THEN
   RAISE EXCEPTION 'batch historical target denied' USING ERRCODE='42501';END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.crm_facebook_batch_begin(p_actor uuid,p_company uuid,p_request uuid,p_ids uuid[],p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $$
DECLARE r crm_batch_control.runs%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_token IS NULL OR p_actor IS NULL OR p_company IS NULL OR coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 500
  OR array_ndims(p_ids) IS DISTINCT FROM 1 OR array_position(p_ids,NULL) IS NOT NULL
  OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids)x) THEN RAISE EXCEPTION 'invalid batch request' USING ERRCODE='22023';END IF;
 PERFORM crm_batch_control.authorize(p_actor,p_company,p_ids);
 PERFORM pg_advisory_xact_lock(hashtextextended('fb-batch-request:'||p_request::text,0));
 SELECT * INTO r FROM crm_batch_control.runs WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF r.actor_id<>p_actor OR r.company_id<>p_company OR r.contact_ids<>p_ids THEN RAISE EXCEPTION 'batch request reused' USING ERRCODE='23505';END IF;
  PERFORM crm_batch_control.authorize_history(p_request);
  RETURN jsonb_build_object('execute',false,'run',crm_batch_control.view_run(p_request));
 END IF;
 INSERT INTO crm_batch_control.runs VALUES(p_request,p_actor,p_company,p_ids,md5(p_token::text),'RUNNING',clock_timestamp(),clock_timestamp());
 INSERT INTO crm_batch_control.items(request_id,contact_id,ordinal,state) SELECT p_request,x,n,'PENDING' FROM unnest(p_ids) WITH ORDINALITY a(x,n);
 RETURN jsonb_build_object('execute',true,'run',crm_batch_control.view_run(p_request));
END $$;

CREATE OR REPLACE FUNCTION public.crm_facebook_batch_read(p_actor uuid,p_company uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $$
DECLARE r crm_batch_control.runs%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM crm_batch_control.runs WHERE request_id=p_request FOR SHARE;
 IF r.request_id IS NULL OR r.actor_id IS DISTINCT FROM p_actor OR r.company_id IS DISTINCT FROM p_company THEN RAISE EXCEPTION 'batch unavailable' USING ERRCODE='42501';END IF;
 PERFORM crm_batch_control.authorize(p_actor,p_company,r.contact_ids);
 PERFORM crm_batch_control.authorize_history(p_request);
 RETURN crm_batch_control.view_run(p_request);
END $$;

CREATE OR REPLACE FUNCTION public.crm_facebook_batch_step(p_request uuid,p_token uuid,p_contact uuid,p_action text,p_result jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $$
DECLARE r crm_batch_control.runs%ROWTYPE;i crm_batch_control.items%ROWTYPE;target_state text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM crm_batch_control.runs WHERE request_id=p_request FOR UPDATE;
 IF r.request_id IS NULL OR p_token IS NULL OR r.token_hash IS DISTINCT FROM md5(p_token::text) THEN RAISE EXCEPTION 'batch capability denied' USING ERRCODE='42501';END IF;
 IF p_action IN('STOP','FINISH') THEN
  IF p_contact IS NOT NULL OR p_result IS NOT NULL THEN RAISE EXCEPTION 'invalid batch close' USING ERRCODE='22023';END IF;
  IF p_action='STOP' THEN
   UPDATE crm_batch_control.items SET state='UNKNOWN',result=NULL WHERE request_id=p_request AND state='RUNNING';
   UPDATE crm_batch_control.items SET state='CANCELLED' WHERE request_id=p_request AND state='PENDING';
  ELSIF EXISTS(SELECT 1 FROM crm_batch_control.items WHERE request_id=p_request AND state IN('PENDING','RUNNING')) THEN
   RAISE EXCEPTION 'batch not finished' USING ERRCODE='40001';
  END IF;
  UPDATE crm_batch_control.runs SET state=CASE WHEN EXISTS(SELECT 1 FROM crm_batch_control.items WHERE request_id=p_request AND state IN('UNKNOWN','CANCELLED')) THEN 'REVIEW' ELSE 'COMPLETED' END,updated_at=clock_timestamp() WHERE request_id=p_request;
  RETURN true;
 END IF;
 SELECT * INTO i FROM crm_batch_control.items WHERE request_id=p_request AND contact_id=p_contact FOR UPDATE;
 IF i.contact_id IS NULL THEN RAISE EXCEPTION 'batch item unavailable' USING ERRCODE='42501';END IF;
 IF p_action IN('START','CHECK') THEN
  IF p_result IS NOT NULL OR r.state<>'RUNNING' OR i.state<>CASE WHEN p_action='START' THEN 'PENDING' ELSE 'RUNNING' END THEN RAISE EXCEPTION 'batch not executable' USING ERRCODE='40001';END IF;
  PERFORM crm_batch_control.authorize(r.actor_id,r.company_id,ARRAY[p_contact]);
  IF p_action='START' THEN
   IF EXISTS(SELECT 1 FROM crm_batch_control.items WHERE request_id=p_request AND (state='RUNNING' OR (ordinal<i.ordinal AND state NOT IN('LINKED','SKIPPED')))) THEN RAISE EXCEPTION 'batch item in flight' USING ERRCODE='40001';END IF;
   UPDATE crm_batch_control.items SET state='RUNNING' WHERE request_id=p_request AND contact_id=p_contact;
  END IF;
 ELSIF p_action='RESULT' THEN
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR p_result->>'contact_id' IS DISTINCT FROM p_contact::text
   OR p_result->>'status' IS NULL OR p_result->>'status' NOT IN('linked','skipped')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_result)k WHERE k NOT IN('contact_id','status','lead_id','reason')) THEN RAISE EXCEPTION 'invalid batch result' USING ERRCODE='22023';END IF;
  target_state:=CASE WHEN p_result->>'status'='linked' THEN 'LINKED' ELSE 'SKIPPED' END;
  -- Re-sending a confirmed result only records that same result; never re-dispatch.
  IF i.state=target_state AND i.result=p_result THEN RETURN true;END IF;
  IF r.state<>'RUNNING' OR i.state<>'RUNNING' THEN RAISE EXCEPTION 'batch result uncertain' USING ERRCODE='40001';END IF;
  IF target_state='LINKED' AND NOT EXISTS(SELECT 1 FROM public.facebook_contacts f JOIN public.crm_leads l ON l.id=f.lead_id
   WHERE f.id=p_contact AND f.lead_id::text=p_result->>'lead_id' AND l.company_id=r.company_id) THEN RAISE EXCEPTION 'batch link unconfirmed' USING ERRCODE='40001';END IF;
  IF target_state='SKIPPED' AND (p_result->>'reason' IN('MANUAL_TRIGGER','SYNC_PAUSED','PHONE_REQUIRED','MESSAGE_THRESHOLD')) IS NOT TRUE THEN RAISE EXCEPTION 'invalid skip reason' USING ERRCODE='22023';END IF;
  UPDATE crm_batch_control.items SET state=target_state,result=p_result WHERE request_id=p_request AND contact_id=p_contact;
  -- The last confirmed result closes the run atomically; a lost FINISH cannot
  -- strand known results. UNKNOWN/CANCELLED are never released by this path.
  IF NOT EXISTS(SELECT 1 FROM crm_batch_control.items WHERE request_id=p_request AND state NOT IN('LINKED','SKIPPED')) THEN
   UPDATE crm_batch_control.runs SET state='COMPLETED' WHERE request_id=p_request;
  END IF;
 ELSE RAISE EXCEPTION 'invalid batch action' USING ERRCODE='22023';END IF;
 UPDATE crm_batch_control.runs SET updated_at=clock_timestamp() WHERE request_id=p_request;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.crm_facebook_batch_list(p_actor uuid,p_company uuid,p_before uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $$
DECLARE cutoff timestamptz;rows jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 PERFORM crm_batch_control.authorize(p_actor,p_company,'{}'::uuid[]);
 IF p_before IS NOT NULL THEN
  SELECT created_at INTO cutoff FROM crm_batch_control.runs WHERE request_id=p_before AND actor_id=p_actor AND company_id=p_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid batch cursor' USING ERRCODE='22023';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'state',state,'createdAt',created_at) ORDER BY created_at DESC,request_id DESC),'[]')
 INTO rows FROM(SELECT request_id,state,created_at FROM crm_batch_control.runs WHERE actor_id=p_actor AND company_id=p_company
  AND(p_before IS NULL OR (created_at,request_id)<(cutoff,p_before)) ORDER BY created_at DESC,request_id DESC LIMIT 21)s;
 RETURN jsonb_build_object('runs',CASE WHEN jsonb_array_length(rows)>20 THEN rows-20 ELSE rows END,
  'nextCursor',CASE WHEN jsonb_array_length(rows)>20 THEN rows->19->>'requestId' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION crm_batch_control.authorize(uuid,uuid,uuid[]),crm_batch_control.view_run(uuid),crm_batch_control.authorize_history(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_facebook_batch_begin(uuid,uuid,uuid,uuid[],uuid),public.crm_facebook_batch_read(uuid,uuid,uuid),public.crm_facebook_batch_step(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_facebook_batch_begin(uuid,uuid,uuid,uuid[],uuid),public.crm_facebook_batch_read(uuid,uuid,uuid),public.crm_facebook_batch_step(uuid,uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.crm_facebook_batch_list(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_facebook_batch_list(uuid,uuid,uuid) TO service_role;
COMMIT;
