-- Agent identities and bounded draft workers. Empty enrollment; no send authority.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_care_control.runtime_principals(
 id uuid PRIMARY KEY,company_id uuid NOT NULL,label text NOT NULL CHECK(length(btrim(label)) BETWEEN 3 AND 200),
 active boolean NOT NULL DEFAULT false,authorization_id uuid NOT NULL DEFAULT gen_random_uuid(),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_care_control.runtime_grants(
 id uuid PRIMARY KEY,principal_id uuid NOT NULL REFERENCES crm_care_control.runtime_principals(id),
 company_id uuid NOT NULL,page_id text NOT NULL CHECK(page_id~'^[0-9]{1,32}$'),delegated_by uuid NOT NULL,
 inference_policy_id uuid NOT NULL REFERENCES crm_care_control.inference_policies(id),
 active boolean NOT NULL DEFAULT false,authorization_id uuid NOT NULL DEFAULT gen_random_uuid(),
 starts_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_care_control.runtime_turns(
 request_id uuid PRIMARY KEY REFERENCES crm_care_control.advisor_runs(request_id),
 principal_id uuid NOT NULL,grant_id uuid NOT NULL REFERENCES crm_care_control.runtime_grants(id),
 company_id uuid NOT NULL,page_id text NOT NULL,thread_id uuid NOT NULL,inbound_id uuid NOT NULL,
 worker_id uuid NOT NULL,authorization_hash text NOT NULL,authority_snapshot jsonb NOT NULL,
 result jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
 UNIQUE(company_id,thread_id,inbound_id)
);
ALTER TABLE crm_care_control.runtime_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_care_control.runtime_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_care_control.runtime_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.runtime_principals,crm_care_control.runtime_grants,crm_care_control.runtime_turns FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION crm_care_control.runtime_rotate_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (to_jsonb(NEW)-'active'-'authorization_id') IS DISTINCT FROM (to_jsonb(OLD)-'active'-'authorization_id') THEN
  RAISE EXCEPTION 'new approval required for changed authority' USING ERRCODE='22023';END IF;
 NEW.authorization_id:=gen_random_uuid();RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS runtime_principal_changed ON crm_care_control.runtime_principals;
CREATE TRIGGER runtime_principal_changed BEFORE UPDATE ON crm_care_control.runtime_principals FOR EACH ROW EXECUTE FUNCTION crm_care_control.runtime_rotate_authority();
DROP TRIGGER IF EXISTS runtime_grant_changed ON crm_care_control.runtime_grants;
CREATE TRIGGER runtime_grant_changed BEFORE UPDATE ON crm_care_control.runtime_grants FOR EACH ROW EXECUTE FUNCTION crm_care_control.runtime_rotate_authority();

CREATE OR REPLACE FUNCTION crm_care_control.runtime_authorize(p_principal uuid,p_company uuid,p_grant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_care_control.runtime_principals%ROWTYPE;g crm_care_control.runtime_grants%ROWTYPE;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read committed required' USING ERRCODE='0A000';END IF;
 SELECT * INTO g FROM crm_care_control.runtime_grants WHERE id=p_grant AND principal_id=p_principal AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime grant unavailable' USING ERRCODE='42501';END IF;
 -- Keep the grantor's current company/tenant authority. Never execute as them.
 PERFORM crm_care_control.advisor_authorize(g.delegated_by,p_company);
 SELECT * INTO a FROM crm_care_control.runtime_principals WHERE id=p_principal AND company_id=p_company FOR SHARE;
 IF NOT FOUND OR a.active IS NOT TRUE OR EXISTS(SELECT 1 FROM public.users WHERE id=p_principal) THEN
  RAISE EXCEPTION 'runtime identity unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO g FROM crm_care_control.runtime_grants WHERE id=p_grant AND principal_id=p_principal AND company_id=p_company FOR SHARE;
 IF NOT FOUND OR g.active IS NOT TRUE OR clock_timestamp()<g.starts_at OR clock_timestamp()>=g.expires_at THEN
  RAISE EXCEPTION 'runtime grant expired or revoked' USING ERRCODE='42501';END IF;
 RETURN to_jsonb(g)||jsonb_build_object('principal_kind','AGENT','principal_authorization',a.authorization_id);
END $$;

CREATE OR REPLACE FUNCTION crm_care_control.runtime_assert_live(p_auth jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (p_auth->>'active')::boolean IS NOT TRUE OR p_auth->>'expires_at' IS NULL
  OR clock_timestamp()>=(p_auth->>'expires_at')::timestamptz OR clock_timestamp()<(p_auth->>'starts_at')::timestamptz THEN
  RAISE EXCEPTION 'runtime authority expired while waiting' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION crm_care_control.runtime_assert_live(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_care_runtime_candidates(p_principal uuid,p_company uuid,p_grant uuid,p_page text,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;items jsonb;
BEGIN
 auth:=crm_care_control.runtime_authorize(p_principal,p_company,p_grant);
 IF p_page IS DISTINCT FROM auth->>'page_id' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN
  RAISE EXCEPTION 'runtime page or limit denied' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.facebook_pages WHERE page_id=p_page AND default_company_id=p_company AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime Page unavailable' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(x.id ORDER BY x.last_inbound_at,x.id),'[]') INTO items FROM(
  SELECT t.id,t.last_inbound_at FROM public.crm_care_threads t
  JOIN LATERAL(SELECT m.id FROM public.crm_care_messages m WHERE m.thread_id=t.id AND m.direction='inbound'
   ORDER BY m.sent_at DESC,m.id DESC LIMIT 1) latest ON true
  WHERE t.company_id=p_company AND t.page_id=p_page AND t.mode='WAITING'
   AND NOT EXISTS(SELECT 1 FROM crm_care_control.runtime_turns rt WHERE rt.company_id=p_company AND rt.thread_id=t.id AND rt.inbound_id=latest.id)
   AND NOT EXISTS(SELECT 1 FROM crm_care_control.advisor_runs ar WHERE ar.thread_id=t.id AND ar.state='RUNNING')
  ORDER BY t.last_inbound_at,t.id LIMIT p_limit)x;
 PERFORM crm_care_control.runtime_assert_live(auth);
 RETURN jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'pageId',p_page,'items',items,'send',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_runtime_begin(p_principal uuid,p_company uuid,p_grant uuid,p_request uuid,p_thread uuid,p_worker uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;care jsonb;result jsonb;r crm_care_control.advisor_runs%ROWTYPE;old crm_care_control.runtime_turns%ROWTYPE;incoming uuid;event public.crm_care_events%ROWTYPE;deadline timestamptz;thread_row public.crm_care_threads%ROWTYPE;
BEGIN
 auth:=crm_care_control.runtime_authorize(p_principal,p_company,p_grant);
 IF p_request IS NULL OR p_thread IS NULL OR p_worker IS NULL THEN RAISE EXCEPTION 'invalid runtime request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-advisor:'||p_request::text,0));
 -- Existing run before thread, matching FINISH/CANCEL lock order.
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  SELECT * INTO old FROM crm_care_control.runtime_turns WHERE request_id=p_request;
  IF NOT FOUND OR old.principal_id IS DISTINCT FROM p_principal OR old.company_id IS DISTINCT FROM p_company
   OR old.grant_id IS DISTINCT FROM p_grant OR old.thread_id IS DISTINCT FROM p_thread
   OR old.authorization_hash IS DISTINCT FROM md5(auth::text) THEN RAISE EXCEPTION 'runtime request reused' USING ERRCODE='23505';END IF;
  PERFORM crm_care_control.runtime_assert_live(auth);
  RETURN jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'threadId',p_thread,
   'requestId',p_request,'invoke',false,'state',r.state,'send',false);
 END IF;
 SELECT * INTO event FROM public.crm_care_events WHERE request_id=p_request;
 IF FOUND THEN
  IF event.actor_id IS DISTINCT FROM p_principal OR event.company_id IS DISTINCT FROM p_company OR event.thread_id IS DISTINCT FROM p_thread
   OR event.action<>'AI_PREFLIGHT_HANDOFF' OR event.command->>'authority' IS DISTINCT FROM md5(auth::text) THEN
   RAISE EXCEPTION 'runtime request reused' USING ERRCODE='23505';END IF;
  PERFORM crm_care_control.runtime_assert_live(auth);
  RETURN event.result||jsonb_build_object('replayed',true);END IF;
 SELECT * INTO thread_row FROM public.crm_care_threads WHERE id=p_thread AND company_id=p_company FOR UPDATE;
 IF NOT FOUND OR thread_row.page_id IS DISTINCT FROM auth->>'page_id' OR thread_row.mode<>'WAITING' THEN
  RAISE EXCEPTION 'runtime thread unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.facebook_pages WHERE page_id=thread_row.page_id AND default_company_id=p_company AND is_active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime Page unavailable' USING ERRCODE='42501';END IF;
 SELECT id INTO incoming FROM public.crm_care_messages WHERE thread_id=p_thread AND direction='inbound' ORDER BY sent_at DESC,id DESC LIMIT 1;
 IF incoming IS NULL THEN RAISE EXCEPTION 'runtime input unavailable' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM crm_care_control.runtime_turns WHERE company_id=p_company AND thread_id=p_thread AND inbound_id=incoming) THEN
  RETURN jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'threadId',p_thread,
   'requestId',p_request,'invoke',false,'state','ALREADY_HANDLED','send',false);END IF;
 BEGIN
  care:=crm_care_control.thread_view_core(p_company,p_thread);
  result:=crm_care_control.advisor_begin_core(p_principal,p_company,p_request,p_thread,care->>'version');
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR unique_violation THEN
  -- Missing routing/approved knowledge or an already reviewed context is an
  -- operator exception, never a repeated model call or silent WAITING loop.
  PERFORM crm_care_control.runtime_assert_live(auth);
  deadline:=public.crm_care_human_deadline(clock_timestamp());
  UPDATE public.crm_care_threads SET mode='HUMAN_REQUESTED',reason='AI_PREFLIGHT_HANDOFF',human_deadline=deadline,revision=revision+1
   WHERE id=p_thread AND company_id=p_company AND page_id=auth->>'page_id' AND mode='WAITING';
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime preflight changed' USING ERRCODE='40001';END IF;
  result:=jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'requestId',p_request,
   'threadId',p_thread,'invoke',false,'state','HUMAN_REQUESTED','send',false,'humanDeadline',deadline);
  INSERT INTO public.crm_care_events(request_id,thread_id,company_id,actor_id,action,previous_mode,result,command)
  VALUES(p_request,p_thread,p_company,p_principal,'AI_PREFLIGHT_HANDOFF','WAITING',result,
   jsonb_build_object('authority',md5(auth::text),'principalKind','AGENT','grantId',p_grant,'workerId',p_worker));
  RETURN result;
 END;
 IF result->>'invoke' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'unexpected runtime replay' USING ERRCODE='40001';END IF;
 PERFORM crm_care_control.runtime_assert_live(auth);
 INSERT INTO crm_care_control.runtime_turns(request_id,principal_id,grant_id,company_id,page_id,thread_id,inbound_id,worker_id,authorization_hash,authority_snapshot)
 VALUES(p_request,p_principal,p_grant,p_company,auth->>'page_id',p_thread,incoming,p_worker,md5(auth::text),auth);
 RETURN result||jsonb_build_object('principalId',p_principal,'grantId',p_grant,'policyId',auth->'inference_policy_id');
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_runtime_inference_claim(p_actor uuid,p_company uuid,p_request uuid,p_advisor_capability uuid,
 p_policy uuid,p_credential text,p_payload text,p_input_bytes integer,p_grant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;t crm_care_control.runtime_turns%ROWTYPE;result jsonb;deadline timestamptz;
BEGIN
 auth:=crm_care_control.runtime_authorize(p_actor,p_company,p_grant);
 SELECT * INTO t FROM crm_care_control.runtime_turns WHERE request_id=p_request;
 IF NOT FOUND OR t.principal_id IS DISTINCT FROM p_actor OR t.company_id IS DISTINCT FROM p_company OR t.grant_id IS DISTINCT FROM p_grant
  OR t.authorization_hash IS DISTINCT FROM md5(auth::text) OR auth->>'inference_policy_id' IS DISTINCT FROM p_policy::text THEN
  RAISE EXCEPTION 'runtime inference denied' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.crm_care_threads WHERE id=t.thread_id AND company_id=p_company AND page_id=auth->>'page_id';
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime thread moved' USING ERRCODE='42501';END IF;
 result:=crm_care_control.inference_claim_core(p_actor,p_company,p_request,p_advisor_capability,p_policy,p_credential,p_payload,p_input_bytes);
 PERFORM crm_care_control.runtime_assert_live(auth);
 IF result->>'invoke'='true' THEN
  UPDATE crm_care_control.inference_receipts SET dispatch_before=least(dispatch_before,(auth->>'expires_at')::timestamptz)
   WHERE request_id=p_request RETURNING dispatch_before INTO deadline;
  result:=result||jsonb_build_object('dispatchBefore',deadline);
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_runtime_finish(p_principal uuid,p_company uuid,p_grant uuid,p_request uuid,p_capability uuid,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;t crm_care_control.runtime_turns%ROWTYPE;r crm_care_control.advisor_runs%ROWTYPE;view jsonb;reply jsonb;deadline timestamptz;handoff boolean:=false;
BEGIN
 auth:=crm_care_control.runtime_authorize(p_principal,p_company,p_grant);
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request FOR UPDATE;
 SELECT * INTO t FROM crm_care_control.runtime_turns WHERE request_id=p_request;
 IF NOT FOUND OR t.principal_id IS DISTINCT FROM p_principal OR t.company_id IS DISTINCT FROM p_company OR t.grant_id IS DISTINCT FROM p_grant
  OR t.authorization_hash IS DISTINCT FROM md5(auth::text) OR r.capability IS DISTINCT FROM p_capability THEN
  RAISE EXCEPTION 'runtime finish denied' USING ERRCODE='42501';END IF;
 PERFORM crm_care_control.runtime_assert_live(auth);
 IF t.result IS NOT NULL THEN
  IF r.response IS DISTINCT FROM p_response THEN RAISE EXCEPTION 'runtime result reused' USING ERRCODE='23505';END IF;
  RETURN t.result||jsonb_build_object('replayed',true);END IF;
 view:=crm_care_control.advisor_finish_core(p_principal,p_company,p_request,p_capability,p_response);
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request;
 PERFORM crm_care_control.runtime_assert_live(auth);
 handoff:=view->>'stale'='false' AND (r.result->>'action'='HANDOFF' OR r.state='FAILED');
 IF handoff IS TRUE THEN
  deadline:=public.crm_care_human_deadline(clock_timestamp());
  UPDATE public.crm_care_threads SET mode='HUMAN_REQUESTED',reason='AI_HANDOFF',human_deadline=deadline,revision=revision+1
   WHERE id=t.thread_id AND company_id=p_company AND page_id=t.page_id AND mode='WAITING';
  IF NOT FOUND THEN RAISE EXCEPTION 'handoff context changed' USING ERRCODE='40001';END IF;
  INSERT INTO public.crm_care_events(request_id,thread_id,company_id,actor_id,action,previous_mode,result)
  VALUES(p_request,t.thread_id,p_company,p_principal,'AI_HANDOFF','WAITING',
   jsonb_build_object('principalKind','AGENT','principalId',p_principal,'grantId',p_grant,'authorizationId',auth->'authorization_id',
    'delegatedBy',auth->'delegated_by','mode','HUMAN_REQUESTED','ownerId',r.context->'target'->'ownerId','deadline',deadline,
    'needs',r.result->'needs','needsVerified',false,'reason',coalesce(r.result->>'reason','MODEL_HANDOFF')));
 END IF;
 reply:=jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'requestId',p_request,'threadId',t.thread_id,
  'state',r.state,'handoff',coalesce(handoff,false),'humanDeadline',deadline,'stale',view->'stale','send',false,'replayed',false);
 UPDATE crm_care_control.runtime_turns SET result=reply,completed_at=clock_timestamp() WHERE request_id=p_request;
 RETURN reply;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_runtime_read(p_actor uuid,p_company uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t crm_care_control.runtime_turns%ROWTYPE;view jsonb;auth jsonb;authorized boolean:=false;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 SELECT * INTO t FROM crm_care_control.runtime_turns WHERE request_id=p_request AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime record unavailable' USING ERRCODE='42501';END IF;
 view:=crm_care_control.advisor_read_core(t.principal_id,p_company,p_request);
 BEGIN
  auth:=crm_care_control.runtime_authorize(t.principal_id,p_company,t.grant_id);authorized:=md5(auth::text)=t.authorization_hash;
 EXCEPTION WHEN insufficient_privilege THEN authorized:=false;END;
 RETURN view||jsonb_build_object('principalKind','AGENT','principalId',t.principal_id,'grantId',t.grant_id,
  'workerId',t.worker_id,'authorityCurrent',authorized,'result',CASE WHEN authorized THEN view->'result' ELSE NULL END,
  'runtimeResult',t.result,'send',false);
END $$;
CREATE OR REPLACE FUNCTION public.crm_care_runtime_list(p_actor uuid,p_company uuid,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cursor_at timestamptz;items jsonb;more boolean;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_after IS NOT NULL THEN
  SELECT created_at INTO cursor_at FROM crm_care_control.runtime_turns WHERE request_id=p_after AND company_id=p_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime cursor unavailable' USING ERRCODE='42501';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.request_id DESC),'[]') INTO items FROM(
  SELECT rt.request_id,rt.thread_id,rt.principal_id,rt.grant_id,rt.created_at,r.state,
   r.state='RUNNING' AND r.expires_at<=clock_timestamp() needs_reconciliation,
   coalesce(p.is_active AND p.default_company_id=p_company,false) scope_available
  FROM crm_care_control.runtime_turns rt JOIN crm_care_control.advisor_runs r USING(request_id)
  LEFT JOIN public.facebook_pages p ON p.page_id=rt.page_id
  WHERE rt.company_id=p_company AND(p_after IS NULL OR(rt.created_at,rt.request_id)<(cursor_at,p_after))
  ORDER BY rt.created_at DESC,rt.request_id DESC LIMIT 21)x;
 more:=jsonb_array_length(items)>20;IF more THEN items:=items-20;END IF;
 RETURN jsonb_build_object('companyId',p_company,'items',items,'nextAfter',CASE WHEN more THEN items->19->'request_id' ELSE NULL END,'send',false);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_runtime_list(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_runtime_list(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION crm_care_control.runtime_rotate_authority(),crm_care_control.runtime_authorize(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_care_runtime_candidates(uuid,uuid,uuid,text,integer),public.crm_care_runtime_begin(uuid,uuid,uuid,uuid,uuid,uuid),
 public.crm_care_runtime_inference_claim(uuid,uuid,uuid,uuid,uuid,text,text,integer,uuid),
 public.crm_care_runtime_finish(uuid,uuid,uuid,uuid,uuid,jsonb),public.crm_care_runtime_read(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_runtime_candidates(uuid,uuid,uuid,text,integer),public.crm_care_runtime_begin(uuid,uuid,uuid,uuid,uuid,uuid),
 public.crm_care_runtime_inference_claim(uuid,uuid,uuid,uuid,uuid,text,text,integer,uuid),
 public.crm_care_runtime_finish(uuid,uuid,uuid,uuid,uuid,jsonb),public.crm_care_runtime_read(uuid,uuid,uuid) TO service_role;
CREATE TABLE IF NOT EXISTS crm_care_control.runtime_closures(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,company_id uuid NOT NULL,runtime_request_id uuid NOT NULL,
 reason text NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_care_control.runtime_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.runtime_closures FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_care_runtime_close(p_actor uuid,p_company uuid,p_request uuid,p_runtime_request uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old crm_care_control.runtime_closures%ROWTYPE;t crm_care_control.runtime_turns%ROWTYPE;
 r crm_care_control.advisor_runs%ROWTYPE;care jsonb;reply jsonb;outcome text;deadline timestamptz;
BEGIN
 PERFORM crm_care_control.advisor_authorize(p_actor,p_company);
 IF p_request IS NULL OR p_runtime_request IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'invalid runtime closure' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-runtime-close:'||p_request::text,0));
 SELECT * INTO old FROM crm_care_control.runtime_closures WHERE request_id=p_request;
 IF FOUND AND(old.actor_id IS DISTINCT FROM p_actor OR old.company_id IS DISTINCT FROM p_company
  OR old.runtime_request_id IS DISTINCT FROM p_runtime_request OR old.reason IS DISTINCT FROM p_reason) THEN
  RAISE EXCEPTION 'closure request reused' USING ERRCODE='23505';END IF;
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_runtime_request FOR UPDATE;
 SELECT * INTO t FROM crm_care_control.runtime_turns WHERE request_id=p_runtime_request AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime turn unavailable' USING ERRCODE='42501';END IF;
 care:=crm_care_control.thread_view_core(p_company,t.thread_id);
 IF old.request_id IS NOT NULL THEN RETURN old.result||jsonb_build_object('replayed',true);END IF;
 outcome:=CASE WHEN r.state='RUNNING' THEN 'CLOSED' ELSE 'ALREADY_TERMINAL' END;
 IF r.state='RUNNING' THEN
  UPDATE crm_care_control.advisor_runs SET state='REVIEW',response=jsonb_build_object('failure','OPERATOR_CLOSED','reason',p_reason),
   result=jsonb_build_object('reason','OPERATOR_CLOSED','text',NULL,'send',false),completed_at=clock_timestamp() WHERE request_id=p_runtime_request;
  UPDATE crm_care_control.runtime_turns SET result=jsonb_build_object('companyId',p_company,'principalId',t.principal_id,'grantId',t.grant_id,
   'requestId',p_runtime_request,'threadId',t.thread_id,'state','REVIEW','operatorClosed',true,'send',false),completed_at=clock_timestamp() WHERE request_id=p_runtime_request;
  IF care->>'mode'='WAITING' THEN
   deadline:=public.crm_care_human_deadline(clock_timestamp());
   UPDATE public.crm_care_threads SET mode='HUMAN_REQUESTED',reason='RUNTIME_CLOSED',human_deadline=deadline,revision=revision+1 WHERE id=t.thread_id;
  END IF;
  INSERT INTO public.crm_care_events(request_id,thread_id,company_id,actor_id,action,previous_mode,result)
  VALUES(p_request,t.thread_id,p_company,p_actor,'RUNTIME_CLOSED',care->>'mode',
   jsonb_build_object('runtimeRequestId',p_runtime_request,'principalId',t.principal_id,'reason',p_reason,'send',false));
 END IF;
 reply:=jsonb_build_object('companyId',p_company,'requestId',p_request,'runtimeRequestId',p_runtime_request,'threadId',t.thread_id,
  'outcome',outcome,'replayed',false,'send',false);
 INSERT INTO crm_care_control.runtime_closures(request_id,actor_id,company_id,runtime_request_id,reason,result)
 VALUES(p_request,p_actor,p_company,p_runtime_request,p_reason,reply);
 -- No refund, inference receipt mutation or automatic retry on closure.
 RETURN reply;
END $$;
REVOKE ALL ON FUNCTION public.crm_care_runtime_close(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_runtime_close(uuid,uuid,uuid,uuid,text) TO service_role;

COMMIT;
