-- Private shared care rules. Public human facades keep their original authorization.
-- No runtime identity or access is enrolled by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION crm_care_control.thread_view_core(p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.crm_care_threads%ROWTYPE;target jsonb;messages jsonb;total integer;
BEGIN
 SELECT * INTO t FROM public.crm_care_threads WHERE id=p_thread AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'care thread unavailable' USING ERRCODE='42501';END IF;
 target:=public.crm_care_target(t.id);
 SELECT count(*) INTO total FROM public.crm_care_messages WHERE thread_id=t.id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sent_at,x.id),'[]'::jsonb) INTO messages FROM(
  SELECT id,direction,content,attachments,sent_at,intent FROM public.crm_care_messages WHERE thread_id=t.id ORDER BY sent_at DESC,id DESC LIMIT 50)x;
 RETURN jsonb_build_object('companyId',p_company,'threadId',t.id,'mode',t.mode,'reason',t.reason,'pageId',t.page_id,'revision',t.revision,'humanDeadline',t.human_deadline,
  'claimedBy',t.claimed_by,'target',target-'targetVersion','version',md5((to_jsonb(t)||jsonb_build_object('targetVersion',target->'targetVersion'))::text),
  'messages',messages,'messageCount',total,'historyTruncated',total>50,'aiMaySend',false);
