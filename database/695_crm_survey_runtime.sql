-- Agent survey proposals. No enrollment, customer consent or live permissions seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_survey_control.runtime_policies(
 id uuid PRIMARY KEY,principal_id uuid NOT NULL REFERENCES crm_care_control.runtime_principals(id),
 grant_id uuid NOT NULL REFERENCES crm_care_control.runtime_grants(id),company_id uuid NOT NULL,page_id text NOT NULL,
 active boolean NOT NULL DEFAULT false,authorization_id uuid NOT NULL DEFAULT gen_random_uuid(),
 starts_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 region_ids uuid[] NOT NULL CHECK(cardinality(region_ids)>0 AND array_position(region_ids,NULL) IS NULL),
 staff_ids uuid[] NOT NULL CHECK(cardinality(staff_ids)>0 AND array_position(staff_ids,NULL) IS NULL),
 horizon_days integer NOT NULL CHECK(horizon_days BETWEEN 1 AND 14),
 notice_minutes integer NOT NULL CHECK(notice_minutes BETWEEN 60 AND 10080),
 max_proposals integer NOT NULL CHECK(max_proposals BETWEEN 1 AND 10000),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_survey_control.runtime_requests(
 request_id uuid PRIMARY KEY REFERENCES crm_care_control.runtime_turns(request_id),
 policy_id uuid NOT NULL REFERENCES crm_survey_control.runtime_policies(id),authority_hash text NOT NULL,
 authority_snapshot jsonb NOT NULL,proposal_id uuid UNIQUE REFERENCES crm_survey_control.proposals(id),
 reason text,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_survey_control.runtime_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.runtime_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_survey_control.runtime_policies,crm_survey_control.runtime_requests FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS runtime_survey_policy_changed ON crm_survey_control.runtime_policies;
CREATE TRIGGER runtime_survey_policy_changed BEFORE UPDATE ON crm_survey_control.runtime_policies
 FOR EACH ROW EXECUTE FUNCTION crm_care_control.runtime_rotate_authority();

CREATE OR REPLACE FUNCTION crm_survey_control.runtime_authorize(p_principal uuid,p_company uuid,p_grant uuid,p_policy uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;p crm_survey_control.runtime_policies%ROWTYPE;
BEGIN
 auth:=crm_care_control.runtime_authorize(p_principal,p_company,p_grant);
 -- Shared authority locks: signed ingress already holds thread locks. Never
 -- take an exclusive quota/policy lock in the confirmation or receipt path.
 SELECT * INTO p FROM crm_survey_control.runtime_policies WHERE id=p_policy FOR SHARE;
 IF NOT FOUND OR p.principal_id IS DISTINCT FROM p_principal OR p.company_id IS DISTINCT FROM p_company
  OR p.grant_id IS DISTINCT FROM p_grant OR p.page_id IS DISTINCT FROM auth->>'page_id' THEN
  RAISE EXCEPTION 'survey runtime scope denied' USING ERRCODE='42501';END IF;
 PERFORM crm_care_control.runtime_assert_live(to_jsonb(p));PERFORM crm_care_control.runtime_assert_live(auth);
 RETURN jsonb_build_object('kind','AGENT','runtime',auth,'policy',to_jsonb(p));
END $$;
CREATE OR REPLACE FUNCTION crm_survey_control.assert_authority_live(p_auth jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_auth->>'kind'='AGENT' THEN
  PERFORM crm_care_control.runtime_assert_live(p_auth->'runtime');
  PERFORM crm_care_control.runtime_assert_live(p_auth->'policy');
 END IF;
END $$;
CREATE OR REPLACE FUNCTION crm_survey_control.proposal_authorize(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p crm_survey_control.proposals%ROWTYPE;x crm_survey_control.runtime_requests%ROWTYPE;
 t crm_care_control.runtime_turns%ROWTYPE;auth jsonb;
BEGIN
 SELECT * INTO p FROM crm_survey_control.proposals WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'survey unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO x FROM crm_survey_control.runtime_requests WHERE proposal_id=p_id;
 IF NOT FOUND THEN
  PERFORM public.marketing_fb_intake_admin(p.actor_id,p.company_id);RETURN jsonb_build_object('kind','HUMAN');
 END IF;
 SELECT * INTO t FROM crm_care_control.runtime_turns WHERE request_id=x.request_id;
 auth:=crm_survey_control.runtime_authorize(t.principal_id,t.company_id,t.grant_id,x.policy_id);
 IF md5(auth::text) IS DISTINCT FROM x.authority_hash OR p.actor_id IS DISTINCT FROM t.principal_id
  OR p.company_id IS DISTINCT FROM t.company_id OR p.thread_id IS DISTINCT FROM t.thread_id
  OR p.business->>'pageId' IS DISTINCT FROM t.page_id
  OR NOT (p.business->>'regionId'=ANY(ARRAY(SELECT jsonb_array_elements_text(auth->'policy'->'region_ids'))))
  OR NOT (p.business->>'staffId'=ANY(ARRAY(SELECT jsonb_array_elements_text(auth->'policy'->'staff_ids')))) THEN
  RAISE EXCEPTION 'survey authority changed' USING ERRCODE='42501';END IF;
 RETURN auth;
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.context_core(p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;target jsonb;t public.crm_care_threads%ROWTYPE;contact jsonb;lead jsonb;customer jsonb;
BEGIN
 view:=crm_care_control.thread_view_core(p_company,p_thread);
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

CREATE OR REPLACE FUNCTION crm_survey_control.context(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.marketing_fb_intake_admin(p_actor,p_company);RETURN crm_survey_control.context_core(p_company,p_thread);END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.availability_scoped_core(p_company uuid,p_thread uuid,p_from timestamptz,p_to timestamptz,p_staff_scope uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;target jsonb;roster public.crm_survey_rosters%ROWTYPE;staff jsonb;slot jsonb;items jsonb:='[]';issues jsonb:='[]';busy boolean;calendar_version text;version text;
 a timestamptz;b timestamptz;buffer_mins integer;seen integer:=0;excluded integer:=0;observed timestamptz;checked_at timestamptz;region uuid;calendar_rows jsonb;calendar_inventory jsonb;event jsonb;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from<clock_timestamp()-interval '1 minute'
  OR p_to<=p_from OR p_to>p_from+interval '14 days' OR p_to>clock_timestamp()+interval '31 days' THEN RAISE EXCEPTION 'invalid survey range' USING ERRCODE='22023';END IF;
 view:=crm_care_control.thread_view_core(p_company,p_thread);target:=view->'target';
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
 ) cal ON true WHERE r.company_id=p_company AND r.region_id=region AND(p_staff_scope IS NULL OR r.staff_id=ANY(p_staff_scope));
 FOR roster IN SELECT * FROM public.crm_survey_rosters WHERE company_id=p_company AND region_id=region AND(p_staff_scope IS NULL OR staff_id=ANY(p_staff_scope)) ORDER BY staff_id FOR SHARE LOOP
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

CREATE OR REPLACE FUNCTION crm_survey_control.availability_core(p_company uuid,p_thread uuid,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RETURN crm_survey_control.availability_scoped_core(p_company,p_thread,p_from,p_to,NULL);END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_availability(p_actor uuid,p_company uuid,p_thread uuid,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.marketing_fb_intake_admin(p_actor,p_company);RETURN crm_survey_control.availability_core(p_company,p_thread,p_from,p_to);END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.propose_scoped_core(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb,p_staff_scope uuid[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb;available jsonb;option jsonb;business jsonb;version text;expires timestamptz;result jsonb;
 old crm_survey_control.proposals%ROWTYPE;created crm_survey_control.proposals%ROWTYPE;thread uuid;starts timestamptz;ends timestamptz;
BEGIN
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
 context:=crm_survey_control.context_core(p_company,thread);
 PERFORM crm_survey_control.assert_ready();
 available:=crm_survey_control.availability_scoped_core(p_company,thread,starts,ends,p_staff_scope);
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

CREATE OR REPLACE FUNCTION crm_survey_control.propose_core(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RETURN crm_survey_control.propose_scoped_core(p_actor,p_company,p_request,p_command,NULL);END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_propose(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;safe boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current actor required' USING ERRCODE='42501';END IF;
 -- Serialize with the dispatch thread barrier. Replays only read an existing
 -- receipt; a fresh command cannot queue a replacement behind uncertain sends.
 PERFORM 1 FROM public.crm_care_threads WHERE id=(p_command->>'threadId')::uuid AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM crm_survey_control.proposals WHERE request_id=p_request)
  AND crm_survey_control.delivery_busy((p_command->>'threadId')::uuid) THEN
  RAISE EXCEPTION 'prior delivery unresolved' USING ERRCODE='40001';END IF;
 result:=crm_survey_control.propose_core(p_actor,p_company,p_request,p_command);
 SELECT scope_ready INTO safe FROM crm_survey_control.console_inventory(p_company,(result->>'threadId')::uuid) WHERE proposal_id=(result->>'proposalId')::uuid;
 IF safe IS DISTINCT FROM true THEN RAISE EXCEPTION 'proposal scope unavailable' USING ERRCODE='42501';END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.handoff_context_core(p_actor uuid,p_company uuid,p_id uuid,p_full_scope boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE is_admin boolean;row record;thread_id uuid;locked_contacts jsonb;locked_region uuid;locked_recipient uuid;recipient_member boolean;
BEGIN
 is_admin:=p_full_scope;
 SELECT b.thread_id INTO thread_id FROM crm_survey_control.bookings b WHERE b.proposal_id=p_id AND b.company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'handoff unavailable' USING ERRCODE='42501';END IF;
 -- Same thread -> calendar gate order as booking/dispatch. The gate protects
 -- participant insert/delete phantoms; no permit or calendar mutation occurs.
 PERFORM 1 FROM public.crm_care_threads WHERE id=thread_id FOR UPDATE;
 PERFORM crm_survey_control.assert_ready();
 PERFORM 1 FROM crm_survey_control.handoffs WHERE proposal_id=p_id FOR UPDATE;
 PERFORM 1 FROM public.facebook_pages fp JOIN public.crm_care_threads ct ON ct.page_id=fp.page_id WHERE ct.id=thread_id FOR SHARE OF fp;
 SELECT jsonb_agg(to_jsonb(locked)) INTO locked_contacts FROM (
  SELECT fc.* FROM public.facebook_contacts fc JOIN public.crm_care_threads ct ON ct.page_id=fc.page_id AND ct.psid=fc.psid WHERE ct.id=thread_id FOR SHARE OF fc
 ) locked;
 IF coalesce(jsonb_array_length(locked_contacts),0)<>1 THEN RAISE EXCEPTION 'handoff mapping unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.crm_leads l JOIN crm_survey_control.proposals p ON l.id=(p.business->>'leadId')::uuid WHERE p.id=p_id FOR SHARE OF l;
 PERFORM 1 FROM public.customers c JOIN public.crm_leads l ON l.customer_id=c.id JOIN crm_survey_control.proposals p ON l.id=(p.business->>'leadId')::uuid WHERE p.id=p_id FOR SHARE OF c;
 PERFORM 1 FROM public.users u JOIN crm_survey_control.handoffs h ON h.recipient_id=u.id WHERE h.proposal_id=p_id FOR SHARE OF u;
 PERFORM 1 FROM public.company_regions r JOIN crm_survey_control.proposals p ON r.id=(p.business->>'regionId')::uuid WHERE p.id=p_id FOR SHARE OF r;
 SELECT (p.business->>'regionId')::uuid,h.recipient_id INTO locked_region,locked_recipient
 FROM crm_survey_control.proposals p JOIN crm_survey_control.handoffs h ON h.proposal_id=p.id WHERE p.id=p_id;
 -- A later INSERT must not upgrade authorization from an empty locking read.
 -- Use the positive result of these exact row locks, held through commit.
 IF NOT is_admin THEN
  PERFORM 1 FROM public.user_company_regions WHERE user_id=p_actor AND region_id=locked_region FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'handoff membership unavailable' USING ERRCODE='42501';END IF;
 END IF;
 PERFORM 1 FROM public.user_company_regions WHERE user_id=locked_recipient AND region_id=locked_region FOR SHARE;
 recipient_member:=FOUND;
 SELECT * INTO row FROM crm_survey_control.handoff_inventory(p_company) i WHERE i.proposal_id=p_id;
 row.assigned:=coalesce(row.assigned,false) AND recipient_member;
 IF NOT FOUND OR NOT row.scope_ready OR (NOT is_admin AND (
  (p_actor=row.owner_id OR (p_actor=row.recipient_id AND row.assigned)) IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.user_company_regions WHERE user_id=p_actor AND region_id=row.region_id))) THEN
  RAISE EXCEPTION 'handoff scope unavailable' USING ERRCODE='42501';END IF;
 RETURN row.document||jsonb_build_object('assignmentCurrent',row.assigned,'canAcknowledge',p_actor=row.recipient_id AND row.assigned AND row.consistent AND row.document->>'state'='PENDING','aiMaySend',false);
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.handoff_context(p_actor uuid,p_company uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope boolean;BEGIN scope:=crm_survey_control.handoff_actor(p_actor,p_company);RETURN crm_survey_control.handoff_context_core(p_actor,p_company,p_id,scope);END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.book(p_message uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<booking>>
DECLARE authority jsonb; proof crm_survey_control.inbound_receipts%ROWTYPE;p crm_survey_control.proposals%ROWTYPE;
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
 authority:=crm_survey_control.proposal_authorize(p.id);
 PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
 PERFORM crm_care_control.thread_view_core(p.company_id,p.thread_id);
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
   context:=crm_survey_control.context_core(p.company_id,p.thread_id);
   version:=crm_survey_control.source(p.company_id,(p.business->>'staffId')::uuid,(p.business->>'regionId')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN reason:='CURRENT_CONTEXT_UNAVAILABLE';END;
  IF reason IS NULL AND (context->>'targetVersion' IS DISTINCT FROM p.target_version OR version IS DISTINCT FROM p.source_version) THEN reason:='CONTEXT_CHANGED';END IF;
 END IF;
 IF reason IS NULL THEN
  availability:=crm_survey_control.availability_scoped_core(p.company_id,p.thread_id,(p.business->>'startsAt')::timestamptz,(p.business->>'endsAt')::timestamptz,CASE WHEN authority->>'kind'='AGENT' THEN ARRAY[(p.business->>'staffId')::uuid] ELSE NULL END);
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
 PERFORM crm_survey_control.assert_authority_live(authority);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_dispatch_claim(p_page text,p_proposal uuid,p_worker uuid,p_credential text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE authority jsonb; p crm_survey_control.proposals%ROWTYPE;d crm_survey_control.deliveries%ROWTYPE;
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
  authority:=crm_survey_control.proposal_authorize(p.id);
  PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
  context:=crm_survey_control.context_core(p.company_id,p.thread_id);
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
  available:=crm_survey_control.availability_scoped_core(p.company_id,p.thread_id,(p.business->>'startsAt')::timestamptz,(p.business->>'endsAt')::timestamptz,CASE WHEN authority->>'kind'='AGENT' THEN ARRAY[(p.business->>'staffId')::uuid] ELSE NULL END);
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
  IF authority->>'kind'='AGENT' THEN deadline:=least(deadline,(authority->'runtime'->>'expires_at')::timestamptz,(authority->'policy'->>'expires_at')::timestamptz);END IF;
  PERFORM crm_survey_control.assert_authority_live(authority);
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
  PERFORM crm_survey_control.assert_authority_live(authority);
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

CREATE OR REPLACE FUNCTION public.crm_survey_outcome_claim(p_page text,p_outcome uuid,p_worker uuid,p_credential text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<claim>>
DECLARE authority jsonb; p crm_survey_control.proposals%ROWTYPE;o crm_survey_control.outcomes%ROWTYPE;
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
  authority:=crm_survey_control.proposal_authorize(p.id);
  PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
  context:=crm_survey_control.context_core(p.company_id,p.thread_id);
  PERFORM crm_survey_control.assert_ready();
  IF o.kind='BOOKED' THEN
   IF authority->>'kind'='AGENT' THEN handoff:=crm_survey_control.handoff_context_core(p.actor_id,p.company_id,p.id,true);
   ELSE handoff:=crm_survey_control.handoff_context(p.actor_id,p.company_id,p.id);END IF;
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
  IF authority->>'kind'='AGENT' THEN deadline:=least(deadline,(authority->'runtime'->>'expires_at')::timestamptz,(authority->'policy'->>'expires_at')::timestamptz);END IF;
  PERFORM crm_survey_control.assert_authority_live(authority);
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
  PERFORM crm_survey_control.assert_authority_live(authority);
  RETURN jsonb_build_object('status','CLAIMED','attemptId',attempt,'outcomeId',o.id,'proposalId',p.id,'companyId',p.company_id,'pageId',p_page,
   'psid',p.business->>'psid','appId',x.app_id,'graphVersion',x.graph_version,'authorizedAt',authorized,'sendBefore',deadline,'payload',payload);
 EXCEPTION WHEN insufficient_privilege THEN
  PERFORM 1 FROM public.crm_care_threads WHERE id=p.thread_id FOR UPDATE;
  UPDATE crm_survey_control.outcomes SET state='HELD',reason='CURRENT_AUTHORITY_UNAVAILABLE' WHERE id=p_outcome AND state='QUEUED';
  IF FOUND THEN INSERT INTO crm_survey_control.proposal_events(proposal_id,action,result) VALUES(p.id,'OUTCOME_HELD',jsonb_build_object('outcomeId',p_outcome,'reason','CURRENT_AUTHORITY_UNAVAILABLE','workerId',p_worker));END IF;
  RETURN jsonb_build_object('status','HELD','reason','CURRENT_AUTHORITY_UNAVAILABLE');
 END;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_runtime_begin_with_survey(p_principal uuid,p_company uuid,p_grant uuid,p_request uuid,p_thread uuid,p_worker uuid,p_survey_policy uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;reply jsonb;old crm_survey_control.runtime_requests%ROWTYPE;
BEGIN
 auth:=crm_survey_control.runtime_authorize(p_principal,p_company,p_grant,p_survey_policy);
 reply:=public.crm_care_runtime_begin(p_principal,p_company,p_grant,p_request,p_thread,p_worker);
 SELECT * INTO old FROM crm_survey_control.runtime_requests WHERE request_id=p_request;
 IF FOUND AND(old.policy_id IS DISTINCT FROM p_survey_policy OR old.authority_hash IS DISTINCT FROM md5(auth::text)) THEN
  RAISE EXCEPTION 'survey request reused' USING ERRCODE='23505';END IF;
 IF reply->>'invoke'='true' THEN
  INSERT INTO crm_survey_control.runtime_requests(request_id,policy_id,authority_hash,authority_snapshot)
  VALUES(p_request,p_survey_policy,md5(auth::text),auth);
  reply:=jsonb_set(reply,'{context,surveyProposalAllowed}',to_jsonb(coalesce(
   reply->'context'->'target'->>'regionId'=ANY(ARRAY(SELECT jsonb_array_elements_text(auth->'policy'->'region_ids'))),false)));
 END IF;
 PERFORM crm_survey_control.assert_authority_live(auth);RETURN reply;
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
   OR (p_response->>'action' IN('ANSWER','HANDOFF','SURVEY')) IS NOT TRUE
   OR jsonb_typeof(p_response->'entryId') NOT IN('null','string')
   OR jsonb_typeof(p_response->'needs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_response->'needs')>5 THEN
   RAISE EXCEPTION 'invalid model selection' USING ERRCODE='22023';END IF;
  IF p_response->>'action'='SURVEY' AND NOT EXISTS(SELECT 1 FROM crm_survey_control.runtime_requests WHERE request_id=p_request) THEN
   RAISE EXCEPTION 'survey authority required' USING ERRCODE='42501';END IF;
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
  IF p_response->>'action'='SURVEY' AND NOT (seen @> ARRAY['location','request']) THEN
   RAISE EXCEPTION 'survey needs require customer evidence' USING ERRCODE='22023';END IF;
  v_state:=CASE WHEN p_response->>'action' IN('ANSWER','SURVEY') THEN 'DRAFT' ELSE 'REVIEW' END;
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

CREATE OR REPLACE FUNCTION crm_survey_control.prepare_runtime(p_request uuid,p_auth jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<prepare_survey>>
DECLARE r crm_care_control.advisor_runs%ROWTYPE;t crm_care_control.runtime_turns%ROWTYPE;
 x crm_survey_control.runtime_requests%ROWTYPE;body jsonb;availability jsonb;option jsonb;proposal jsonb;address jsonb;ask jsonb;
 reason text;latest public.crm_care_messages%ROWTYPE;from_at timestamptz;to_at timestamptz;
BEGIN
 SELECT * INTO x FROM crm_survey_control.runtime_requests WHERE request_id=p_request;
 SELECT * INTO t FROM crm_care_control.runtime_turns WHERE request_id=p_request;
 SELECT * INTO r FROM crm_care_control.advisor_runs WHERE request_id=p_request;
 IF x.request_id IS NULL OR x.authority_hash IS DISTINCT FROM md5(p_auth::text) THEN RAISE EXCEPTION 'survey authorization changed' USING ERRCODE='42501';END IF;
 IF x.proposal_id IS NOT NULL THEN RETURN jsonb_build_object('proposalId',x.proposal_id,'reservationMade',false);END IF;
 SELECT * INTO latest FROM public.crm_care_messages WHERE thread_id=t.thread_id AND direction='inbound' ORDER BY sent_at DESC,id DESC LIMIT 1;
 SELECT value INTO address FROM jsonb_array_elements(r.result->'needs') WHERE value->>'field'='location';
 SELECT value INTO ask FROM jsonb_array_elements(r.result->'needs') WHERE value->>'field'='request';
 IF r.state<>'DRAFT' OR r.result->>'action' IS DISTINCT FROM 'SURVEY' THEN reason:='SURVEY_CONTEXT_CHANGED';
 ELSIF latest.id IS DISTINCT FROM t.inbound_id OR latest.intent<>'MESSAGE' OR latest.sent_at>clock_timestamp()
  OR latest.sent_at+interval '24 hours'<=clock_timestamp() THEN reason:='SURVEY_INPUT_CHANGED';
 ELSIF address IS NULL OR ask IS NULL OR length(btrim(address->>'quote')) NOT BETWEEN 10 AND 1000 THEN reason:='SURVEY_LOCATION_REQUIRED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(r.context->'messages') m WHERE coalesce(jsonb_array_length(m->'attachments'),0)>0) THEN reason:='SURVEY_ATTACHMENTS_REQUIRE_REVIEW';
 ELSIF NOT(r.context->'target'->>'regionId'=ANY(ARRAY(SELECT jsonb_array_elements_text(p_auth->'policy'->'region_ids')))) THEN reason:='SURVEY_REGION_DENIED';
 ELSIF EXISTS(SELECT 1 FROM crm_survey_control.bookings WHERE thread_id=t.thread_id) THEN reason:='SURVEY_ALREADY_BOOKED';
 ELSIF EXISTS(SELECT 1 FROM crm_survey_control.proposals WHERE thread_id=t.thread_id AND state='OPEN' AND expires_at>clock_timestamp()) THEN reason:='SURVEY_PROPOSAL_PENDING';
 ELSIF crm_care_control.answer_context_busy(t.thread_id) THEN reason:='SURVEY_DELIVERY_PENDING';
 ELSIF(SELECT count(*) FROM crm_survey_control.runtime_requests WHERE policy_id=x.policy_id AND proposal_id IS NOT NULL)>=(p_auth->'policy'->>'max_proposals')::integer THEN reason:='SURVEY_ALLOWANCE_EXHAUSTED';
 END IF;
 IF reason IS NULL THEN
  -- Availability and the proposal are made under the same calendar write gate.
  -- The model never supplies a staff, date, option, booking or consent flag.
  PERFORM crm_survey_control.assert_ready();
  from_at:=clock_timestamp()+make_interval(mins=>(p_auth->'policy'->>'notice_minutes')::integer);
  to_at:=least(clock_timestamp()+make_interval(days=>(p_auth->'policy'->>'horizon_days')::integer),from_at+interval '14 days');
  IF to_at<=from_at THEN reason:='SURVEY_NO_CONFIRMED_OPTION';ELSE
   availability:=crm_survey_control.availability_scoped_core(t.company_id,t.thread_id,from_at,to_at,
    ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_auth->'policy'->'staff_ids')));
   SELECT value INTO option FROM jsonb_array_elements(availability->'items')
    WHERE value->>'staffId'=ANY(ARRAY(SELECT jsonb_array_elements_text(p_auth->'policy'->'staff_ids')))
    ORDER BY (value->>'startsAt')::timestamptz,value->>'staffId' LIMIT 1;
   IF option IS NULL THEN reason:=CASE WHEN availability->>'status'='NARROW_RANGE_REQUIRED' THEN 'SURVEY_RANGE_TOO_BROAD' ELSE 'SURVEY_NO_CONFIRMED_OPTION' END;END IF;
  END IF;
 END IF;
 IF reason IS NULL THEN
  proposal:=crm_survey_control.propose_scoped_core(t.principal_id,t.company_id,gen_random_uuid(),jsonb_build_object(
   'threadId',t.thread_id,'optionId',option->>'optionId',
   'startsAt',to_char((option->>'startsAt')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'endsAt',to_char((option->>'endsAt')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'location',btrim(address->>'quote')),ARRAY[(option->>'staffId')::uuid]);
  UPDATE crm_survey_control.proposals SET expires_at=least(expires_at,(p_auth->'runtime'->>'expires_at')::timestamptz,(p_auth->'policy'->>'expires_at')::timestamptz)
   WHERE id=(proposal->>'proposalId')::uuid;
  UPDATE crm_survey_control.runtime_requests SET proposal_id=(proposal->>'proposalId')::uuid WHERE request_id=p_request;
  INSERT INTO crm_survey_control.proposal_events(proposal_id,action,actor_id,result)
   VALUES((proposal->>'proposalId')::uuid,'AI_PROPOSAL',t.principal_id,jsonb_build_object('requestId',p_request,'grantId',t.grant_id,
    'policyId',x.policy_id,'authorityHash',x.authority_hash,'locationEvidence',address,'requestEvidence',ask,'needsVerified',false));
  PERFORM crm_survey_control.assert_authority_live(p_auth);
  RETURN jsonb_build_object('proposalId',proposal->'proposalId','reservationMade',false,'customerConfirmationRequired',true);
 END IF;
 UPDATE crm_survey_control.runtime_requests SET reason=prepare_survey.reason WHERE request_id=p_request;
 RETURN jsonb_build_object('reason',reason,'reservationMade',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_runtime_finish(p_principal uuid,p_company uuid,p_grant uuid,p_request uuid,p_capability uuid,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE survey_auth jsonb;survey_result jsonb;binding crm_survey_control.runtime_requests%ROWTYPE;auth jsonb;t crm_care_control.runtime_turns%ROWTYPE;r crm_care_control.advisor_runs%ROWTYPE;view jsonb;reply jsonb;deadline timestamptz;handoff boolean:=false;
BEGIN
 auth:=crm_care_control.runtime_authorize(p_principal,p_company,p_grant);
 SELECT * INTO binding FROM crm_survey_control.runtime_requests WHERE request_id=p_request;
 IF FOUND THEN
  survey_auth:=crm_survey_control.runtime_authorize(p_principal,p_company,p_grant,binding.policy_id);
  IF md5(survey_auth::text) IS DISTINCT FROM binding.authority_hash THEN RAISE EXCEPTION 'survey authority changed' USING ERRCODE='42501';END IF;
  -- Serialize quota admission only among proposers, before run/thread locks.
  -- Booking and receipts never need this gate or an exclusive policy lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('runtime-survey-quota:'||binding.policy_id::text,0));
 END IF;
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
 IF view->>'stale'='false' AND r.result->>'action'='SURVEY' THEN
  BEGIN survey_result:=crm_survey_control.prepare_runtime(p_request,survey_auth);
  EXCEPTION WHEN insufficient_privilege OR serialization_failure OR invalid_parameter_value THEN
   survey_result:=jsonb_build_object('reason','SURVEY_CURRENT_CONTEXT_UNAVAILABLE','reservationMade',false);
   UPDATE crm_survey_control.runtime_requests SET reason='SURVEY_CURRENT_CONTEXT_UNAVAILABLE' WHERE request_id=p_request;
  END;
  handoff:=survey_result ? 'reason';
 END IF;
 IF handoff IS TRUE THEN
  deadline:=public.crm_care_human_deadline(clock_timestamp());
  UPDATE public.crm_care_threads SET mode='HUMAN_REQUESTED',reason='AI_HANDOFF',human_deadline=deadline,revision=revision+1
   WHERE id=t.thread_id AND company_id=p_company AND page_id=t.page_id AND mode='WAITING';
  IF NOT FOUND THEN RAISE EXCEPTION 'handoff context changed' USING ERRCODE='40001';END IF;
  INSERT INTO public.crm_care_events(request_id,thread_id,company_id,actor_id,action,previous_mode,result)
  VALUES(p_request,t.thread_id,p_company,p_principal,'AI_HANDOFF','WAITING',
   jsonb_build_object('principalKind','AGENT','principalId',p_principal,'grantId',p_grant,'authorizationId',auth->'authorization_id',
    'delegatedBy',auth->'delegated_by','mode','HUMAN_REQUESTED','ownerId',r.context->'target'->'ownerId','deadline',deadline,
    'needs',r.result->'needs','needsVerified',false,'reason',coalesce(r.result->>'reason',survey_result->>'reason','MODEL_HANDOFF')));
 END IF;
 reply:=jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'requestId',p_request,'threadId',t.thread_id,
  'state',r.state,'survey',survey_result,'handoff',coalesce(handoff,false),'humanDeadline',deadline,'stale',view->'stale','send',false,'replayed',false);
 UPDATE crm_care_control.runtime_turns SET result=reply,completed_at=clock_timestamp() WHERE request_id=p_request;
 IF survey_auth IS NOT NULL THEN PERFORM crm_survey_control.assert_authority_live(survey_auth);END IF;
 RETURN reply;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_send_candidates(p_principal uuid,p_company uuid,p_grant uuid,p_policy uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE auth jsonb;items jsonb;
BEGIN
 auth:=crm_care_control.send_authorize(p_principal,p_company,p_grant,p_policy);
 SELECT coalesce(jsonb_agg(x.request_id ORDER BY x.created_at,x.request_id),'[]') INTO items FROM(
  SELECT rt.request_id,rt.created_at FROM crm_care_control.runtime_turns rt JOIN crm_care_control.advisor_runs r USING(request_id)
  WHERE rt.principal_id=p_principal AND rt.grant_id=p_grant AND rt.company_id=p_company AND rt.page_id=auth->'policy'->>'page_id'
   AND r.state='DRAFT' AND r.result->>'action'='ANSWER' AND NOT EXISTS(SELECT 1 FROM crm_care_control.send_attempts a WHERE a.request_id=rt.request_id)
   AND NOT crm_care_control.answer_context_busy(rt.thread_id)
  ORDER BY rt.created_at,rt.request_id LIMIT 10)x;
 PERFORM crm_care_control.runtime_assert_live(auth->'runtime');PERFORM crm_care_control.runtime_assert_live(auth->'policy');
 RETURN jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'policyId',p_policy,'items',items,'send',false);
END $$;

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
 IF r.result->>'action'='SURVEY' THEN RETURN jsonb_build_object('status','UNAVAILABLE');END IF;
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
  WHERE t.company_id=p_company AND t.page_id=p_page AND t.mode='WAITING' AND NOT EXISTS(SELECT 1 FROM crm_survey_control.ingress_results ir WHERE ir.message_id=latest.id) AND NOT crm_care_control.answer_context_busy(t.id)
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
 IF EXISTS(SELECT 1 FROM crm_survey_control.ingress_results WHERE message_id=incoming) THEN
  PERFORM crm_care_control.runtime_assert_live(auth);
  RETURN jsonb_build_object('companyId',p_company,'principalId',p_principal,'grantId',p_grant,'threadId',p_thread,
   'requestId',p_request,'invoke',false,'state','SURVEY_CONFIRMATION_RECORDED','send',false);END IF;
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

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_care_runtime_begin_with_survey(uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_runtime_begin_with_survey(uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO service_role;
COMMIT;
