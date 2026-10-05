-- Source-backed runtime answers. Empty, separately approved send policies.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_care_control.send_policies(
 id uuid PRIMARY KEY,principal_id uuid NOT NULL,grant_id uuid NOT NULL REFERENCES crm_care_control.runtime_grants(id),
 company_id uuid NOT NULL,page_id text NOT NULL CHECK(page_id~'^[0-9]{1,32}$'),
 active boolean NOT NULL DEFAULT false,authorization_id uuid NOT NULL DEFAULT gen_random_uuid(),
 starts_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 app_id text NOT NULL CHECK(app_id~'^[0-9]{1,32}$'),graph_version text NOT NULL CHECK(graph_version~'^v[0-9]{1,3}\.0$'),
 credential_hash text NOT NULL CHECK(credential_hash~'^[a-f0-9]{64}$'),
 allowed_entries jsonb NOT NULL CHECK(jsonb_typeof(allowed_entries)='object' AND octet_length(allowed_entries::text)<=10000 AND allowed_entries<>'{}'),
 max_messages integer NOT NULL CHECK(max_messages BETWEEN 1 AND 100000),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_care_control.send_attempts(
 attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL UNIQUE REFERENCES crm_care_control.runtime_turns(request_id),
 policy_id uuid NOT NULL,principal_id uuid NOT NULL,grant_id uuid NOT NULL,company_id uuid NOT NULL,page_id text NOT NULL,thread_id uuid NOT NULL,
 worker_id uuid NOT NULL,state text NOT NULL CHECK(state IN('HELD','SENDING','SENT','UNCERTAIN','CONFLICT')),
 reason text,authority_hash text NOT NULL,policy_snapshot jsonb NOT NULL,
 payload jsonb,psid text,app_id text,graph_version text,inbound_id uuid,entry_id uuid,entry_version text,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),send_before timestamptz,ack_mid text,echo_mid text,
 CHECK((state='HELD')=(payload IS NULL))
);
CREATE TABLE IF NOT EXISTS crm_care_control.send_results(
 attempt_id uuid NOT NULL REFERENCES crm_care_control.send_attempts(attempt_id),result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(attempt_id,result)
);
ALTER TABLE crm_care_control.send_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_care_control.send_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_care_control.send_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.send_policies,crm_care_control.send_attempts,crm_care_control.send_results FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS care_send_policy_changed ON crm_care_control.send_policies;
CREATE TRIGGER care_send_policy_changed BEFORE UPDATE ON crm_care_control.send_policies FOR EACH ROW EXECUTE FUNCTION crm_care_control.runtime_rotate_authority();

