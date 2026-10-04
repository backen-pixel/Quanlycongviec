-- Bounded, source-backed conversation drafts. No outbound grant or Agent enrollment.
-- Do not apply to a live database before the release package is approved.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_care_control.advisor_runs(
 request_id uuid PRIMARY KEY,company_id uuid NOT NULL,actor_id uuid NOT NULL,thread_id uuid NOT NULL,
 expected_version text NOT NULL,context_hash text NOT NULL,context jsonb NOT NULL,
 capability uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL CHECK(state IN('RUNNING','DRAFT','REVIEW','FAILED')),
 response jsonb,result jsonb,attempt integer NOT NULL DEFAULT 1 CHECK(attempt BETWEEN 1 AND 3),
 retry_of uuid UNIQUE REFERENCES crm_care_control.advisor_runs(request_id),retry_reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 completed_at timestamptz,
 UNIQUE(company_id,thread_id,context_hash,attempt)
);
ALTER TABLE crm_care_control.advisor_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.advisor_runs FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_care_control.advisor_authorize(p_actor uuid,p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read committed required' USING ERRCODE='0A000';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 -- The legacy helper accepts a NULL company activity flag; drafts require TRUE.
 PERFORM 1 FROM public.companies WHERE id=p_company AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'company unavailable' USING ERRCODE='42501';END IF;
END $$;

CREATE OR REPLACE FUNCTION crm_care_control.advisor_context(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE care jsonb;entry jsonb;entries jsonb:='[]';eid uuid;body jsonb;n integer:=0;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 care:=public.crm_care_read(p_actor,p_company,p_thread);
 IF care->>'mode' IS DISTINCT FROM 'WAITING' OR care->'target'->>'routingReady' IS DISTINCT FROM 'true'
  OR care->>'historyTruncated' IS DISTINCT FROM 'false' OR jsonb_array_length(care->'messages')=0
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(care->'messages') m WHERE m->>'direction'='inbound' AND length(btrim(m->>'content'))>0)
 THEN RAISE EXCEPTION 'conversation needs review' USING ERRCODE='42501';END IF;
 -- No silent truncation: a larger library/history requires retrieval/summary acceptance.
 FOR eid IN SELECT id FROM public.crm_care_library_entries
  WHERE company_id=p_company AND state='APPROVED'
   AND document->'channels' ? 'facebook' AND document->'regionIds' ? (care->'target'->>'regionId')
  ORDER BY id LIMIT 51 LOOP
  n:=n+1;
  IF n>50 THEN RAISE EXCEPTION 'library requires bounded retrieval' USING ERRCODE='22023';END IF;
  entry:=public.crm_care_library_read(p_actor,p_company,eid);
  IF entry->>'approvedReady'='true' AND entry->>'sourceReady'='true' THEN
   entries:=entries||jsonb_build_array(entry-'canApprove');
  END IF;
 END LOOP;
 IF jsonb_array_length(entries)=0 THEN RAISE EXCEPTION 'approved library unavailable' USING ERRCODE='42501';END IF;
 body:=jsonb_build_object('companyId',p_company,'threadId',p_thread,'version',care->'version',
  'mode',care->'mode','target',care->'target','messages',care->'messages','entries',entries);
 IF octet_length(body::text)>100000 THEN RAISE EXCEPTION 'context requires review' USING ERRCODE='22023';END IF;
 RETURN body;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_advisor_read(p_actor uuid,p_company uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;care jsonb;current_context jsonb;current_ok boolean:=false;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request AND company_id=p_company AND actor_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft unavailable' USING ERRCODE='42501';END IF;
 -- Current Page/company/CRM checks apply even to a replay; never disclose a moved thread.
 care:=public.crm_care_read(p_actor,p_company,r.thread_id);
 BEGIN
  current_context:=crm_care_control.advisor_context(p_actor,p_company,r.thread_id);
  current_ok:=md5(current_context::text)=r.context_hash;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN current_ok:=false;END;
 RETURN jsonb_build_object('companyId',p_company,'threadId',r.thread_id,'requestId',r.request_id,
  'state',r.state,'attempt',r.attempt,'retryOf',r.retry_of,'stale',NOT current_ok,'expired',r.expires_at<=clock_timestamp(),
  'needsReconciliation',r.state='RUNNING' AND r.expires_at<=clock_timestamp(),
  'result',CASE WHEN current_ok AND r.state<>'RUNNING' THEN r.result ELSE NULL END,
  'createdAt',r.created_at,'completedAt',r.completed_at,'send',false,'aiMaySend',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_advisor_retry(p_actor uuid,p_company uuid,p_request uuid,p_previous uuid,p_version text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old crm_care_control.advisor_runs%ROWTYPE;r crm_care_control.advisor_runs%ROWTYPE;body jsonb;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_request IS NULL OR p_previous IS NULL OR p_request=p_previous OR (p_version~'^[a-f0-9]{32}$') IS NOT TRUE
  OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'invalid retry' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-advisor:'||p_request::text,0));
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF r.actor_id IS DISTINCT FROM p_actor OR r.company_id IS DISTINCT FROM p_company OR r.retry_of IS DISTINCT FROM p_previous
   OR r.expected_version IS DISTINCT FROM p_version OR r.retry_reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'retry key reused' USING ERRCODE='23505';END IF;
  RETURN public.crm_care_advisor_read(p_actor,p_company,p_request)||jsonb_build_object('invoke',false,'replayed',true);
 END IF;
 SELECT * INTO old FROM crm_care_control.advisor_runs WHERE request_id=p_previous AND actor_id=p_actor AND company_id=p_company FOR UPDATE;
 IF NOT FOUND OR old.attempt>=3 OR (old.state='FAILED' OR(old.state='REVIEW' AND old.result->>'reason'='OPERATOR_CLOSED')) IS NOT TRUE THEN
  RAISE EXCEPTION 'retry requires terminal reviewed attempt' USING ERRCODE='42501';END IF;
 body:=crm_care_control.advisor_context(p_actor,p_company,old.thread_id);
 IF body->>'version' IS DISTINCT FROM p_version OR md5(body::text) IS DISTINCT FROM old.context_hash
  OR EXISTS(SELECT 1 FROM crm_care_control.advisor_runs WHERE thread_id=old.thread_id AND state='RUNNING') THEN
  RAISE EXCEPTION 'retry context changed or busy' USING ERRCODE='40001';END IF;
 INSERT INTO crm_care_control.advisor_runs(request_id,company_id,actor_id,thread_id,expected_version,context_hash,context,state,attempt,retry_of,retry_reason)
 VALUES(p_request,p_company,p_actor,old.thread_id,p_version,old.context_hash,body,'RUNNING',old.attempt+1,p_previous,p_reason) RETURNING * INTO r;
 RETURN jsonb_build_object('companyId',p_company,'threadId',r.thread_id,'requestId',p_request,'state','RUNNING',
  'invoke',true,'replayed',false,'capability',r.capability,'context',body,'send',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_advisor_begin(p_actor uuid,p_company uuid,p_request uuid,p_thread uuid,p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;body jsonb;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_request IS NULL OR p_thread IS NULL OR (p_version~'^[a-f0-9]{32}$') IS NOT TRUE THEN
  RAISE EXCEPTION 'invalid draft request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-advisor:'||p_request::text,0));
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF r.actor_id IS DISTINCT FROM p_actor OR r.company_id IS DISTINCT FROM p_company OR r.thread_id IS DISTINCT FROM p_thread
   OR r.expected_version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN public.crm_care_advisor_read(p_actor,p_company,p_request)||jsonb_build_object('invoke',false,'replayed',true);
 END IF;
 body:=crm_care_control.advisor_context(p_actor,p_company,p_thread);
 IF body->>'version' IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'conversation changed' USING ERRCODE='40001';END IF;
 -- The thread lock held by care_read serializes distinct requests. A lost begin
 -- response cannot spend again under another key for the same context.
 IF EXISTS(SELECT 1 FROM crm_care_control.advisor_runs WHERE thread_id=p_thread AND state='RUNNING') THEN
  RAISE EXCEPTION 'draft already in progress; reconcile first' USING ERRCODE='40001';END IF;
 INSERT INTO crm_care_control.advisor_runs(request_id,company_id,actor_id,thread_id,expected_version,context_hash,context,state)
 VALUES(p_request,p_company,p_actor,p_thread,p_version,md5(body::text),body,'RUNNING') RETURNING * INTO r;
 RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'requestId',p_request,'state','RUNNING',
  'invoke',true,'replayed',false,'capability',r.capability,'context',body,'send',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_advisor_finish(p_actor uuid,p_company uuid,p_request uuid,p_capability uuid,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;body jsonb;entry jsonb;need jsonb;message jsonb;
 v_result jsonb;v_state text;reason text;seen text[]:='{}';current_ok boolean:=true;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request AND company_id=p_company AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND OR r.capability IS DISTINCT FROM p_capability THEN RAISE EXCEPTION 'draft capability unavailable' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_response) IS DISTINCT FROM 'object' OR octet_length(p_response::text)>12000 THEN
  RAISE EXCEPTION 'invalid model response' USING ERRCODE='22023';END IF;
 IF r.state<>'RUNNING' THEN
  IF r.response IS DISTINCT FROM p_response THEN RAISE EXCEPTION 'result reused' USING ERRCODE='23505';END IF;
  RETURN public.crm_care_advisor_read(p_actor,p_company,p_request)||jsonb_build_object('replayed',true);
 END IF;
 -- Recheck all source/actor/consent information after model latency. No locks are
 -- held across inference, and no draft changes Lead quality, schedule or thread mode.
 BEGIN
  body:=crm_care_control.advisor_context(p_actor,p_company,r.thread_id);
  current_ok:=md5(body::text)=r.context_hash;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN current_ok:=false;END;
 IF NOT current_ok OR r.expires_at<=clock_timestamp() THEN
  v_state:='REVIEW';reason:=CASE WHEN NOT current_ok THEN 'CONTEXT_CHANGED' ELSE 'EXPIRED' END;
  v_result:=jsonb_build_object('reason',reason,'text',NULL,'send',false);
 ELSIF p_response ? 'failure' THEN
  IF (p_response->>'failure' IN('MODEL_UNAVAILABLE','INVALID_MODEL_OUTPUT','DISABLED')) IS NOT TRUE
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_response) k WHERE k<>'failure') THEN
   RAISE EXCEPTION 'invalid failure' USING ERRCODE='22023';END IF;
  v_state:='FAILED';v_result:=jsonb_build_object('reason',p_response->'failure','text',NULL,'send',false);
 ELSE
  IF NOT p_response ?& ARRAY['action','entryId','needs']
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_response) k WHERE k NOT IN('action','entryId','needs'))
   OR (p_response->>'action' IN('ANSWER','HANDOFF')) IS NOT TRUE
   OR jsonb_typeof(p_response->'entryId') NOT IN('null','string')
   OR jsonb_typeof(p_response->'needs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_response->'needs')>5 THEN
   RAISE EXCEPTION 'invalid model selection' USING ERRCODE='22023';END IF;
  IF p_response->>'action'='ANSWER' THEN
   SELECT x INTO entry FROM jsonb_array_elements(body->'entries') x WHERE x->>'entryId'=p_response->>'entryId';
   IF entry IS NULL THEN RAISE EXCEPTION 'unapproved model selection' USING ERRCODE='22023';END IF;
  ELSIF p_response->>'entryId' IS NOT NULL THEN RAISE EXCEPTION 'handoff cannot select an answer' USING ERRCODE='22023';END IF;
  FOR need IN SELECT value FROM jsonb_array_elements(p_response->'needs') LOOP
   IF jsonb_typeof(need) IS DISTINCT FROM 'object' OR NOT need ?& ARRAY['field','messageId','quote']
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(need) k WHERE k NOT IN('field','messageId','quote'))
    OR (need->>'field' IN('product','location','budget','timing','request')) IS NOT TRUE OR need->>'field'=ANY(seen)
    OR jsonb_typeof(need->'messageId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(need->'quote') IS DISTINCT FROM 'string' OR length(btrim(need->>'quote')) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid need evidence' USING ERRCODE='22023';END IF;
   SELECT x INTO message FROM jsonb_array_elements(body->'messages') x
    WHERE x->>'id'=need->>'messageId' AND x->>'direction'='inbound';
   IF message IS NULL OR strpos(message->>'content',need->>'quote')=0 THEN
    RAISE EXCEPTION 'need evidence unavailable' USING ERRCODE='22023';END IF;
   seen:=array_append(seen,need->>'field');
  END LOOP;
  v_state:=CASE WHEN p_response->>'action'='ANSWER' THEN 'DRAFT' ELSE 'REVIEW' END;
  v_result:=jsonb_build_object('action',p_response->'action','text',entry->'document'->'answer',
   'entryId',entry->'entryId','entryVersion',entry->'version','purpose',entry->'document'->'purpose',
   'sourceReference',entry->'document'->'sourceReference','needs',p_response->'needs',
   'needsVerified',false,'requiresReview',true,'send',false);
 END IF;
 UPDATE crm_care_control.advisor_runs SET state=v_state,response=p_response,result=v_result,completed_at=clock_timestamp() WHERE request_id=p_request;
 IF NOT current_ok THEN
  -- A moved Page/CRM link must not make the final reader roll back this terminal
  -- audit. Return only identifiers already bound to this actor's own request.
  RETURN jsonb_build_object('companyId',p_company,'threadId',r.thread_id,'requestId',p_request,'state','REVIEW',
   'attempt',r.attempt,'retryOf',r.retry_of,'stale',true,'expired',r.expires_at<=clock_timestamp(),
   'needsReconciliation',false,'result',NULL,'send',false,'aiMaySend',false,'replayed',false);
 END IF;
 RETURN public.crm_care_advisor_read(p_actor,p_company,p_request)||jsonb_build_object('replayed',false);
END $$;
CREATE OR REPLACE FUNCTION public.crm_care_advisor_close(p_actor uuid,p_company uuid,p_request uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'review reason required' USING ERRCODE='22023';END IF;
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request AND company_id=p_company AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft unavailable' USING ERRCODE='42501';END IF;
 PERFORM public.crm_care_read(p_actor,p_company,r.thread_id);
 IF r.state='RUNNING' THEN
  UPDATE crm_care_control.advisor_runs SET state='REVIEW',response=jsonb_build_object('failure','OPERATOR_CLOSED','reason',p_reason),
   result=jsonb_build_object('reason','OPERATOR_CLOSED','text',NULL,'send',false),completed_at=clock_timestamp()
   WHERE request_id=p_request;
 END IF;
 RETURN public.crm_care_advisor_read(p_actor,p_company,p_request);
END $$;
REVOKE ALL ON FUNCTION crm_care_control.advisor_authorize(uuid,uuid),crm_care_control.advisor_context(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_care_advisor_read(uuid,uuid,uuid),public.crm_care_advisor_begin(uuid,uuid,uuid,uuid,text),public.crm_care_advisor_finish(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_care_advisor_close(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_care_advisor_retry(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_advisor_read(uuid,uuid,uuid),public.crm_care_advisor_begin(uuid,uuid,uuid,uuid,text),public.crm_care_advisor_finish(uuid,uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_advisor_close(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_advisor_retry(uuid,uuid,uuid,uuid,text,text) TO service_role;
COMMIT;
