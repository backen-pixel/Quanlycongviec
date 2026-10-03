-- Controlled Messenger survey delivery. Empty enrollment, no automatic retry.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_survey_control.dispatch_pages(
 page_id text PRIMARY KEY CHECK(page_id~'^[0-9]{1,32}$'),company_id uuid NOT NULL,
 app_id text NOT NULL CHECK(app_id~'^[0-9]{1,32}$'),graph_version text NOT NULL CHECK(graph_version~'^v[0-9]{1,3}\.0$'),
 active boolean NOT NULL DEFAULT false,release_reference text NOT NULL CHECK(length(btrim(release_reference)) BETWEEN 20 AND 2000),
 credential_hash text NOT NULL CHECK(credential_hash~'^[a-f0-9]{64}$'),
 credential_evidence text NOT NULL CHECK(length(btrim(credential_evidence)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_survey_control.dispatch_attempts(
 attempt_id uuid PRIMARY KEY,proposal_id uuid NOT NULL UNIQUE REFERENCES crm_survey_control.proposals(id),
 worker_id uuid NOT NULL,executor text NOT NULL DEFAULT 'survey-messenger-dispatch-v1',
 company_id uuid NOT NULL,thread_id uuid NOT NULL,page_id text NOT NULL,psid text NOT NULL,
 app_id text NOT NULL,graph_version text NOT NULL,enrollment_hash text NOT NULL,
 payload jsonb NOT NULL,inbound_message_id uuid NOT NULL,started_at timestamptz NOT NULL,send_before timestamptz NOT NULL,
 ack_mid text,echo_mid text,conflict boolean NOT NULL DEFAULT false,problem text
);
CREATE TABLE IF NOT EXISTS crm_survey_control.dispatch_echoes(
 message_id uuid PRIMARY KEY,proof jsonb NOT NULL,known boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_survey_control.dispatch_results(
 attempt_id uuid NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(attempt_id,result)
);
ALTER TABLE crm_survey_control.dispatch_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.dispatch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.dispatch_echoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.dispatch_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_survey_control.dispatch_pages,crm_survey_control.dispatch_attempts,crm_survey_control.dispatch_echoes,crm_survey_control.dispatch_results FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_survey_dispatch_candidates(p_page text,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_page IS NULL OR p_page !~ '^[0-9]{1,32}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN
  RAISE EXCEPTION 'invalid dispatch scope' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(x.id ORDER BY x.created_at,x.id),'[]') INTO items FROM(
  SELECT p.id,p.created_at FROM crm_survey_control.proposals p
  JOIN crm_survey_control.deliveries d ON d.proposal_id=p.id
  JOIN crm_survey_control.dispatch_pages x ON x.page_id=p.business->>'pageId' AND x.company_id=p.company_id AND x.active
  JOIN crm_survey_control.ingress_pages i ON i.page_id=x.page_id AND i.company_id=x.company_id AND i.active
  WHERE x.page_id=p_page AND p.state='OPEN' AND d.state='QUEUED'
   AND NOT EXISTS(SELECT 1 FROM crm_survey_control.proposals older JOIN crm_survey_control.deliveries od ON od.proposal_id=older.id
    WHERE older.thread_id=p.thread_id AND od.state IN ('SENDING','UNCERTAIN'))
  ORDER BY p.created_at,p.id LIMIT p_limit)x;
 RETURN items;
END $$;

-- The commit that returns this payload is the send authorization point. It is
-- returned ONCE, even if the worker loses the RPC response. No payload getter.
CREATE OR REPLACE FUNCTION public.crm_survey_dispatch_claim(p_page text,p_proposal uuid,p_worker uuid,p_credential text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p crm_survey_control.proposals%ROWTYPE;d crm_survey_control.deliveries%ROWTYPE;
 x crm_survey_control.dispatch_pages%ROWTYPE;i crm_survey_control.ingress_pages%ROWTYPE;
 incoming public.crm_care_messages%ROWTYPE;context jsonb;available jsonb;option jsonb;version text;reason text;
 authorized timestamptz;deadline timestamptz;payload jsonb;body text;current_credential text;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_worker IS NULL OR p_proposal IS NULL OR p_page IS NULL OR p_page !~ '^[0-9]{1,32}$' OR (p_credential~'^[a-f0-9]{64}$') IS NOT TRUE THEN
  RAISE EXCEPTION 'invalid dispatch command' USING ERRCODE='22023';END IF;
 SELECT * INTO p FROM crm_survey_control.proposals WHERE id=p_proposal AND business->>'pageId'=p_page;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','UNAVAILABLE');END IF;
 BEGIN
  PERFORM public.marketing_fb_intake_admin(p.actor_id,p.company_id);
  PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
  context:=crm_survey_control.context(p.actor_id,p.company_id,p.thread_id);
  PERFORM crm_survey_control.assert_ready();
  SELECT * INTO p FROM crm_survey_control.proposals WHERE id=p_proposal FOR UPDATE;
  SELECT * INTO d FROM crm_survey_control.deliveries WHERE proposal_id=p.id FOR UPDATE;
  IF p.state<>'OPEN' OR d.state<>'QUEUED' THEN RETURN jsonb_build_object('status','UNAVAILABLE');END IF;
  IF EXISTS(SELECT 1 FROM crm_survey_control.proposals older JOIN crm_survey_control.deliveries od ON od.proposal_id=older.id
   WHERE older.thread_id=p.thread_id AND od.state IN ('SENDING','UNCERTAIN')) THEN RETURN jsonb_build_object('status','PRIOR_DELIVERY_UNCERTAIN');END IF;
  SELECT * INTO x FROM crm_survey_control.dispatch_pages WHERE page_id=p_page AND company_id=p.company_id AND active FOR SHARE;
  SELECT * INTO i FROM crm_survey_control.ingress_pages WHERE page_id=p_page AND company_id=p.company_id AND active FOR SHARE;
  IF x.page_id IS NULL OR i.page_id IS NULL THEN RETURN jsonb_build_object('status','NOT_ENROLLED');END IF;
  SELECT encode(sha256(convert_to(access_token,'UTF8')),'hex') INTO current_credential FROM public.facebook_pages
   WHERE page_id=p_page AND default_company_id=p.company_id AND is_active FOR SHARE;
  IF current_credential IS DISTINCT FROM p_credential OR x.credential_hash IS DISTINCT FROM p_credential THEN
   RETURN jsonb_build_object('status','CREDENTIAL_CHANGED');END IF;
  version:=crm_survey_control.source(p.company_id,(p.business->>'staffId')::uuid,(p.business->>'regionId')::uuid);
  IF context->>'targetVersion' IS DISTINCT FROM p.target_version OR version IS DISTINCT FROM p.source_version THEN reason:='CONTEXT_CHANGED';END IF;
  available:=public.crm_survey_availability(p.actor_id,p.company_id,p.thread_id,(p.business->>'startsAt')::timestamptz,(p.business->>'endsAt')::timestamptz);
  SELECT value INTO option FROM jsonb_array_elements(available->'items') WHERE value->>'staffId'=p.business->>'staffId'
   AND (value->>'startsAt')::timestamptz=(p.business->>'startsAt')::timestamptz AND (value->>'endsAt')::timestamptz=(p.business->>'endsAt')::timestamptz;
  IF option IS NULL OR crm_survey_control.reservation_busy((p.business->>'staffId')::uuid,
   (p.business->>'startsAt')::timestamptz-make_interval(mins=>(p.business->>'bufferMinutes')::integer),
   (p.business->>'endsAt')::timestamptz+make_interval(mins=>(p.business->>'bufferMinutes')::integer)) THEN reason:='SLOT_UNAVAILABLE';END IF;
  -- Only verified inbound messages open the response window. Outgoing echoes
  -- and last_message_at can never extend it; reject future provider clocks.
  SELECT * INTO incoming FROM public.crm_care_messages WHERE thread_id=p.thread_id AND direction='inbound'
   AND sent_at<=clock_timestamp() ORDER BY sent_at DESC,id DESC LIMIT 1;
  authorized:=clock_timestamp();
  IF incoming.id IS NULL OR incoming.sent_at+interval '24 hours'<=authorized THEN reason:='RESPONSE_WINDOW_CLOSED';END IF;
  IF p.expires_at<=authorized THEN reason:='PROPOSAL_EXPIRED';END IF;
  IF reason IS NOT NULL THEN
   UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=p.id AND state='OPEN';
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(p.id,'DISPATCH_BLOCKED',jsonb_build_object('reason',reason,'workerId',p_worker));
   RETURN jsonb_build_object('status','BLOCKED','reason',reason);
  END IF;
  deadline:=least(authorized+interval '5 seconds',p.expires_at,incoming.sent_at+interval '24 hours',(option->>'sourceValidUntil')::timestamptz);
  body:='Đề xuất lịch khảo sát: '||to_char((p.business->>'startsAt')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI')
   ||' – '||to_char((p.business->>'endsAt')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI')||' (giờ Việt Nam).'
   ||E'\nNgười khảo sát: '||coalesce(p.business->>'staffName','Nhân sự khảo sát')||E'\nĐịa điểm: '||(p.business->>'location')
   ||E'\nĐây là lịch đề xuất, chưa giữ chỗ. Anh/chị chọn Xác nhận lịch; hệ thống sẽ kiểm tra lại giờ trống.';
  IF length(body)>2000 THEN RAISE EXCEPTION 'survey message too long' USING ERRCODE='22023';END IF;
  payload:=jsonb_build_object('recipient',jsonb_build_object('id',p.business->>'psid'),'messaging_type','RESPONSE',
   'message',jsonb_build_object('text',body,'metadata','VPT_SURVEY_SEND_V1:'||d.attempt_id::text,
    'quick_replies',jsonb_build_array(jsonb_build_object('content_type','text','title','Xác nhận lịch','payload','VPT_SURVEY_V1:'||p.id::text||':'||d.confirmation_token::text))));
  INSERT INTO crm_survey_control.dispatch_attempts(attempt_id,proposal_id,worker_id,company_id,thread_id,page_id,psid,app_id,graph_version,enrollment_hash,payload,inbound_message_id,started_at,send_before)
  VALUES(d.attempt_id,p.id,p_worker,p.company_id,p.thread_id,p_page,p.business->>'psid',x.app_id,x.graph_version,md5(to_jsonb(x)::text||to_jsonb(i)::text),payload,incoming.id,authorized,deadline);
  UPDATE crm_survey_control.deliveries SET state='SENDING',started_at=authorized WHERE proposal_id=p.id;
  INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(p.id,'DISPATCH_CLAIM',jsonb_build_object('workerId',p_worker,'executor','survey-messenger-dispatch-v1','sendBefore',deadline));
  IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'send authority expired' USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('status','CLAIMED','attemptId',d.attempt_id,'proposalId',p.id,'companyId',p.company_id,'pageId',p_page,
   'psid',p.business->>'psid','appId',x.app_id,'graphVersion',x.graph_version,'authorizedAt',authorized,'sendBefore',deadline,'payload',payload);
 EXCEPTION WHEN insufficient_privilege THEN
  -- Roll back partial authorization, then retire only a still-queued proposal.
  -- An unavailable first candidate must not starve the remaining queue.
  PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
  SELECT * INTO p FROM crm_survey_control.proposals WHERE id=p_proposal FOR UPDATE;
  SELECT * INTO d FROM crm_survey_control.deliveries WHERE proposal_id=p.id FOR UPDATE;
  IF p.state='OPEN' AND d.state='QUEUED' THEN
   UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=p.id;
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(p.id,'DISPATCH_BLOCKED',jsonb_build_object('reason','CURRENT_AUTHORITY_UNAVAILABLE','workerId',p_worker));
  END IF;
  RETURN jsonb_build_object('status','BLOCKED','reason','CURRENT_AUTHORITY_UNAVAILABLE');
 END;
END $$;

-- ACK is historical evidence, not renewed permission. Thread first; never
-- call booking/reconcile while holding delivery locks in reverse order.
CREATE OR REPLACE FUNCTION public.crm_survey_dispatch_result(p_attempt uuid,p_worker uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_survey_control.dispatch_attempts%ROWTYPE;d crm_survey_control.deliveries%ROWTYPE;bad boolean:=false;mid text;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR (p_result->>'status' IN ('ACK','UNCERTAIN')) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_result) k WHERE k NOT IN ('status','recipientId','messageId','reason')) THEN
  RAISE EXCEPTION 'invalid dispatch result' USING ERRCODE='22023';END IF;
 SELECT * INTO a FROM crm_survey_control.dispatch_attempts WHERE attempt_id=p_attempt AND worker_id=p_worker;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch attempt unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.crm_care_threads WHERE id=a.thread_id FOR UPDATE;
 SELECT * INTO d FROM crm_survey_control.deliveries WHERE proposal_id=a.proposal_id FOR UPDATE;
 SELECT * INTO a FROM crm_survey_control.dispatch_attempts WHERE attempt_id=p_attempt FOR UPDATE;
 IF EXISTS(SELECT 1 FROM crm_survey_control.dispatch_results WHERE attempt_id=p_attempt AND result=p_result) THEN
  RETURN jsonb_build_object('status',CASE WHEN a.conflict THEN 'CONFLICT' ELSE d.state END);
 END IF;
 IF p_result->>'status'='ACK' THEN
  mid:=p_result->>'messageId';
  IF jsonb_typeof(p_result->'recipientId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_result->'messageId') IS DISTINCT FROM 'string'
   OR length(mid) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'invalid provider receipt' USING ERRCODE='22023';END IF;
  bad:=p_result->>'recipientId' IS DISTINCT FROM a.psid OR (a.ack_mid IS NOT NULL AND a.ack_mid<>mid) OR (a.echo_mid IS NOT NULL AND a.echo_mid<>mid);
  IF bad THEN
   UPDATE crm_survey_control.dispatch_attempts SET conflict=true,problem='PROVIDER_RECEIPT_CONFLICT' WHERE attempt_id=p_attempt;
   UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=a.proposal_id AND state='OPEN';
   UPDATE public.crm_care_threads SET mode=CASE WHEN mode IN ('OPTED_OUT','HUMAN_ACTIVE') THEN mode ELSE 'HUMAN_REQUESTED' END,
    reason=CASE WHEN mode IN ('OPTED_OUT','HUMAN_ACTIVE') THEN reason ELSE 'PROVIDER_RECEIPT_CONFLICT' END,
    human_deadline=CASE WHEN mode IN ('OPTED_OUT','HUMAN_ACTIVE') THEN human_deadline ELSE least(human_deadline,public.crm_care_human_deadline(clock_timestamp())) END,revision=revision+1 WHERE id=a.thread_id;
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'DISPATCH_CONFLICT',p_result||jsonb_build_object('workerId',p_worker));
  ELSIF a.ack_mid IS NULL AND NOT a.conflict THEN
   UPDATE crm_survey_control.dispatch_attempts SET ack_mid=mid WHERE attempt_id=p_attempt;
   UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=mid,sent_at=clock_timestamp() WHERE proposal_id=a.proposal_id AND attempt_id=p_attempt AND state IN ('SENDING','UNCERTAIN');
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'DISPATCH_ACK',jsonb_build_object('workerId',p_worker,'providerMid',mid));
  END IF;
 ELSE
  IF (p_result->>'reason' IN ('TRANSPORT_UNKNOWN','SEND_AUTHORITY_EXPIRED','WORKER_STOPPED','STALE_ATTEMPT')) IS NOT TRUE THEN
   RAISE EXCEPTION 'invalid uncertainty reason' USING ERRCODE='22023';END IF;
  UPDATE crm_survey_control.deliveries SET state='UNCERTAIN' WHERE proposal_id=a.proposal_id AND attempt_id=p_attempt AND state='SENDING';
  IF FOUND THEN
   UPDATE crm_survey_control.dispatch_attempts SET problem=p_result->>'reason' WHERE attempt_id=p_attempt;
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'DISPATCH_UNCERTAIN',p_result||jsonb_build_object('workerId',p_worker));
  END IF;
 END IF;
 INSERT INTO crm_survey_control.dispatch_results(attempt_id,result) VALUES(p_attempt,p_result);
 SELECT * INTO a FROM crm_survey_control.dispatch_attempts WHERE attempt_id=p_attempt;
 SELECT * INTO d FROM crm_survey_control.deliveries WHERE proposal_id=a.proposal_id;
 RETURN jsonb_build_object('status',CASE WHEN a.conflict THEN 'CONFLICT' ELSE d.state END);
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_dispatch_recover(p_page text,p_limit integer DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_survey_control.dispatch_attempts%ROWTYPE;n integer:=0;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_page IS NULL OR p_page !~ '^[0-9]{1,32}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid dispatch recovery' USING ERRCODE='22023';END IF;
 FOR a IN SELECT pending.* FROM crm_survey_control.dispatch_attempts pending JOIN crm_survey_control.deliveries d ON d.proposal_id=pending.proposal_id
  WHERE pending.page_id=p_page AND d.state='SENDING' AND pending.started_at<clock_timestamp()-interval '1 minute' ORDER BY pending.thread_id LIMIT p_limit LOOP
  PERFORM public.crm_survey_dispatch_result(a.attempt_id,a.worker_id,jsonb_build_object('status','UNCERTAIN','reason','STALE_ATTEMPT'));n:=n+1;
 END LOOP;
 RETURN n;
END $$;

-- Invoked only for a newly persisted signed outbound message, with its thread
-- already locked. A matched echo never promotes delivery to SENT by itself.
CREATE OR REPLACE FUNCTION crm_survey_control.recognize_echo(p_event jsonb,p_message uuid,p_thread uuid,p_company uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_survey_control.dispatch_attempts%ROWTYPE;d crm_survey_control.deliveries%ROWTYPE;known boolean:=false;proof jsonb;
BEGIN
 proof:=jsonb_build_object('appId',p_event->'echoAppId','metadata',p_event->'echoMetadata','payloadHash',p_event->'payloadHash');
 SELECT * INTO a FROM crm_survey_control.dispatch_attempts WHERE thread_id=p_thread AND company_id=p_company
  AND page_id=p_event->>'pageId' AND psid=p_event->>'psid' AND app_id=p_event->>'echoAppId'
  AND payload->'message'->>'metadata'=p_event->>'echoMetadata';
 IF FOUND THEN
  SELECT * INTO d FROM crm_survey_control.deliveries WHERE proposal_id=a.proposal_id FOR UPDATE;
  SELECT * INTO a FROM crm_survey_control.dispatch_attempts WHERE attempt_id=a.attempt_id FOR UPDATE;
  known:=NOT a.conflict AND p_event->>'content'=a.payload->'message'->>'text' AND p_event->'attachments'='[]'::jsonb
   AND (p_event->>'sentAt')::timestamptz>=date_trunc('milliseconds',a.started_at)
   AND d.state IN ('SENDING','SENT','UNCERTAIN');
  IF known AND ((a.ack_mid IS NOT NULL AND a.ack_mid<>p_event->>'mid') OR (a.echo_mid IS NOT NULL AND a.echo_mid<>p_event->>'mid')) THEN
   known:=false;
   UPDATE crm_survey_control.dispatch_attempts SET conflict=true,problem='PROVIDER_ECHO_CONFLICT' WHERE attempt_id=a.attempt_id;
   UPDATE crm_survey_control.proposals SET state='REJECTED' WHERE id=a.proposal_id AND state='OPEN';
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'ECHO_CONFLICT',jsonb_build_object('providerMid',p_event->>'mid'));
  ELSIF known AND a.echo_mid IS NULL THEN
   UPDATE crm_survey_control.dispatch_attempts SET echo_mid=p_event->>'mid' WHERE attempt_id=a.attempt_id;
  END IF;
 END IF;
 INSERT INTO crm_survey_control.dispatch_echoes(message_id,proof,known) VALUES(p_message,proof,coalesce(known,false));
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
  VALUES(t.id,t.company_id,m.id,CASE WHEN own_echo THEN 'SURVEY_OWN_ECHO' ELSE m.intent END,t.mode,jsonb_build_object('mode',next_mode,'ownerId',target->'ownerId','routingReady',target->'routingReady'));
  n:=n+1;
 END LOOP;RETURN n;
END $$;


REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_survey_dispatch_candidates(text,integer),public.crm_survey_dispatch_claim(text,uuid,uuid,text),public.crm_survey_dispatch_result(uuid,uuid,jsonb),public.crm_survey_dispatch_recover(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_survey_dispatch_candidates(text,integer),public.crm_survey_dispatch_claim(text,uuid,uuid,text),public.crm_survey_dispatch_result(uuid,uuid,jsonb),public.crm_survey_dispatch_recover(text,integer) TO service_role;
COMMIT;