END $$;
CREATE OR REPLACE FUNCTION crm_care_control.library_view_core(p_company uuid,p_entry uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.crm_care_library_entries%ROWTYPE;source text;source_ok boolean:=true;publisher_ok boolean:=false;reason text;
BEGIN
 SELECT * INTO e FROM public.crm_care_library_entries WHERE id=p_entry AND company_id=p_company FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'entry unavailable' USING ERRCODE='42501';END IF;
 BEGIN source:=public.crm_care_library_source(p_company,e.document);
 EXCEPTION WHEN insufficient_privilege THEN source_ok:=false; END;
 IF e.approved_by IS NOT NULL THEN
  publisher_ok:=public.crm_care_library_publisher(e.approved_by,p_company) AND EXISTS(SELECT 1 FROM public.crm_care_library_publishers WHERE company_id=p_company AND user_id=e.approved_by AND authorization_id=e.publisher_authorization);
 END IF;
 reason:=CASE WHEN e.state<>'APPROVED' THEN 'NOT_APPROVED' WHEN NOT source_ok THEN 'SOURCE_UNAVAILABLE'
  WHEN source IS DISTINCT FROM e.source_version THEN 'SOURCE_CHANGED' WHEN NOT publisher_ok THEN 'APPROVER_UNAVAILABLE'
  WHEN (e.document->>'validUntil')::timestamptz<=clock_timestamp() THEN 'EXPIRED' ELSE NULL END;
 RETURN jsonb_build_object('companyId',p_company,'entryId',e.id,'revision',e.revision,'state',e.state,'document',e.document,
  'version',md5(to_jsonb(e)::text||coalesce(source,'unavailable')||publisher_ok::text),'sourceReady',source_ok AND source=e.source_version,
  'approvedReady',reason IS NULL,'invalidReason',reason,'approvedBy',e.approved_by,'approvedAt',e.approved_at);
END $$;
CREATE OR REPLACE FUNCTION crm_care_control.context_core(p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE care jsonb;entry jsonb;entries jsonb:='[]';eid uuid;body jsonb;n integer:=0;
BEGIN
 care:=crm_care_control.thread_view_core(p_company,p_thread);
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
  entry:=crm_care_control.library_view_core(p_company,eid);
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
CREATE OR REPLACE FUNCTION crm_care_control.advisor_read_core(p_actor uuid,p_company uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;care jsonb;current_context jsonb;current_ok boolean:=false;
BEGIN
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request AND company_id=p_company AND actor_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft unavailable' USING ERRCODE='42501';END IF;
 -- Current Page/company/CRM checks apply even to a replay; never disclose a moved thread.
 care:=crm_care_control.thread_view_core(p_company,r.thread_id);
 BEGIN
  current_context:=crm_care_control.context_core(p_company,r.thread_id);
  current_ok:=md5(current_context::text)=r.context_hash;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN current_ok:=false;END;
 RETURN jsonb_build_object('companyId',p_company,'threadId',r.thread_id,'requestId',r.request_id,
  'state',r.state,'attempt',r.attempt,'retryOf',r.retry_of,'stale',NOT current_ok,'expired',r.expires_at<=clock_timestamp(),
  'needsReconciliation',r.state='RUNNING' AND r.expires_at<=clock_timestamp(),
  'result',CASE WHEN current_ok AND r.state<>'RUNNING' THEN r.result ELSE NULL END,
  'createdAt',r.created_at,'completedAt',r.completed_at,'send',false,'aiMaySend',false);
END $$;
CREATE OR REPLACE FUNCTION crm_care_control.advisor_begin_core(p_actor uuid,p_company uuid,p_request uuid,p_thread uuid,p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;body jsonb;
BEGIN
 IF p_request IS NULL OR p_thread IS NULL OR (p_version~'^[a-f0-9]{32}$') IS NOT TRUE THEN
  RAISE EXCEPTION 'invalid draft request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-advisor:'||p_request::text,0));
 IF EXISTS(SELECT 1 FROM crm_care_control.advisor_cancellations WHERE request_id=p_request) THEN RAISE EXCEPTION 'request cancelled' USING ERRCODE='40001';END IF;
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF r.actor_id IS DISTINCT FROM p_actor OR r.company_id IS DISTINCT FROM p_company OR r.thread_id IS DISTINCT FROM p_thread
   OR r.expected_version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN crm_care_control.advisor_read_core(p_actor,p_company,p_request)||jsonb_build_object('invoke',false,'replayed',true);
 END IF;
 body:=crm_care_control.context_core(p_company,p_thread);
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
CREATE OR REPLACE FUNCTION crm_care_control.advisor_finish_core(p_actor uuid,p_company uuid,p_request uuid,p_capability uuid,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;body jsonb;entry jsonb;need jsonb;message jsonb;
 v_result jsonb;v_state text;reason text;seen text[]:='{}';current_ok boolean:=true;
BEGIN
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request AND company_id=p_company AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND OR r.capability IS DISTINCT FROM p_capability THEN RAISE EXCEPTION 'draft capability unavailable' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_response) IS DISTINCT FROM 'object' OR octet_length(p_response::text)>12000 THEN
  RAISE EXCEPTION 'invalid model response' USING ERRCODE='22023';END IF;
 IF r.state<>'RUNNING' THEN
  IF r.response IS DISTINCT FROM p_response THEN RAISE EXCEPTION 'result reused' USING ERRCODE='23505';END IF;
  RETURN crm_care_control.advisor_read_core(p_actor,p_company,p_request)||jsonb_build_object('replayed',true);
 END IF;
 -- Recheck all source/actor/consent information after model latency. No locks are
 -- held across inference, and no draft changes Lead quality, schedule or thread mode.
 BEGIN
  body:=crm_care_control.context_core(p_company,r.thread_id);
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
 RETURN crm_care_control.advisor_read_core(p_actor,p_company,p_request)||jsonb_build_object('replayed',false);
END $$;
CREATE OR REPLACE FUNCTION crm_care_control.inference_claim_core(p_actor uuid,p_company uuid,p_request uuid,p_advisor_capability uuid,
 p_policy uuid,p_credential text,p_payload text,p_input_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_care_control.advisor_runs%ROWTYPE;g crm_care_control.inference_policies%ROWTYPE;
 old crm_care_control.inference_receipts%ROWTYPE;body jsonb;used bigint;calls bigint;
BEGIN
 IF p_policy IS NULL OR (p_credential~'^[a-f0-9]{64}$') IS NOT TRUE OR (p_payload~'^[a-f0-9]{64}$') IS NOT TRUE
  OR p_input_bytes IS NULL OR p_input_bytes<1 THEN RAISE EXCEPTION 'invalid inference claim' USING ERRCODE='22023';END IF;
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request AND company_id=p_company AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND OR r.capability IS DISTINCT FROM p_advisor_capability THEN RAISE EXCEPTION 'inference scope denied' USING ERRCODE='42501';END IF;
 -- Run before thread locks, as FINISH/CANCEL. Revalidate consent/source just before egress.
 body:=crm_care_control.context_core(p_company,r.thread_id);
 SELECT * INTO g FROM crm_care_control.inference_policies WHERE id=p_policy FOR UPDATE;
 IF NOT FOUND OR g.company_id IS DISTINCT FROM p_company OR g.actor_id IS DISTINCT FROM p_actor
  OR g.credential_sha256 IS DISTINCT FROM p_credential OR g.active IS NOT TRUE
  OR clock_timestamp()<g.starts_at OR clock_timestamp()>=g.expires_at THEN RAISE EXCEPTION 'inference policy unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM crm_care_control.inference_receipts WHERE request_id=p_request;
 IF FOUND THEN
  IF old.policy_id IS DISTINCT FROM p_policy OR old.payload_sha256 IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'inference request reused' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('requestId',p_request,'invoke',false,'state',old.state);
 END IF;
 IF r.state<>'RUNNING' OR r.expires_at<=clock_timestamp() OR md5(body::text) IS DISTINCT FROM r.context_hash THEN
  RAISE EXCEPTION 'inference context changed' USING ERRCODE='40001';END IF;
 IF p_input_bytes>g.max_input_bytes THEN RAISE EXCEPTION 'inference input too large' USING ERRCODE='22023';END IF;
 -- An unacknowledged dispatch is never recovered by another model call. Only
 -- one in-flight call per allowance; ambiguous cost stops subsequent admission.
 IF EXISTS(SELECT 1 FROM crm_care_control.inference_receipts WHERE policy_id=p_policy AND state IN('AUTHORIZED','UNKNOWN')) THEN
  RAISE EXCEPTION 'inference reconciliation required' USING ERRCODE='40001';END IF;
 SELECT count(*),coalesce(sum(reserved_vnd),0) INTO calls,used FROM crm_care_control.inference_receipts WHERE policy_id=p_policy;
 IF calls>=g.max_calls OR used+g.reserve_per_call_vnd>g.allowance_vnd THEN RAISE EXCEPTION 'inference allowance exhausted' USING ERRCODE='42501';END IF;
 INSERT INTO crm_care_control.inference_receipts(request_id,policy_id,company_id,actor_id,payload_sha256,policy_snapshot,reserved_vnd,state,dispatch_before)
 VALUES(p_request,p_policy,p_company,p_actor,p_payload,to_jsonb(g)-'credential_sha256',g.reserve_per_call_vnd,'AUTHORIZED',
  least(clock_timestamp()+interval '5 seconds',g.expires_at,r.expires_at)) RETURNING * INTO old;
 RETURN jsonb_build_object('requestId',p_request,'companyId',p_company,'actorId',p_actor,'policyId',p_policy,'invoke',true,
  'capability',old.capability,'model',g.model,'maxOutputTokens',g.max_output_tokens,'maxInputBytes',g.max_input_bytes,
  'authorizedAt',old.authorized_at,'dispatchBefore',old.dispatch_before,'reservedVnd',old.reserved_vnd);
END $$;
CREATE OR REPLACE FUNCTION public.crm_care_read(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.marketing_fb_intake_admin(p_actor,p_company);RETURN crm_care_control.thread_view_core(p_company,p_thread);END $$;
CREATE OR REPLACE FUNCTION public.crm_care_library_read(p_actor uuid,p_company uuid,p_entry uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.marketing_fb_intake_admin(p_actor,p_company);RETURN crm_care_control.library_view_core(p_company,p_entry)||jsonb_build_object('canApprove',public.crm_care_library_publisher(p_actor,p_company));END $$;
CREATE OR REPLACE FUNCTION crm_care_control.advisor_context(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM crm_care_control.advisor_authorize(p_actor,p_company);RETURN crm_care_control.context_core(p_company,p_thread);END $$;
CREATE OR REPLACE FUNCTION public.crm_care_advisor_read(p_actor uuid,p_company uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM crm_care_control.advisor_authorize(p_actor,p_company);RETURN crm_care_control.advisor_read_core(p_actor,p_company,p_request);END $$;
CREATE OR REPLACE FUNCTION public.crm_care_advisor_begin(p_actor uuid,p_company uuid,p_request uuid,p_thread uuid,p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM crm_care_control.advisor_authorize(p_actor,p_company);RETURN crm_care_control.advisor_begin_core(p_actor,p_company,p_request,p_thread,p_version);END $$;
CREATE OR REPLACE FUNCTION public.crm_care_advisor_finish(p_actor uuid,p_company uuid,p_request uuid,p_capability uuid,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM crm_care_control.advisor_authorize(p_actor,p_company);RETURN crm_care_control.advisor_finish_core(p_actor,p_company,p_request,p_capability,p_response);END $$;
CREATE OR REPLACE FUNCTION public.crm_care_inference_claim(p_actor uuid,p_company uuid,p_request uuid,p_advisor_capability uuid,p_policy uuid,p_credential text,p_payload text,p_input_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM crm_care_control.advisor_authorize(p_actor,p_company);RETURN crm_care_control.inference_claim_core(p_actor,p_company,p_request,p_advisor_capability,p_policy,p_credential,p_payload,p_input_bytes);END $$;
REVOKE ALL ON FUNCTION crm_care_control.thread_view_core(uuid,uuid),
 crm_care_control.library_view_core(uuid,uuid),
 crm_care_control.context_core(uuid,uuid),
 crm_care_control.advisor_read_core(uuid,uuid,uuid),
 crm_care_control.advisor_begin_core(uuid,uuid,uuid,uuid,text),
 crm_care_control.advisor_finish_core(uuid,uuid,uuid,uuid,jsonb),
 crm_care_control.inference_claim_core(uuid,uuid,uuid,uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
