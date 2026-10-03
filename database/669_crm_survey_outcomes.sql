-- Customer outcome messages are separate from booking and staff receipts.
-- A Meta ACK is acceptance evidence, not proof the customer read the message.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_survey_control.outcome_pages(
 page_id text PRIMARY KEY,company_id uuid NOT NULL,active boolean NOT NULL DEFAULT false,
 release_reference text NOT NULL CHECK(length(btrim(release_reference)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_survey_control.outcomes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid NOT NULL REFERENCES crm_survey_control.proposals(id),
 kind text NOT NULL CHECK(kind IN ('BOOKED','NOT_BOOKED')),company_id uuid NOT NULL,thread_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','SENDING','SENT','UNCERTAIN','HELD')),
 reason text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),provider_mid text,sent_at timestamptz,
 UNIQUE(proposal_id,kind),CHECK((state='SENT')=(provider_mid IS NOT NULL AND sent_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS crm_survey_control.outcome_attempts(
 attempt_id uuid PRIMARY KEY,outcome_id uuid NOT NULL UNIQUE REFERENCES crm_survey_control.outcomes(id),
 proposal_id uuid NOT NULL,worker_id uuid NOT NULL,executor text NOT NULL DEFAULT 'survey-messenger-outcome-v1',
 company_id uuid NOT NULL,thread_id uuid NOT NULL,page_id text NOT NULL,psid text NOT NULL,
 app_id text NOT NULL,graph_version text NOT NULL,enrollment_hash text NOT NULL,
 payload jsonb NOT NULL,inbound_message_id uuid NOT NULL,started_at timestamptz NOT NULL,send_before timestamptz NOT NULL,
 ack_mid text,echo_mid text,conflict boolean NOT NULL DEFAULT false,problem text
);
CREATE TABLE IF NOT EXISTS crm_survey_control.outcome_results(
 attempt_id uuid NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(attempt_id,result)
);
ALTER TABLE crm_survey_control.outcome_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.outcome_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.outcome_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_survey_control.outcome_pages,crm_survey_control.outcomes,crm_survey_control.outcome_attempts,crm_survey_control.outcome_results FROM PUBLIC,anon,authenticated,service_role;

-- Only domain booking/confirmation writes create an intent, atomically. Ingress
-- BLOCKED/mismatch receipts never mean "not booked" and do not enter this queue.
CREATE OR REPLACE FUNCTION crm_survey_control.enqueue_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p crm_survey_control.proposals%ROWTYPE;outcome_kind text;enrolled boolean;
BEGIN
 SELECT * INTO p FROM crm_survey_control.proposals WHERE id=NEW.proposal_id;
 IF TG_TABLE_NAME='bookings' THEN outcome_kind:='BOOKED';
 ELSIF NEW.state='REJECTED' AND p.state='REJECTED'
  AND EXISTS(SELECT 1 FROM crm_survey_control.inbound_receipts WHERE message_id=NEW.message_id AND proposal_id=p.id)
  AND NOT EXISTS(SELECT 1 FROM crm_survey_control.bookings WHERE proposal_id=p.id) THEN outcome_kind:='NOT_BOOKED';
 END IF;
 IF outcome_kind IS NOT NULL THEN
  PERFORM 1 FROM crm_survey_control.outcome_pages WHERE page_id=p.business->>'pageId' AND company_id=p.company_id AND active FOR SHARE;
  enrolled:=FOUND;
  INSERT INTO crm_survey_control.outcomes(proposal_id,kind,company_id,thread_id,state,reason)
  VALUES(p.id,outcome_kind,p.company_id,p.thread_id,CASE WHEN enrolled THEN 'QUEUED' ELSE 'HELD' END,
   CASE WHEN enrolled THEN NULL ELSE 'NOT_ENROLLED_AT_OUTCOME' END) ON CONFLICT(proposal_id,kind) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_survey_outcome_booking ON crm_survey_control.bookings;
CREATE TRIGGER crm_survey_outcome_booking AFTER INSERT ON crm_survey_control.bookings FOR EACH ROW EXECUTE FUNCTION crm_survey_control.enqueue_outcome();
DROP TRIGGER IF EXISTS crm_survey_outcome_rejection ON crm_survey_control.confirmations;
CREATE TRIGGER crm_survey_outcome_rejection AFTER INSERT OR UPDATE OF state ON crm_survey_control.confirmations FOR EACH ROW EXECUTE FUNCTION crm_survey_control.enqueue_outcome();
-- No migration backfill or automatic reopening of pre-enrollment HELD intents.
-- Disabling the process flag after enrollment can leave a queued backlog; the
-- current response window, authority and calendar are rechecked before sending.

CREATE OR REPLACE FUNCTION crm_survey_control.delivery_busy(p_thread uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM crm_survey_control.proposals p JOIN crm_survey_control.deliveries d ON d.proposal_id=p.id
  WHERE p.thread_id=p_thread AND d.state IN ('SENDING','UNCERTAIN'))
 OR EXISTS(SELECT 1 FROM crm_survey_control.outcomes o WHERE o.thread_id=p_thread AND o.state IN ('SENDING','UNCERTAIN'))
$$;

CREATE OR REPLACE FUNCTION public.crm_survey_outcome_candidates(p_page text,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_page IS NULL OR p_page !~ '^[0-9]{1,32}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid outcome scope' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(x.id ORDER BY x.created_at,x.id),'[]') INTO items FROM(
  SELECT o.id,o.created_at FROM crm_survey_control.outcomes o JOIN crm_survey_control.proposals p ON p.id=o.proposal_id
  JOIN crm_survey_control.outcome_pages n ON n.page_id=p.business->>'pageId' AND n.company_id=o.company_id AND n.active
  JOIN crm_survey_control.dispatch_pages d ON d.page_id=n.page_id AND d.company_id=n.company_id AND d.active
  JOIN crm_survey_control.ingress_pages i ON i.page_id=n.page_id AND i.company_id=n.company_id AND i.active
  WHERE n.page_id=p_page AND o.state='QUEUED' AND NOT crm_survey_control.delivery_busy(o.thread_id)
  ORDER BY o.created_at,o.id LIMIT p_limit)x;
 RETURN items;
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_outcome_claim(p_page text,p_outcome uuid,p_worker uuid,p_credential text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<claim>>
DECLARE p crm_survey_control.proposals%ROWTYPE;o crm_survey_control.outcomes%ROWTYPE;
 x crm_survey_control.dispatch_pages%ROWTYPE;i crm_survey_control.ingress_pages%ROWTYPE;n crm_survey_control.outcome_pages%ROWTYPE;
 incoming public.crm_care_messages%ROWTYPE;context jsonb;handoff jsonb;reason text;current_credential text;
 authorized timestamptz;deadline timestamptz;payload jsonb;body text;attempt uuid:=gen_random_uuid();
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_worker IS NULL OR p_outcome IS NULL OR p_page IS NULL OR p_page !~ '^[0-9]{1,32}$' OR (p_credential~'^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid outcome command' USING ERRCODE='22023';END IF;
 SELECT * INTO o FROM crm_survey_control.outcomes WHERE id=p_outcome;
 SELECT * INTO p FROM crm_survey_control.proposals WHERE id=o.proposal_id AND business->>'pageId'=p_page;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','UNAVAILABLE');END IF;
 BEGIN
  PERFORM public.marketing_fb_intake_admin(p.actor_id,p.company_id);
  PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
  context:=crm_survey_control.context(p.actor_id,p.company_id,p.thread_id);
  PERFORM crm_survey_control.assert_ready();
  IF o.kind='BOOKED' THEN
   handoff:=crm_survey_control.handoff_context(p.actor_id,p.company_id,p.id);
   IF handoff->>'assignmentCurrent' IS DISTINCT FROM 'true' OR handoff->>'appointmentUnchanged' IS DISTINCT FROM 'true'
    OR handoff->>'deliveryConflict' IS DISTINCT FROM 'false' OR handoff->>'careMode' IS DISTINCT FROM 'WAITING' THEN reason:='BOOKING_CHANGED';END IF;
  END IF;
  SELECT * INTO p FROM crm_survey_control.proposals WHERE id=p.id FOR UPDATE;
  SELECT * INTO o FROM crm_survey_control.outcomes WHERE id=p_outcome FOR UPDATE;
  IF o.state<>'QUEUED' THEN RETURN jsonb_build_object('status','UNAVAILABLE');END IF;
  IF crm_survey_control.delivery_busy(p.thread_id) THEN RETURN jsonb_build_object('status','PRIOR_DELIVERY_UNCERTAIN');END IF;
  SELECT * INTO n FROM crm_survey_control.outcome_pages WHERE page_id=p_page AND company_id=p.company_id AND active FOR SHARE;
  SELECT * INTO x FROM crm_survey_control.dispatch_pages WHERE page_id=p_page AND company_id=p.company_id AND active FOR SHARE;
  SELECT * INTO i FROM crm_survey_control.ingress_pages WHERE page_id=p_page AND company_id=p.company_id AND active FOR SHARE;
  IF n.page_id IS NULL OR x.page_id IS NULL OR i.page_id IS NULL THEN RETURN jsonb_build_object('status','NOT_ENROLLED');END IF;
  SELECT encode(sha256(convert_to(access_token,'UTF8')),'hex') INTO current_credential FROM public.facebook_pages
   WHERE page_id=p_page AND default_company_id=p.company_id AND is_active FOR SHARE;
  IF current_credential IS DISTINCT FROM p_credential OR x.credential_hash IS DISTINCT FROM p_credential THEN RETURN jsonb_build_object('status','CREDENTIAL_CHANGED');END IF;
  IF context->>'targetVersion' IS DISTINCT FROM p.target_version THEN reason:='CONTEXT_CHANGED';END IF;
  IF o.kind='BOOKED' THEN
   IF p.state<>'BOOKED' OR NOT EXISTS(SELECT 1 FROM crm_survey_control.bookings b WHERE b.proposal_id=p.id AND b.company_id=p.company_id AND b.thread_id=p.thread_id) THEN reason:='BOOKING_CHANGED';END IF;
  ELSE
   IF p.state<>'REJECTED' OR EXISTS(SELECT 1 FROM crm_survey_control.bookings b WHERE b.thread_id=p.thread_id)
    OR EXISTS(SELECT 1 FROM crm_survey_control.proposals newer WHERE newer.thread_id=p.thread_id AND newer.id<>p.id AND newer.created_at>=p.created_at)
    OR NOT EXISTS(SELECT 1 FROM crm_survey_control.confirmations c WHERE c.proposal_id=p.id AND c.state='REJECTED') THEN reason:='OUTCOME_SUPERSEDED';END IF;
  END IF;
  SELECT * INTO incoming FROM public.crm_care_messages WHERE thread_id=p.thread_id AND direction='inbound'
   AND sent_at<=clock_timestamp() ORDER BY sent_at DESC,id DESC LIMIT 1;
  authorized:=clock_timestamp();
  IF incoming.id IS NULL OR incoming.sent_at+interval '24 hours'<=authorized THEN reason:='RESPONSE_WINDOW_CLOSED';END IF;
  IF (p.business->>'startsAt')::timestamptz<=authorized THEN reason:='APPOINTMENT_PASSED';END IF;
  IF reason IS NOT NULL THEN
   UPDATE crm_survey_control.outcomes SET state='HELD',reason=claim.reason WHERE id=o.id;
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(p.id,'OUTCOME_HELD',jsonb_build_object('outcomeId',o.id,'reason',reason,'workerId',p_worker));
   RETURN jsonb_build_object('status','HELD','reason',reason);
  END IF;
  -- A successful booking outlives the proposal and roster validity periods.
  deadline:=least(authorized+interval '5 seconds',incoming.sent_at+interval '24 hours',(p.business->>'startsAt')::timestamptz);
  body:=CASE WHEN o.kind='BOOKED' THEN 'Đã đặt lịch khảo sát: ' ELSE 'Yêu cầu lịch khảo sát chưa được đặt: ' END
   ||to_char((p.business->>'startsAt')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI')
   ||' – '||to_char((p.business->>'endsAt')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI')||' (giờ Việt Nam).';
  IF o.kind='BOOKED' THEN body:=body||E'\nNgười được phân công khảo sát: '||coalesce(p.business->>'staffName','Nhân sự khảo sát')||E'\nĐịa điểm: '||(p.business->>'location');
  ELSE body:=body||E'\nAnh/chị có thể nhắn thời gian khác phù hợp.';END IF;
  IF length(body)>2000 THEN RAISE EXCEPTION 'outcome message too long' USING ERRCODE='22023';END IF;
  payload:=jsonb_build_object('recipient',jsonb_build_object('id',p.business->>'psid'),'messaging_type','RESPONSE',
   'message',jsonb_build_object('text',body,'metadata','VPT_SURVEY_OUTCOME_V1:'||attempt::text));
  INSERT INTO crm_survey_control.outcome_attempts(attempt_id,outcome_id,proposal_id,worker_id,company_id,thread_id,page_id,psid,app_id,graph_version,enrollment_hash,payload,inbound_message_id,started_at,send_before)
  VALUES(attempt,o.id,p.id,p_worker,p.company_id,p.thread_id,p_page,p.business->>'psid',x.app_id,x.graph_version,md5(to_jsonb(x)::text||to_jsonb(i)::text||to_jsonb(n)::text),payload,incoming.id,authorized,deadline);
  UPDATE crm_survey_control.outcomes SET state='SENDING' WHERE id=o.id;
  INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(p.id,'OUTCOME_CLAIM',jsonb_build_object('outcomeId',o.id,'attemptId',attempt,'workerId',p_worker,'sendBefore',deadline));
  IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'send authority expired' USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('status','CLAIMED','attemptId',attempt,'outcomeId',o.id,'proposalId',p.id,'companyId',p.company_id,'pageId',p_page,
   'psid',p.business->>'psid','appId',x.app_id,'graphVersion',x.graph_version,'authorizedAt',authorized,'sendBefore',deadline,'payload',payload);
 EXCEPTION WHEN insufficient_privilege THEN
  PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
  UPDATE crm_survey_control.outcomes SET state='HELD',reason='CURRENT_AUTHORITY_UNAVAILABLE' WHERE id=p_outcome AND state='QUEUED';
  IF FOUND THEN INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(p.id,'OUTCOME_HELD',jsonb_build_object('outcomeId',p_outcome,'reason','CURRENT_AUTHORITY_UNAVAILABLE','workerId',p_worker));END IF;
  RETURN jsonb_build_object('status','HELD','reason','CURRENT_AUTHORITY_UNAVAILABLE');
 END;
END $$;

-- Existing proposal paths and outcome paths share the same thread barrier.
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
   AND NOT crm_survey_control.delivery_busy(p.thread_id)
  ORDER BY p.created_at,p.id LIMIT p_limit)x;
 RETURN items;
END $$;

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
  IF crm_survey_control.delivery_busy(p.thread_id) THEN RETURN jsonb_build_object('status','PRIOR_DELIVERY_UNCERTAIN');END IF;
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

CREATE OR REPLACE FUNCTION public.crm_survey_outcome_result(p_attempt uuid,p_worker uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_survey_control.outcome_attempts%ROWTYPE;d crm_survey_control.outcomes%ROWTYPE;bad boolean:=false;mid text;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR (p_result->>'status' IN ('ACK','UNCERTAIN')) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_result) k WHERE k NOT IN ('status','recipientId','messageId','reason')) THEN
  RAISE EXCEPTION 'invalid dispatch result' USING ERRCODE='22023';END IF;
 SELECT * INTO a FROM crm_survey_control.outcome_attempts WHERE attempt_id=p_attempt AND worker_id=p_worker;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch attempt unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.crm_care_threads WHERE id=a.thread_id FOR UPDATE;
 SELECT * INTO d FROM crm_survey_control.outcomes WHERE id=a.outcome_id FOR UPDATE;
 SELECT * INTO a FROM crm_survey_control.outcome_attempts WHERE attempt_id=p_attempt FOR UPDATE;
 IF EXISTS(SELECT 1 FROM crm_survey_control.outcome_results WHERE attempt_id=p_attempt AND result=p_result) THEN
  RETURN jsonb_build_object('status',CASE WHEN a.conflict THEN 'CONFLICT' ELSE d.state END);
 END IF;
 IF p_result->>'status'='ACK' THEN
  mid:=p_result->>'messageId';
  IF jsonb_typeof(p_result->'recipientId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_result->'messageId') IS DISTINCT FROM 'string'
   OR length(mid) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'invalid provider receipt' USING ERRCODE='22023';END IF;
  bad:=p_result->>'recipientId' IS DISTINCT FROM a.psid OR (a.ack_mid IS NOT NULL AND a.ack_mid<>mid) OR (a.echo_mid IS NOT NULL AND a.echo_mid<>mid);
  IF bad THEN
   UPDATE crm_survey_control.outcome_attempts SET conflict=true,problem='PROVIDER_RECEIPT_CONFLICT' WHERE attempt_id=p_attempt;
   UPDATE public.crm_care_threads SET mode=CASE WHEN mode IN ('OPTED_OUT','HUMAN_ACTIVE') THEN mode ELSE 'HUMAN_REQUESTED' END,
    reason=CASE WHEN mode IN ('OPTED_OUT','HUMAN_ACTIVE') THEN reason ELSE 'PROVIDER_RECEIPT_CONFLICT' END,
    human_deadline=CASE WHEN mode IN ('OPTED_OUT','HUMAN_ACTIVE') THEN human_deadline ELSE least(human_deadline,public.crm_care_human_deadline(clock_timestamp())) END,revision=revision+1 WHERE id=a.thread_id;
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'OUTCOME_CONFLICT',p_result||jsonb_build_object('workerId',p_worker));
  ELSIF a.ack_mid IS NULL AND NOT a.conflict THEN
   UPDATE crm_survey_control.outcome_attempts SET ack_mid=mid WHERE attempt_id=p_attempt;
   UPDATE crm_survey_control.outcomes SET state='SENT',provider_mid=mid,sent_at=clock_timestamp() WHERE id=a.outcome_id AND state IN ('SENDING','UNCERTAIN');
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'OUTCOME_ACK',jsonb_build_object('workerId',p_worker,'providerMid',mid));
  END IF;
 ELSE
  IF (p_result->>'reason' IN ('TRANSPORT_UNKNOWN','SEND_AUTHORITY_EXPIRED','WORKER_STOPPED','STALE_ATTEMPT')) IS NOT TRUE THEN
   RAISE EXCEPTION 'invalid uncertainty reason' USING ERRCODE='22023';END IF;
  UPDATE crm_survey_control.outcomes SET state='UNCERTAIN' WHERE id=a.outcome_id AND state='SENDING';
  IF FOUND THEN
   UPDATE crm_survey_control.outcome_attempts SET problem=p_result->>'reason' WHERE attempt_id=p_attempt;
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'OUTCOME_UNCERTAIN',p_result||jsonb_build_object('workerId',p_worker));
  END IF;
 END IF;
 INSERT INTO crm_survey_control.outcome_results(attempt_id,result) VALUES(p_attempt,p_result);
 SELECT * INTO a FROM crm_survey_control.outcome_attempts WHERE attempt_id=p_attempt;
 SELECT * INTO d FROM crm_survey_control.outcomes WHERE id=a.outcome_id;
 RETURN jsonb_build_object('status',CASE WHEN a.conflict THEN 'CONFLICT' ELSE d.state END);
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_outcome_recover(p_page text,p_limit integer DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_survey_control.outcome_attempts%ROWTYPE;n integer:=0;
BEGIN
 PERFORM crm_survey_control.require_ingress_role();
 IF p_page IS NULL OR p_page !~ '^[0-9]{1,32}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid dispatch recovery' USING ERRCODE='22023';END IF;
 FOR a IN SELECT pending.* FROM crm_survey_control.outcome_attempts pending JOIN crm_survey_control.outcomes d ON d.id=pending.outcome_id
  WHERE pending.page_id=p_page AND d.state='SENDING' AND pending.started_at<clock_timestamp()-interval '1 minute' ORDER BY pending.thread_id LIMIT p_limit LOOP
  PERFORM public.crm_survey_outcome_result(a.attempt_id,a.worker_id,jsonb_build_object('status','UNCERTAIN','reason','STALE_ATTEMPT'));n:=n+1;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.recognize_outcome_echo(p_event jsonb,p_message uuid,p_thread uuid,p_company uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_survey_control.outcome_attempts%ROWTYPE;d crm_survey_control.outcomes%ROWTYPE;known boolean:=false;proof jsonb;
BEGIN
 proof:=jsonb_build_object('appId',p_event->'echoAppId','metadata',p_event->'echoMetadata','payloadHash',p_event->'payloadHash');
 SELECT * INTO a FROM crm_survey_control.outcome_attempts WHERE thread_id=p_thread AND company_id=p_company
  AND page_id=p_event->>'pageId' AND psid=p_event->>'psid' AND app_id=p_event->>'echoAppId'
  AND payload->'message'->>'metadata'=p_event->>'echoMetadata';
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF FOUND THEN
  SELECT * INTO d FROM crm_survey_control.outcomes WHERE id=a.outcome_id FOR UPDATE;
  SELECT * INTO a FROM crm_survey_control.outcome_attempts WHERE attempt_id=a.attempt_id FOR UPDATE;
  known:=NOT a.conflict AND p_event->>'content'=a.payload->'message'->>'text' AND p_event->'attachments'='[]'::jsonb
   AND (p_event->>'sentAt')::timestamptz>=date_trunc('milliseconds',a.started_at)
   AND d.state IN ('SENDING','SENT','UNCERTAIN');
  IF known AND ((a.ack_mid IS NOT NULL AND a.ack_mid<>p_event->>'mid') OR (a.echo_mid IS NOT NULL AND a.echo_mid<>p_event->>'mid')) THEN
   known:=false;
   UPDATE crm_survey_control.outcome_attempts SET conflict=true,problem='PROVIDER_OUTCOME_ECHO_CONFLICT' WHERE attempt_id=a.attempt_id;
   INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(a.proposal_id,'OUTCOME_ECHO_CONFLICT',jsonb_build_object('providerMid',p_event->>'mid'));
  ELSIF known AND a.echo_mid IS NULL THEN
   UPDATE crm_survey_control.outcome_attempts SET echo_mid=p_event->>'mid' WHERE attempt_id=a.attempt_id;
  END IF;
 END IF;
 RETURN coalesce(known,false);
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.recognize_echo(p_event jsonb,p_message uuid,p_thread uuid,p_company uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a crm_survey_control.dispatch_attempts%ROWTYPE;d crm_survey_control.deliveries%ROWTYPE;known boolean:=false;proof jsonb;handled boolean;
BEGIN
 proof:=jsonb_build_object('appId',p_event->'echoAppId','metadata',p_event->'echoMetadata','payloadHash',p_event->'payloadHash');
 handled:=crm_survey_control.recognize_outcome_echo(p_event,p_message,p_thread,p_company);
 IF handled IS NOT NULL THEN
  INSERT INTO crm_survey_control.dispatch_echoes(message_id,proof,known) VALUES(p_message,proof,handled);
  RETURN handled;
 END IF;
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

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_survey_outcome_candidates(text,integer),public.crm_survey_outcome_claim(text,uuid,uuid,text),public.crm_survey_outcome_result(uuid,uuid,jsonb),public.crm_survey_outcome_recover(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_survey_outcome_candidates(text,integer),public.crm_survey_outcome_claim(text,uuid,uuid,text),public.crm_survey_outcome_result(uuid,uuid,jsonb),public.crm_survey_outcome_recover(text,integer) TO service_role;
COMMIT;