CREATE OR REPLACE FUNCTION crm_care_control.send_authorize(p_principal uuid,p_company uuid,p_grant uuid,p_policy uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;p crm_care_control.send_policies%ROWTYPE;
BEGIN
 auth:=crm_care_control.runtime_authorize(p_principal,p_company,p_grant);
 SELECT * INTO p FROM crm_care_control.send_policies WHERE id=p_policy FOR UPDATE;
 IF NOT FOUND OR p.principal_id IS DISTINCT FROM p_principal OR p.company_id IS DISTINCT FROM p_company
  OR p.grant_id IS DISTINCT FROM p_grant OR p.page_id IS DISTINCT FROM auth->>'page_id' OR p.active IS NOT TRUE
  OR clock_timestamp()<p.starts_at OR clock_timestamp()>=p.expires_at THEN RAISE EXCEPTION 'send policy unavailable' USING ERRCODE='42501';END IF;
 PERFORM crm_care_control.runtime_assert_live(auth);
 RETURN jsonb_build_object('runtime',auth,'policy',to_jsonb(p));
END $$;

-- The same thread lock serializes survey/outcome/answer claims. Acknowledged
-- answers also wait for their echo, so the next model sees the actual transcript.
CREATE OR REPLACE FUNCTION crm_survey_control.delivery_busy(p_thread uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM crm_survey_control.proposals p JOIN crm_survey_control.deliveries d ON d.proposal_id=p.id
  WHERE p.thread_id=p_thread AND d.state IN('SENDING','UNCERTAIN'))
 OR EXISTS(SELECT 1 FROM crm_survey_control.outcomes o WHERE o.thread_id=p_thread AND o.state IN('SENDING','UNCERTAIN'))
 OR EXISTS(SELECT 1 FROM crm_care_control.send_attempts a WHERE a.thread_id=p_thread
  AND(a.state IN('SENDING','UNCERTAIN','CONFLICT') OR(a.state='SENT' AND a.echo_mid IS NULL)))
$$;
CREATE OR REPLACE FUNCTION crm_care_control.answer_context_busy(p_thread uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT crm_survey_control.delivery_busy(p_thread)
 OR EXISTS(SELECT 1 FROM crm_survey_control.dispatch_attempts a WHERE a.thread_id=p_thread AND a.ack_mid IS NOT NULL AND a.echo_mid IS NULL)
 OR EXISTS(SELECT 1 FROM crm_survey_control.outcome_attempts a WHERE a.thread_id=p_thread AND a.ack_mid IS NOT NULL AND a.echo_mid IS NULL)
$$;
CREATE OR REPLACE FUNCTION crm_care_control.send_handoff(p_thread uuid,p_company uuid,p_page text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.crm_care_threads SET mode='HUMAN_REQUESTED',reason=p_reason,revision=revision+1,
  human_deadline=least(human_deadline,public.crm_care_human_deadline(clock_timestamp()))
 WHERE id=p_thread AND company_id=p_company AND page_id=p_page AND mode='WAITING';
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_send_candidates(p_principal uuid,p_company uuid,p_grant uuid,p_policy uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;items jsonb;
BEGIN
 auth:=crm_care_control.send_authorize(p_principal,p_company,p_grant,p_policy);
 SELECT coalesce(jsonb_agg(x.request_id ORDER BY x.created_at,x.request_id),'[]') INTO items FROM(
  SELECT rt.request_id,rt.created_at FROM crm_care_control.runtime_turns rt JOIN crm_care_control.advisor_runs r USING(request_id)
  WHERE rt.principal_id=p_principal AND rt.grant_id=p_grant AND rt.company_id=p_company AND rt.page_id=auth->'policy'->>'page_id'
   AND r.state='DRAFT' AND NOT EXISTS(SELECT 1 FROM crm_care_control.send_attempts a WHERE a.request_id=rt.request_id)
   AND NOT crm_care_control.answer_context_busy(rt.thread_id)
  ORDER BY rt.created_at,rt.request_id LIMIT 10)x;
 PERFORM crm_care_control.runtime_assert_live(auth->'runtime');PERFORM crm_care_control.runtime_assert_live(auth->'policy');
 RETURN jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'policyId',p_policy,'items',items,'send',false);
END $$;

-- Payload is returned exactly once after the authorization transaction commits.
CREATE OR REPLACE FUNCTION public.crm_care_send_claim(p_principal uuid,p_company uuid,p_grant uuid,p_policy uuid,p_request uuid,p_worker uuid,p_credential text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;rt crm_care_control.runtime_turns%ROWTYPE;r crm_care_control.advisor_runs%ROWTYPE;
 a crm_care_control.send_attempts%ROWTYPE;t public.crm_care_threads%ROWTYPE;m public.crm_care_messages%ROWTYPE;
 context jsonb;entry jsonb;reason text;payload jsonb;attempt uuid:=gen_random_uuid();authorized timestamptz;deadline timestamptz;credential text;publisher_until timestamptz;
BEGIN
 auth:=crm_care_control.send_authorize(p_principal,p_company,p_grant,p_policy);
 IF p_request IS NULL OR p_worker IS NULL OR(p_credential~'^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid send command' USING ERRCODE='22023';END IF;
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request FOR UPDATE;
 SELECT * INTO rt FROM crm_care_control.runtime_turns WHERE request_id=p_request AND company_id=p_company AND principal_id=p_principal AND grant_id=p_grant;
 IF NOT FOUND OR rt.page_id IS DISTINCT FROM auth->'policy'->>'page_id' THEN RAISE EXCEPTION 'runtime draft unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.crm_care_threads WHERE id=rt.thread_id AND company_id=p_company AND page_id=rt.page_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM crm_care_control.send_attempts WHERE request_id=p_request;
 IF FOUND THEN RETURN jsonb_build_object('status','ALREADY_HANDLED','attemptId',a.attempt_id,'state',a.state,'send',false);END IF;
 IF crm_care_control.answer_context_busy(t.id) THEN RETURN jsonb_build_object('status','DELIVERY_PENDING','send',false);END IF;
 BEGIN
  context:=crm_care_control.context_core(p_company,t.id);
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN reason:='CONTEXT_UNAVAILABLE';END;
 IF r.state<>'DRAFT' OR r.result->>'action' IS DISTINCT FROM 'ANSWER' OR r.expires_at<=clock_timestamp()
  OR rt.authorization_hash IS DISTINCT FROM md5((auth->'runtime')::text) OR md5(context::text) IS DISTINCT FROM r.context_hash THEN reason:='DRAFT_STALE';END IF;
 SELECT e INTO entry FROM jsonb_array_elements(context->'entries') e WHERE e->>'entryId'=r.result->>'entryId';
 IF entry IS NULL OR entry->>'version' IS DISTINCT FROM r.result->>'entryVersion'
  OR auth->'policy'->'allowed_entries'->>(r.result->>'entryId') IS DISTINCT FROM entry->>'version'
  OR (entry->'document'->>'purpose' IN('ADVICE','QUALIFY')) IS NOT TRUE
  OR r.result->>'text' IS DISTINCT FROM entry->'document'->>'answer' THEN reason:='ANSWER_NOT_AUTHORIZED';END IF;
 IF coalesce(length(r.result->>'text'),0) NOT BETWEEN 1 AND 2000 THEN reason:='ANSWER_LENGTH';END IF;
 SELECT * INTO m FROM public.crm_care_messages WHERE thread_id=t.id AND direction='inbound' ORDER BY sent_at DESC,id DESC LIMIT 1;
 authorized:=clock_timestamp();
 IF m.id IS DISTINCT FROM rt.inbound_id OR m.intent<>'MESSAGE' OR length(btrim(m.content))=0
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(context->'messages') x WHERE x->>'direction'='inbound' AND x->'attachments'<>'[]'::jsonb) THEN reason:='INPUT_NEEDS_REVIEW';END IF;
 IF m.sent_at>authorized OR m.sent_at+interval '24 hours'<=authorized THEN reason:='RESPONSE_WINDOW_CLOSED';END IF;
 SELECT encode(sha256(convert_to(access_token,'UTF8')),'hex') INTO credential FROM public.facebook_pages
  WHERE page_id=t.page_id AND default_company_id=p_company AND is_active IS TRUE FOR SHARE;
 IF credential IS DISTINCT FROM p_credential OR auth->'policy'->>'credential_hash' IS DISTINCT FROM p_credential THEN reason:='CREDENTIAL_CHANGED';END IF;
 IF (SELECT count(*) FROM crm_care_control.send_attempts sa WHERE sa.policy_id=p_policy AND sa.payload IS NOT NULL)>=(auth->'policy'->>'max_messages')::integer THEN reason:='POLICY_LIMIT';END IF;
 IF reason IS NULL THEN
  entry:=crm_care_control.library_view_core(p_company,(r.result->>'entryId')::uuid);
  SELECT expires_at INTO publisher_until FROM public.crm_care_library_publishers
   WHERE company_id=p_company AND user_id=(entry->>'approvedBy')::uuid FOR SHARE;
  IF entry->>'approvedReady' IS DISTINCT FROM 'true' OR entry->>'version' IS DISTINCT FROM r.result->>'entryVersion'
   OR publisher_until IS NULL OR publisher_until<=clock_timestamp() THEN reason:='SOURCE_EXPIRED';END IF;
 END IF;
 PERFORM crm_care_control.runtime_assert_live(auth->'runtime');PERFORM crm_care_control.runtime_assert_live(auth->'policy');
 IF reason IS NOT NULL THEN
  INSERT INTO crm_care_control.send_attempts(request_id,policy_id,principal_id,grant_id,company_id,page_id,thread_id,worker_id,state,reason,authority_hash,policy_snapshot)
  VALUES(p_request,p_policy,p_principal,p_grant,p_company,t.page_id,t.id,p_worker,'HELD',reason,md5(auth::text),auth->'policy') RETURNING * INTO a;
  PERFORM crm_care_control.send_handoff(t.id,p_company,t.page_id,'AI_SEND_HELD');
  RETURN jsonb_build_object('status','HELD','attemptId',a.attempt_id,'reason',reason,'send',false);
 END IF;
 deadline:=least(authorized+interval '5 seconds',r.expires_at,(auth->'runtime'->>'expires_at')::timestamptz,
  (auth->'policy'->>'expires_at')::timestamptz,(entry->'document'->>'validUntil')::timestamptz,publisher_until,m.sent_at+interval '24 hours');
 payload:=jsonb_build_object('recipient',jsonb_build_object('id',t.psid),'messaging_type','RESPONSE',
  'message',jsonb_build_object('text',r.result->>'text','metadata','VPT_CARE_SEND_V1:'||attempt::text));
 INSERT INTO crm_care_control.send_attempts(attempt_id,request_id,policy_id,principal_id,grant_id,company_id,page_id,thread_id,worker_id,state,
  authority_hash,policy_snapshot,payload,psid,app_id,graph_version,inbound_id,entry_id,entry_version,started_at,send_before)
 VALUES(attempt,p_request,p_policy,p_principal,p_grant,p_company,t.page_id,t.id,p_worker,'SENDING',md5(auth::text),auth->'policy',payload,t.psid,
  auth->'policy'->>'app_id',auth->'policy'->>'graph_version',m.id,(entry->>'entryId')::uuid,entry->>'version',authorized,deadline);
 IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'send lease expired' USING ERRCODE='40001';END IF;
 RETURN jsonb_build_object('status','CLAIMED','attemptId',attempt,'requestId',p_request,'companyId',p_company,'principalId',p_principal,
  'grantId',p_grant,'policyId',p_policy,'pageId',t.page_id,'psid',t.psid,'appId',auth->'policy'->>'app_id','graphVersion',auth->'policy'->>'graph_version',
  'authorizedAt',authorized,'sendBefore',deadline,'payload',payload);
END $$;

-- Receipt facts may arrive after revocation. Never acquire a runtime run lock
-- after the thread lock, and never use receipt processing to authorize a send.
CREATE OR REPLACE FUNCTION public.crm_care_send_result(p_attempt uuid,p_worker uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_care_control.send_attempts%ROWTYPE;mid text;bad boolean;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR(p_result->>'status' IN('ACK','UNCERTAIN')) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_result) k WHERE k NOT IN('status','recipientId','messageId','reason')) THEN RAISE EXCEPTION 'invalid send receipt' USING ERRCODE='22023';END IF;
 SELECT * INTO a FROM crm_care_control.send_attempts WHERE attempt_id=p_attempt AND worker_id=p_worker AND payload IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'send attempt unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.crm_care_threads WHERE id=a.thread_id FOR UPDATE;
 SELECT * INTO a FROM crm_care_control.send_attempts WHERE attempt_id=p_attempt FOR UPDATE;
 IF EXISTS(SELECT 1 FROM crm_care_control.send_results WHERE attempt_id=p_attempt AND result=p_result) THEN RETURN jsonb_build_object('status',a.state);END IF;
 IF p_result->>'status'='ACK' THEN
  mid:=p_result->>'messageId';
  IF jsonb_typeof(p_result->'recipientId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_result->'messageId') IS DISTINCT FROM 'string'
   OR length(mid) NOT BETWEEN 1 AND 300 OR p_result ? 'reason' THEN RAISE EXCEPTION 'invalid ACK' USING ERRCODE='22023';END IF;
  bad:=p_result->>'recipientId' IS DISTINCT FROM a.psid OR(a.ack_mid IS NOT NULL AND a.ack_mid<>mid) OR(a.echo_mid IS NOT NULL AND a.echo_mid<>mid);
  IF bad THEN
   UPDATE crm_care_control.send_attempts SET state='CONFLICT',reason='ACK_CONFLICT' WHERE attempt_id=p_attempt;
   PERFORM crm_care_control.send_handoff(a.thread_id,a.company_id,a.page_id,'AI_SEND_CONFLICT');
  ELSIF a.state<>'CONFLICT' THEN UPDATE crm_care_control.send_attempts SET state='SENT',ack_mid=mid WHERE attempt_id=p_attempt;END IF;
 ELSE
  IF(p_result->>'reason' IN('TRANSPORT_UNKNOWN','SEND_AUTHORITY_EXPIRED','WORKER_STOPPED','STALE_ATTEMPT')) IS NOT TRUE
   OR p_result ?| ARRAY['recipientId','messageId'] THEN RAISE EXCEPTION 'invalid uncertainty reason' USING ERRCODE='22023';END IF;
  UPDATE crm_care_control.send_attempts SET state='UNCERTAIN',reason=p_result->>'reason' WHERE attempt_id=p_attempt AND state='SENDING';
  IF FOUND THEN PERFORM crm_care_control.send_handoff(a.thread_id,a.company_id,a.page_id,'AI_SEND_UNCERTAIN');END IF;
 END IF;
 INSERT INTO crm_care_control.send_results(attempt_id,result) VALUES(p_attempt,p_result);
 RETURN jsonb_build_object('status',(SELECT state FROM crm_care_control.send_attempts WHERE attempt_id=p_attempt));
END $$;
CREATE OR REPLACE FUNCTION public.crm_care_send_recover(p_company uuid,p_page text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_care_control.send_attempts%ROWTYPE;n integer:=0;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_company IS NULL OR(p_page~'^[0-9]{1,32}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid recovery scope' USING ERRCODE='22023';END IF;
 -- Match signed ingress Page/PSID order when retaining multiple thread locks.
 FOR a IN SELECT pending.* FROM crm_care_control.send_attempts pending JOIN public.crm_care_threads t ON t.id=pending.thread_id
  WHERE pending.company_id=p_company AND pending.page_id=p_page AND pending.started_at<clock_timestamp()-interval '1 minute'
  AND(pending.state='SENDING' OR(pending.state='SENT' AND pending.echo_mid IS NULL AND pending.reason IS DISTINCT FROM 'ECHO_MISSING'))
  ORDER BY t.page_id,t.psid,pending.attempt_id LIMIT 10 LOOP
  IF a.state='SENDING' THEN PERFORM public.crm_care_send_result(a.attempt_id,a.worker_id,jsonb_build_object('status','UNCERTAIN','reason','STALE_ATTEMPT'));
  ELSE
   PERFORM 1 FROM public.crm_care_threads WHERE id=a.thread_id FOR UPDATE;
   UPDATE crm_care_control.send_attempts SET reason='ECHO_MISSING' WHERE attempt_id=a.attempt_id AND state='SENT' AND echo_mid IS NULL;
   IF FOUND THEN PERFORM crm_care_control.send_handoff(a.thread_id,p_company,p_page,'AI_ECHO_MISSING');END IF;
  END IF;n:=n+1;
 END LOOP;RETURN n;
END $$;

DO $$ BEGIN
 IF to_regprocedure('crm_survey_control.recognize_echo_before_care_answer(jsonb,uuid,uuid,uuid)') IS NULL THEN
  ALTER FUNCTION crm_survey_control.recognize_echo(jsonb,uuid,uuid,uuid) RENAME TO recognize_echo_before_care_answer;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION crm_survey_control.recognize_echo(p_event jsonb,p_message uuid,p_thread uuid,p_company uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_care_control.send_attempts%ROWTYPE;known boolean:=false;
BEGIN
 IF coalesce(p_event->>'echoMetadata','') NOT LIKE 'VPT_CARE_SEND_V1:%' THEN RETURN crm_survey_control.recognize_echo_before_care_answer(p_event,p_message,p_thread,p_company);END IF;
 SELECT * INTO a FROM crm_care_control.send_attempts WHERE thread_id=p_thread AND company_id=p_company AND page_id=p_event->>'pageId'
  AND psid=p_event->>'psid' AND app_id=p_event->>'echoAppId' AND payload->'message'->>'metadata'=p_event->>'echoMetadata' FOR UPDATE;
 IF FOUND THEN
  known:=a.state IN('SENDING','SENT','UNCERTAIN') AND p_event->>'content'=a.payload->'message'->>'text' AND p_event->'attachments'='[]'::jsonb
   AND(p_event->>'sentAt')::timestamptz>=date_trunc('milliseconds',a.started_at);
  IF NOT known OR(a.ack_mid IS NOT NULL AND a.ack_mid<>p_event->>'mid') OR(a.echo_mid IS NOT NULL AND a.echo_mid<>p_event->>'mid') THEN
   known:=false;UPDATE crm_care_control.send_attempts SET state='CONFLICT',reason='ECHO_CONFLICT' WHERE attempt_id=a.attempt_id;
  ELSE UPDATE crm_care_control.send_attempts SET echo_mid=p_event->>'mid' WHERE attempt_id=a.attempt_id;END IF;
 END IF;
 INSERT INTO crm_survey_control.dispatch_echoes(message_id,proof,known) VALUES(p_message,
  jsonb_build_object('appId',p_event->'echoAppId','metadata',p_event->'echoMetadata','payloadHash',p_event->'payloadHash'),coalesce(known,false));
 RETURN coalesce(known,false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_receive(p_events jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb;page public.facebook_pages%ROWTYPE;t public.crm_care_threads%ROWTYPE;m public.crm_care_messages%ROWTYPE;target jsonb;next_mode text;n integer:=0;event_time timestamptz;own_echo boolean;echo_proof jsonb;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid care batch' USING ERRCODE='22023';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) ORDER BY value->>'pageId',value->>'psid',value->>'mid' LOOP
  IF (e->>'pageId'~'^[0-9]{1,32}$') IS NOT TRUE OR (e->>'psid'~'^[0-9]{1,32}$') IS NOT TRUE OR e->>'pageId'=e->>'psid'
   OR jsonb_typeof(e->'mid') IS DISTINCT FROM 'string' OR length(e->>'mid') NOT BETWEEN 1 AND 300
   OR (e->>'direction' IN ('inbound','outbound')) IS NOT TRUE OR (e->>'intent' IN ('MESSAGE','REQUEST_HUMAN','OPT_OUT','OUTBOUND_ECHO')) IS NOT TRUE
   OR ((e->>'direction'='outbound') IS DISTINCT FROM (e->>'intent'='OUTBOUND_ECHO'))
   OR jsonb_typeof(e->'content') IS DISTINCT FROM 'string' OR length(e->>'content')>20000
   OR jsonb_typeof(e->'attachments') IS DISTINCT FROM 'array' OR jsonb_array_length(e->'attachments')>20
   OR (e->>'payloadHash'~'^[a-f0-9]{64}$') IS NOT TRUE OR e->>'sentAt' IS NULL
   THEN RAISE EXCEPTION 'invalid care event' USING ERRCODE='22023';END IF;
  event_time:=(e->>'sentAt')::timestamptz;
  IF event_time<'2004-01-01'::timestamptz OR event_time>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid event time' USING ERRCODE='22023';END IF;
  SELECT * INTO page FROM public.facebook_pages WHERE page_id=e->>'pageId' FOR SHARE;
  IF NOT FOUND OR page.is_active IS DISTINCT FROM true OR page.default_company_id IS NULL THEN RAISE EXCEPTION 'care Page denied' USING ERRCODE='42501';END IF;
  INSERT INTO public.crm_care_threads(company_id,page_id,psid) VALUES(page.default_company_id,e->>'pageId',e->>'psid') ON CONFLICT(page_id,psid) DO NOTHING;
  SELECT * INTO t FROM public.crm_care_threads WHERE page_id=e->>'pageId' AND psid=e->>'psid' FOR UPDATE;
  IF t.company_id IS DISTINCT FROM page.default_company_id THEN RAISE EXCEPTION 'care thread cannot transfer company' USING ERRCODE='42501';END IF;
  target:=public.crm_care_target(t.id);
  SELECT * INTO m FROM public.crm_care_messages WHERE page_id=t.page_id AND provider_mid=e->>'mid';
  IF FOUND THEN
   IF m.thread_id IS DISTINCT FROM t.id OR m.payload_hash IS DISTINCT FROM e->>'payloadHash' THEN RAISE EXCEPTION 'conflicting care message' USING ERRCODE='23505';END IF;
   IF m.direction='outbound' THEN
    SELECT proof INTO echo_proof FROM crm_survey_control.dispatch_echoes WHERE message_id=m.id;
    IF FOUND AND echo_proof IS DISTINCT FROM jsonb_build_object('appId',e->'echoAppId','metadata',e->'echoMetadata','payloadHash',e->'payloadHash') THEN
     RAISE EXCEPTION 'conflicting echo replay' USING ERRCODE='23505';END IF;
   END IF;
   n:=n+1;CONTINUE;
  END IF;
  INSERT INTO public.crm_care_messages(thread_id,page_id,provider_mid,direction,intent,content,attachments,sent_at,payload_hash)
  VALUES(t.id,t.page_id,e->>'mid',e->>'direction',e->>'intent',e->>'content',e->'attachments',event_time,e->>'payloadHash') RETURNING * INTO m;
  own_echo:=false;
  IF m.intent='OUTBOUND_ECHO' THEN own_echo:=crm_survey_control.recognize_echo(e,m.id,t.id,t.company_id);END IF;
  next_mode:=CASE WHEN t.mode='OPTED_OUT' OR m.intent='OPT_OUT' THEN 'OPTED_OUT'
   WHEN m.intent='OUTBOUND_ECHO' AND NOT own_echo AND t.mode<>'HUMAN_ACTIVE' THEN 'HUMAN_REQUESTED'
   WHEN m.intent='REQUEST_HUMAN' AND t.mode<>'HUMAN_ACTIVE' THEN 'HUMAN_REQUESTED' ELSE t.mode END;
  UPDATE public.crm_care_threads SET mode=next_mode,revision=revision+1,
   reason=CASE WHEN m.intent<>'MESSAGE' AND NOT own_echo AND t.mode NOT IN ('OPTED_OUT','HUMAN_ACTIVE') THEN m.intent ELSE reason END,
   human_deadline=CASE WHEN next_mode='HUMAN_REQUESTED' AND m.intent IN ('REQUEST_HUMAN','OUTBOUND_ECHO') AND NOT own_echo THEN least(human_deadline,public.crm_care_human_deadline(least(event_time,clock_timestamp()))) WHEN next_mode IN ('HUMAN_ACTIVE','OPTED_OUT') THEN NULL ELSE human_deadline END,
   last_inbound_at=CASE WHEN m.direction='inbound' THEN greatest(last_inbound_at,event_time) ELSE last_inbound_at END,
   last_message_at=greatest(last_message_at,event_time) WHERE id=t.id;
  INSERT INTO public.crm_care_events(thread_id,company_id,source_message_id,action,previous_mode,result)
  VALUES(t.id,t.company_id,m.id,CASE WHEN own_echo AND coalesce(e->>'echoMetadata','') LIKE 'VPT_CARE_SEND_V1:%' THEN 'CARE_OWN_ECHO' WHEN own_echo THEN 'SURVEY_OWN_ECHO' ELSE m.intent END,t.mode,jsonb_build_object('mode',next_mode,'ownerId',target->'ownerId','routingReady',target->'routingReady'));
  n:=n+1;
 END LOOP;RETURN n;
END $$;

CREATE OR REPLACE FUNCTION crm_care_control.context_core(p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE care jsonb;entry jsonb;entries jsonb:='[]';eid uuid;body jsonb;n integer:=0;
BEGIN
 care:=crm_care_control.thread_view_core(p_company,p_thread);
 IF crm_care_control.answer_context_busy(p_thread) THEN RAISE EXCEPTION 'outbound transcript awaits reconciliation' USING ERRCODE='42501';END IF;
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
  WHERE t.company_id=p_company AND t.page_id=p_page AND t.mode='WAITING' AND NOT crm_care_control.answer_context_busy(t.id)
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
 IF crm_care_control.answer_context_busy(p_thread) THEN
  PERFORM crm_care_control.runtime_assert_live(auth);
  RETURN jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'threadId',p_thread,'requestId',p_request,'invoke',false,'state','DELIVERY_PENDING','send',false);
 END IF;
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
  'runtimeResult',t.result,'send',false,'delivery',(SELECT jsonb_build_object('attemptId',a.attempt_id,'state',a.state,'reason',a.reason,'acknowledged',a.ack_mid IS NOT NULL,'echoObserved',a.echo_mid IS NOT NULL,'startedAt',a.started_at,'sendBefore',a.send_before) FROM crm_care_control.send_attempts a WHERE a.request_id=p_request));
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_care_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_care_send_candidates(uuid,uuid,uuid,uuid),public.crm_care_send_claim(uuid,uuid,uuid,uuid,uuid,uuid,text),
 public.crm_care_send_result(uuid,uuid,jsonb),public.crm_care_send_recover(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_send_candidates(uuid,uuid,uuid,uuid),public.crm_care_send_claim(uuid,uuid,uuid,uuid,uuid,uuid,text),
 public.crm_care_send_result(uuid,uuid,jsonb),public.crm_care_send_recover(uuid,text) TO service_role;
COMMIT;
