-- Immutable survey proposals and the domain transaction for customer-confirmed
-- booking. Transport functions stay private until the signed ingress/dispatch
-- adapter is integrated; an operator/AI cannot assert customer confirmation.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_survey_control.proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 actor_id uuid NOT NULL, company_id uuid NOT NULL, thread_id uuid NOT NULL,
 command jsonb NOT NULL, business jsonb NOT NULL, target_version text NOT NULL,
 source_version text NOT NULL, state text NOT NULL DEFAULT 'OPEN'
  CHECK(state IN ('OPEN','SUPERSEDED','BOOKED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_survey_one_open_proposal ON crm_survey_control.proposals(thread_id) WHERE state='OPEN';
CREATE TABLE IF NOT EXISTS crm_survey_control.deliveries (
 proposal_id uuid PRIMARY KEY REFERENCES crm_survey_control.proposals(id),
 attempt_id uuid NOT NULL DEFAULT gen_random_uuid(), confirmation_token uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','SENDING','SENT','UNCERTAIN')),
 started_at timestamptz, provider_mid text, sent_at timestamptz,
 CHECK((state='SENT')=(provider_mid IS NOT NULL AND sent_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS crm_survey_control.confirmations (
 message_id uuid PRIMARY KEY, proposal_id uuid NOT NULL REFERENCES crm_survey_control.proposals(id),
 evidence jsonb NOT NULL, state text NOT NULL DEFAULT 'RECORDED'
  CHECK(state IN ('RECORDED','CONSUMED','REJECTED')), reason text, result jsonb,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS crm_survey_control.bookings (
 proposal_id uuid PRIMARY KEY REFERENCES crm_survey_control.proposals(id),
 event_id uuid NOT NULL UNIQUE, confirmation_message_id uuid NOT NULL UNIQUE,
 company_id uuid NOT NULL, thread_id uuid NOT NULL,
 result jsonb NOT NULL, booked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS crm_survey_control.handoffs (
 proposal_id uuid PRIMARY KEY REFERENCES crm_survey_control.bookings(proposal_id),
 company_id uuid NOT NULL, recipient_id uuid NOT NULL, sales_owner_id uuid NOT NULL,
 payload jsonb NOT NULL, state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACKNOWLEDGED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS crm_survey_control.proposal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid NOT NULL,
 action text NOT NULL,actor_id uuid,source_message_id uuid,result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_survey_control.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.proposal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;

-- Additional identity check missing from the legacy routing projection. The
-- Lead owns its customer relation; a conflicting Messenger contact is denied.
CREATE OR REPLACE FUNCTION crm_survey_control.context(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;target jsonb;t public.crm_care_threads%ROWTYPE;contact jsonb;lead jsonb;customer jsonb;
BEGIN
 view:=public.crm_care_read(p_actor,p_company,p_thread);
 IF view->>'mode' IS DISTINCT FROM 'WAITING' OR view->'target'->>'routingReady' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'survey care unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.crm_care_threads WHERE id=p_thread;
 SELECT to_jsonb(x) INTO contact FROM public.facebook_contacts x WHERE page_id=t.page_id AND psid=t.psid FOR SHARE;
 SELECT to_jsonb(x) INTO lead FROM public.crm_leads x WHERE id=(view->'target'->>'leadId')::uuid FOR SHARE;
 IF contact->>'lead_id' IS DISTINCT FROM lead->>'id'
  OR (contact->>'customer_id' IS NOT NULL AND contact->>'customer_id' IS DISTINCT FROM lead->>'customer_id') THEN
  RAISE EXCEPTION 'survey customer mapping conflict' USING ERRCODE='42501';END IF;
 IF lead->>'customer_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO customer FROM public.customers x WHERE id=(lead->>'customer_id')::uuid FOR SHARE;
  IF customer IS NULL OR customer->>'company_id' IS DISTINCT FROM p_company::text THEN
   RAISE EXCEPTION 'survey customer unavailable' USING ERRCODE='42501';END IF;
 END IF;
 target:=public.crm_care_target(p_thread);
 RETURN jsonb_build_object('view',view,'pageId',t.page_id,'psid',t.psid,'leadId',lead->'id','customerId',lead->'customer_id',
  'regionId',target->'regionId','ownerId',target->'ownerId',
  'targetVersion',md5(jsonb_build_object('pageId',t.page_id,'psid',t.psid,'companyId',p_company,
   'contactId',contact->'id','contactLeadId',contact->'lead_id','contactCustomerId',contact->'customer_id',
   'leadId',lead->'id','customerId',lead->'customer_id','regionId',target->'regionId','ownerId',target->'ownerId',
   'customerName',customer->'full_name','customerPhone',customer->'phone','customerEmail',customer->'email')::text));
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.source(p_company uuid,p_staff uuid,p_region uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE roster public.crm_survey_rosters%ROWTYPE;staff jsonb;enrollment jsonb;
BEGIN
 SELECT * INTO roster FROM public.crm_survey_rosters WHERE company_id=p_company AND staff_id=p_staff AND region_id=p_region FOR SHARE;
 IF NOT FOUND OR NOT roster.active OR (roster.document->>'validUntil')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'survey source unavailable' USING ERRCODE='42501';END IF;
 staff:=public.crm_survey_staff(p_company,p_staff,p_region);
 PERFORM public.marketing_fb_intake_admin(roster.confirmed_by,p_company);
 SELECT to_jsonb(x) INTO enrollment FROM crm_survey_control.crm_survey_calendar_staff x WHERE staff_id=p_staff AND company_id=p_company FOR SHARE;
 IF enrollment IS NULL THEN RAISE EXCEPTION 'survey staff not enrolled' USING ERRCODE='42501';END IF;
 RETURN md5(jsonb_build_object('roster',to_jsonb(roster),'staff',staff-'version','enrollment',enrollment)::text);
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.proposal_view(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('proposalId',p.id,'companyId',p.company_id,'threadId',p.thread_id,'state',p.state,
  'business',p.business,'expiresAt',p.expires_at,'reservationMade',p.state='BOOKED',
  'booking',b.result,'deliveryState',d.state,'customerConfirmationRequired',p.state<>'BOOKED')
 FROM crm_survey_control.proposals p JOIN crm_survey_control.deliveries d ON d.proposal_id=p.id
 LEFT JOIN crm_survey_control.bookings b ON b.proposal_id=p.id WHERE p.id=p_id
$$;

-- Preserve travel time already promised even if a later roster uses a smaller
-- buffer. A future cancellation command must explicitly release this record.
CREATE OR REPLACE FUNCTION crm_survey_control.reservation_busy(p_staff uuid,p_from timestamptz,p_to timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM crm_survey_control.bookings b JOIN crm_survey_control.proposals p ON p.id=b.proposal_id
  WHERE (p.business->>'staffId')::uuid=p_staff
  AND (p.business->>'startsAt')::timestamptz-make_interval(mins=>(p.business->>'bufferMinutes')::integer)<p_to
  AND (p.business->>'endsAt')::timestamptz+make_interval(mins=>(p.business->>'bufferMinutes')::integer)>p_from)
$$;

CREATE OR REPLACE FUNCTION public.crm_survey_propose(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb;available jsonb;option jsonb;business jsonb;version text;expires timestamptz;result jsonb;
 old crm_survey_control.proposals%ROWTYPE;created crm_survey_control.proposals%ROWTYPE;thread uuid;starts timestamptz;ends timestamptz;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR p_command->>'threadId' IS NULL OR (p_command->>'optionId'~'^[a-f0-9]{32}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'location') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'location')) NOT BETWEEN 10 AND 1000
  OR (p_command->>'startsAt'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$') IS NOT TRUE
  OR (p_command->>'endsAt'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$') IS NOT TRUE
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('threadId','optionId','startsAt','endsAt','location')) THEN
  RAISE EXCEPTION 'invalid survey proposal' USING ERRCODE='22023';END IF;
 thread:=(p_command->>'threadId')::uuid;starts:=(p_command->>'startsAt')::timestamptz;ends:=(p_command->>'endsAt')::timestamptz;
 PERFORM pg_advisory_xact_lock(hashtextextended('survey-proposal-request:'||p_request::text,0));
 SELECT * INTO old FROM crm_survey_control.proposals WHERE request_id=p_request;
 IF FOUND THEN
  IF old.actor_id IS DISTINCT FROM p_actor OR old.company_id IS DISTINCT FROM p_company OR old.command IS DISTINCT FROM p_command THEN
   RAISE EXCEPTION 'survey request reused' USING ERRCODE='23505';END IF;
  RETURN crm_survey_control.proposal_view(old.id)||jsonb_build_object('requestId',p_request,'replayed',true);
 END IF;
 context:=crm_survey_control.context(p_actor,p_company,thread);
 PERFORM crm_survey_control.assert_ready();
 available:=public.crm_survey_availability(p_actor,p_company,thread,starts,ends);
 SELECT value INTO option FROM jsonb_array_elements(available->'items') WHERE value->>'optionId'=p_command->>'optionId';
 IF option IS NULL THEN RAISE EXCEPTION 'survey option changed' USING ERRCODE='40001';END IF;
 IF crm_survey_control.reservation_busy((option->>'staffId')::uuid,starts-make_interval(mins=>(option->>'bufferMinutes')::integer),ends+make_interval(mins=>(option->>'bufferMinutes')::integer)) THEN
  RAISE EXCEPTION 'survey option changed' USING ERRCODE='40001';END IF;
 version:=crm_survey_control.source(p_company,(option->>'staffId')::uuid,(option->>'regionId')::uuid);
 expires:=least(clock_timestamp()+interval '15 minutes',starts,(option->>'sourceValidUntil')::timestamptz);
 IF expires<=clock_timestamp()+interval '1 minute' THEN RAISE EXCEPTION 'survey option too near' USING ERRCODE='40001';END IF;
 business:=jsonb_build_object('companyId',p_company,'pageId',context->'pageId','psid',context->'psid','leadId',context->'leadId','customerId',context->'customerId',
  'regionId',context->'regionId','salesOwnerId',context->'ownerId','staffId',option->'staffId','staffName',option->'staffName',
  'startsAt',option->'startsAt','endsAt',option->'endsAt','timeZone','Asia/Ho_Chi_Minh','location',btrim(p_command->>'location'),
  'bufferMinutes',option->'bufferMinutes','sourceRevision',option->'sourceRevision');
 UPDATE crm_survey_control.proposals SET state='SUPERSEDED' WHERE thread_id=thread AND state='OPEN';
 INSERT INTO crm_survey_control.proposals(request_id,actor_id,company_id,thread_id,command,business,target_version,source_version,expires_at)
 VALUES(p_request,p_actor,p_company,thread,p_command,business,context->>'targetVersion',version,expires) RETURNING * INTO created;
 INSERT INTO crm_survey_control.deliveries(proposal_id) VALUES(created.id);
 result:=crm_survey_control.proposal_view(created.id)||jsonb_build_object('requestId',p_request,'replayed',false);
 INSERT INTO crm_survey_control.proposal_events(proposal_id,action,actor_id,result) VALUES(created.id,'PROPOSE',p_actor,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_proposal_read(p_actor uuid,p_company uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p crm_survey_control.proposals%ROWTYPE;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 SELECT * INTO p FROM crm_survey_control.proposals WHERE id=p_id AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'survey proposal unavailable' USING ERRCODE='42501';END IF;
 PERFORM public.crm_care_read(p_actor,p_company,p.thread_id);
 RETURN crm_survey_control.proposal_view(p.id);
END $$;

-- Only a future signed-ingress adapter may produce these receipts. There is
-- deliberately no exposed confirmation setter, token getter or booking RPC.
CREATE TABLE IF NOT EXISTS crm_survey_control.inbound_receipts (
 message_id uuid PRIMARY KEY,proposal_id uuid NOT NULL, page_id text NOT NULL,psid text NOT NULL,
 confirmation_token uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_survey_control.inbound_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_survey_control.inbound_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_survey_control.book(p_message uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<booking>>
DECLARE proof crm_survey_control.inbound_receipts%ROWTYPE;p crm_survey_control.proposals%ROWTYPE;
 d crm_survey_control.deliveries%ROWTYPE;m public.crm_care_messages%ROWTYPE;existing crm_survey_control.bookings%ROWTYPE;
 context jsonb;availability jsonb;option jsonb;version text;result jsonb;event_id uuid:=gen_random_uuid();reason text;handoff jsonb;terminal jsonb;
BEGIN
 SELECT * INTO proof FROM crm_survey_control.inbound_receipts WHERE message_id=p_message;
 IF NOT FOUND THEN RAISE EXCEPTION 'survey confirmation unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM crm_survey_control.proposals WHERE id=proof.proposal_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'survey proposal unavailable' USING ERRCODE='42501';END IF;
 -- Lock order: current actor/company -> thread -> calendar gate -> proposal.
 -- Inbound activity revisions may change; current business target/source and
 -- sticky STOP/takeover are checked rather than a whole-transcript hash.
 PERFORM public.marketing_fb_intake_admin(p.actor_id,p.company_id);
 PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
 PERFORM public.crm_care_read(p.actor_id,p.company_id,p.thread_id);
 PERFORM crm_survey_control.assert_ready();
 SELECT * INTO p FROM crm_survey_control.proposals WHERE id=p.id FOR UPDATE;
 SELECT * INTO d FROM crm_survey_control.deliveries WHERE proposal_id=p.id FOR UPDATE;
 SELECT * INTO m FROM public.crm_care_messages WHERE id=p_message FOR SHARE;
 IF m.id IS NULL OR m.thread_id IS DISTINCT FROM p.thread_id OR m.page_id IS DISTINCT FROM proof.page_id
  OR proof.page_id IS DISTINCT FROM p.business->>'pageId' OR proof.psid IS DISTINCT FROM p.business->>'psid'
  OR m.direction IS DISTINCT FROM 'inbound' OR m.intent IS DISTINCT FROM 'MESSAGE'
  OR m.payload_hash IS DISTINCT FROM proof.payload_hash OR proof.confirmation_token IS DISTINCT FROM d.confirmation_token THEN
  RAISE EXCEPTION 'survey confirmation mismatch' USING ERRCODE='42501';END IF;
 SELECT * INTO existing FROM crm_survey_control.bookings WHERE proposal_id=p.id;
 IF FOUND THEN RETURN existing.result||jsonb_build_object('replayed',true);END IF;
 SELECT c.result INTO terminal FROM crm_survey_control.confirmations c WHERE c.message_id=p_message AND c.state='REJECTED';
 IF terminal IS NOT NULL THEN RETURN terminal||jsonb_build_object('replayed',true);END IF;
 INSERT INTO crm_survey_control.confirmations(message_id,proposal_id,evidence)
 VALUES(p_message,p.id,jsonb_build_object('pageId',proof.page_id,'psid',proof.psid,'providerMid',m.provider_mid,'payloadHash',m.payload_hash)) ON CONFLICT DO NOTHING;
 IF p.state<>'OPEN' THEN reason:='PROPOSAL_NOT_OPEN';
 ELSIF p.expires_at<=clock_timestamp() OR m.sent_at<date_trunc('milliseconds',p.created_at) OR m.sent_at>=p.expires_at THEN reason:='PROPOSAL_EXPIRED';
 ELSIF d.state<>'SENT' THEN RETURN jsonb_build_object('proposalId',p.id,'status','WAITING_FOR_DELIVERY','reservationMade',false,'replayed',false);
 -- sent_at is when the transport observed the send ACK, not proof that the
 -- customer click occurred later. A signed click may reach us before that ACK.
 ELSIF d.started_at IS NULL OR d.started_at<p.created_at OR d.started_at>clock_timestamp()
  OR d.sent_at<d.started_at OR m.sent_at<date_trunc('milliseconds',d.started_at) THEN reason:='CONFIRMATION_PRECEDES_DISPATCH';
 END IF;
 IF reason IS NULL THEN
  BEGIN
   context:=crm_survey_control.context(p.actor_id,p.company_id,p.thread_id);
   version:=crm_survey_control.source(p.company_id,(p.business->>'staffId')::uuid,(p.business->>'regionId')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN reason:='CURRENT_CONTEXT_UNAVAILABLE';END;
  IF reason IS NULL AND (context->>'targetVersion' IS DISTINCT FROM p.target_version OR version IS DISTINCT FROM p.source_version) THEN reason:='CONTEXT_CHANGED';END IF;
 END IF;
 IF reason IS NULL THEN
  availability:=public.crm_survey_availability(p.actor_id,p.company_id,p.thread_id,(p.business->>'startsAt')::timestamptz,(p.business->>'endsAt')::timestamptz);
  SELECT value INTO option FROM jsonb_array_elements(availability->'items') WHERE value->>'staffId'=p.business->>'staffId'
   AND (value->>'startsAt')::timestamptz=(p.business->>'startsAt')::timestamptz AND (value->>'endsAt')::timestamptz=(p.business->>'endsAt')::timestamptz;
  IF option IS NULL THEN reason:='SLOT_UNAVAILABLE';END IF;
  IF crm_survey_control.reservation_busy((p.business->>'staffId')::uuid,
   (p.business->>'startsAt')::timestamptz-make_interval(mins=>(p.business->>'bufferMinutes')::integer),
   (p.business->>'endsAt')::timestamptz+make_interval(mins=>(p.business->>'bufferMinutes')::integer)) THEN reason:='SLOT_UNAVAILABLE';END IF;
 END IF;
 IF reason IS NULL AND p.expires_at<=clock_timestamp() THEN reason:='PROPOSAL_EXPIRED';END IF;
 IF reason IS NOT NULL THEN
  UPDATE crm_survey_control.proposals SET state=CASE WHEN state='OPEN' THEN 'REJECTED' ELSE state END WHERE id=p.id;
  result:=jsonb_build_object('proposalId',p.id,'status','REJECTED','reason',reason,'reservationMade',false,'replayed',false);
  UPDATE crm_survey_control.confirmations SET state='REJECTED',reason=booking.reason,result=booking.result WHERE message_id=p_message;
  INSERT INTO crm_survey_control.proposal_events(proposal_id,action,source_message_id,result) VALUES(p.id,'CONFIRMATION_REJECTED',p_message,result);
  RETURN result;
 END IF;
 -- The surveyor is the only attendee. Author and Sales recipient are audit /
 -- handoff identities, not implicit busy resources in crm_events.created_by.
 INSERT INTO crm_survey_control.crm_survey_calendar_permits VALUES(txid_current(),pg_backend_pid(),event_id);
 INSERT INTO public.crm_events(id,event_type,title,location,start_time,end_time,all_day,status,lead_id,customer_id,created_by,assignee_id,company_id,module)
 VALUES(event_id,'site_visit','Khảo sát theo lịch khách xác nhận',p.business->>'location',(p.business->>'startsAt')::timestamptz,(p.business->>'endsAt')::timestamptz,
  false,'planned',(p.business->>'leadId')::uuid,(p.business->>'customerId')::uuid,NULL,(p.business->>'staffId')::uuid,p.company_id,'crm');
 INSERT INTO public.crm_event_participants(event_id,user_id,status) VALUES(event_id,(p.business->>'staffId')::uuid,'confirmed');
 DELETE FROM crm_survey_control.crm_survey_calendar_permits x WHERE x.transaction_id=txid_current() AND x.backend_pid=pg_backend_pid() AND x.event_id=booking.event_id;
 -- FK checks or triggers can wait. Expiry must still hold after all writes;
 -- an exception rolls back the event, participants, proof consumption and audit.
 IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'survey confirmation expired during commit' USING ERRCODE='40001';END IF;
 result:=jsonb_build_object('proposalId',p.id,'companyId',p.company_id,'threadId',p.thread_id,'eventId',event_id,
  'status','BOOKED_HANDOFF_PENDING','reservationMade',true,'replayed',false);
 INSERT INTO crm_survey_control.bookings(proposal_id,event_id,confirmation_message_id,company_id,thread_id,result)
 VALUES(p.id,event_id,p_message,p.company_id,p.thread_id,result);
 handoff:=jsonb_build_object('business',p.business,'eventId',event_id,'threadId',p.thread_id,'confirmationMessageId',p_message,'proposalId',p.id);
 INSERT INTO crm_survey_control.handoffs(proposal_id,company_id,recipient_id,sales_owner_id,payload)
 VALUES(p.id,p.company_id,(p.business->>'staffId')::uuid,(p.business->>'salesOwnerId')::uuid,handoff);
 INSERT INTO crm_survey_control.proposal_events(proposal_id,action,actor_id,source_message_id,result)
 VALUES(p.id,'BOOK',p.actor_id,p_message,result);
 UPDATE crm_survey_control.confirmations SET state='CONSUMED',reason=NULL,result=booking.result WHERE message_id=p_message;
 UPDATE crm_survey_control.proposals SET state='BOOKED' WHERE id=p.id;
 IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'survey confirmation expired during commit' USING ERRCODE='40001';END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_availability(p_actor uuid,p_company uuid,p_thread uuid,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;target jsonb;roster public.crm_survey_rosters%ROWTYPE;staff jsonb;slot jsonb;items jsonb:='[]';issues jsonb:='[]';busy boolean;calendar_version text;version text;
 a timestamptz;b timestamptz;buffer_mins integer;seen integer:=0;excluded integer:=0;observed timestamptz;checked_at timestamptz;region uuid;calendar_rows jsonb;calendar_inventory jsonb;event jsonb;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from<clock_timestamp()-interval '1 minute'
  OR p_to<=p_from OR p_to>p_from+interval '14 days' OR p_to>clock_timestamp()+interval '31 days' THEN RAISE EXCEPTION 'invalid survey range' USING ERRCODE='22023';END IF;
 view:=public.crm_care_read(p_actor,p_company,p_thread);target:=view->'target';
 IF view->>'mode'<>'WAITING' OR target->>'routingReady' IS DISTINCT FROM 'true' THEN
  RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'status','CARE_OR_ROUTING_UNAVAILABLE','items','[]'::jsonb,'observedAt',clock_timestamp(),'reservationMade',false,'customerConfirmationRequired',true);
 END IF;
 region:=(target->>'regionId')::uuid;
 observed:=clock_timestamp();
 -- Materialize every candidate person's occupancy in one statement snapshot.
 -- A reassignment between people cannot make both appear free in this result.
 SELECT coalesce(jsonb_object_agg(r.staff_id::text,jsonb_build_object('sourceVersion',md5(to_jsonb(r)::text),'events',cal.events)),'{}'::jsonb)
 INTO calendar_inventory FROM public.crm_survey_rosters r LEFT JOIN LATERAL(
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'start',e.start_time,'end',e.end_time,'allDay',e.all_day,'days',e.occurrence_dates) ORDER BY e.id),'[]'::jsonb) events
  FROM public.crm_events e WHERE e.status IS DISTINCT FROM 'cancelled'
   AND(e.assignee_id=r.staff_id OR e.created_by=r.staff_id OR EXISTS(SELECT 1 FROM public.crm_event_participants p WHERE p.event_id=e.id AND p.user_id=r.staff_id AND p.status IS DISTINCT FROM 'declined'))
 ) cal ON true WHERE r.company_id=p_company AND r.region_id=region;
 FOR roster IN SELECT * FROM public.crm_survey_rosters WHERE company_id=p_company AND region_id=region ORDER BY staff_id FOR SHARE LOOP
  IF NOT roster.active THEN CONTINUE;END IF;
  IF calendar_inventory->roster.staff_id::text->>'sourceVersion' IS DISTINCT FROM md5(to_jsonb(roster)::text) THEN issues:=issues||jsonb_build_array(jsonb_build_object('staffId',roster.staff_id,'reason','SOURCE_CHANGED'));CONTINUE;END IF;
  IF (roster.document->>'validUntil')::timestamptz<=clock_timestamp() THEN issues:=issues||jsonb_build_array(jsonb_build_object('staffId',roster.staff_id,'reason','SOURCE_EXPIRED'));CONTINUE;END IF;
  BEGIN
   staff:=public.crm_survey_staff(p_company,roster.staff_id,region);
   PERFORM public.marketing_fb_intake_admin(roster.confirmed_by,p_company);
  EXCEPTION WHEN insufficient_privilege THEN issues:=issues||jsonb_build_array(jsonb_build_object('staffId',roster.staff_id,'reason','STAFF_OR_SOURCE_AUTHORITY_UNAVAILABLE'));CONTINUE;END;
  -- Only busy state and an opaque fingerprint leave this function, never event PII.
  calendar_rows:=calendar_inventory->roster.staff_id::text->'events';
  calendar_version:=md5(calendar_rows::text);buffer_mins:=(roster.document->>'bufferMinutes')::integer;
  version:=md5(jsonb_build_object('roster',to_jsonb(roster),'staff',staff->'version','calendar',calendar_version,'care',view->'version')::text);
  FOR slot IN SELECT value FROM jsonb_array_elements(roster.document->'slots') ORDER BY (value->>'startsAt')::timestamptz LOOP
   a:=(slot->>'startsAt')::timestamptz;b:=(slot->>'endsAt')::timestamptz;
   IF a<p_from OR b>p_to OR a<=clock_timestamp() THEN CONTINUE;END IF;seen:=seen+1;
   IF seen>200 THEN RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'status','NARROW_RANGE_REQUIRED','items','[]'::jsonb,'observedAt',observed,'reservationMade',false,'customerConfirmationRequired',true);END IF;
   busy:=false;
   FOR event IN SELECT value FROM jsonb_array_elements(calendar_rows) LOOP
    IF public.crm_survey_event_busy((event->>'start')::timestamptz,(event->>'end')::timestamptz,(event->>'allDay')::boolean,
     CASE WHEN jsonb_typeof(event->'days')='array' THEN ARRAY(SELECT value::date FROM jsonb_array_elements_text(event->'days')) ELSE NULL END,
     a-make_interval(mins=>buffer_mins),b+make_interval(mins=>buffer_mins)) THEN busy:=true;EXIT;END IF;
   END LOOP;
   busy:=busy OR crm_survey_control.reservation_busy(roster.staff_id,a-make_interval(mins=>buffer_mins),b+make_interval(mins=>buffer_mins));
   IF busy THEN excluded:=excluded+1;CONTINUE;END IF;
   items:=items||jsonb_build_array(jsonb_build_object('optionId',md5(version||slot::text),'staffId',roster.staff_id,'staffName',staff->'staffName','regionId',region,
    'startsAt',a,'endsAt',b,'bufferMinutes',buffer_mins,'sourceRevision',roster.revision,'sourceValidUntil',roster.document->>'validUntil',
    'snapshotExpiresAt',least(observed+interval '30 seconds',(roster.document->>'validUntil')::timestamptz),'version',version));
  END LOOP;
 END LOOP;
 -- Locks or expensive source reads may outlast an observation. Never return an
 -- already expired option even though nothing here claims to reserve it.
 checked_at:=clock_timestamp();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) WHERE (value->>'snapshotExpiresAt')::timestamptz<=checked_at OR (value->>'startsAt')::timestamptz<=checked_at) THEN
  issues:=issues||jsonb_build_array(jsonb_build_object('reason','SOURCE_OR_SNAPSHOT_EXPIRED'));
 END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'startsAt',value->>'staffId'),'[]'::jsonb) INTO items FROM jsonb_array_elements(items)
 WHERE (value->>'snapshotExpiresAt')::timestamptz>checked_at AND (value->>'startsAt')::timestamptz>checked_at;
 RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'status',CASE WHEN jsonb_array_length(items)>0 THEN 'AVAILABLE_SNAPSHOT' ELSE 'NO_CONFIRMED_OPTION' END,
  'items',items,'issues',issues,'busyExcluded',excluded,'observedAt',observed,'careVersion',view->'version','reservationMade',false,'customerConfirmationRequired',true);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_survey_propose(uuid,uuid,uuid,jsonb),public.crm_survey_proposal_read(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_survey_propose(uuid,uuid,uuid,jsonb),public.crm_survey_proposal_read(uuid,uuid,uuid) TO service_role;
COMMIT;
