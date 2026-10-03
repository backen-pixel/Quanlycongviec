-- Staff receipt of an existing booking. This never sends, books, changes a
-- calendar, resumes care or establishes that a survey has been completed.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_survey_control.handoff_receipts (
 request_id uuid PRIMARY KEY, proposal_id uuid NOT NULL UNIQUE REFERENCES crm_survey_control.handoffs(proposal_id),
 company_id uuid NOT NULL, actor_id uuid NOT NULL, command jsonb NOT NULL,
 result jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_survey_control.handoff_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_survey_control.handoff_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Explicit server identity remains required even if a legacy backup operation
-- grants all public functions. p_actor is supplied by authenticated middleware.
CREATE OR REPLACE FUNCTION crm_survey_control.handoff_actor(p_actor uuid,p_company uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u jsonb;c jsonb;t jsonb;is_admin boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server identity required' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO u FROM public.users x WHERE id=p_actor FOR SHARE;
 SELECT to_jsonb(x) INTO c FROM public.companies x WHERE id=p_company FOR SHARE;
 IF u IS NULL OR u->>'is_active' IS DISTINCT FROM 'true' OR c IS NULL OR c->>'is_active'='false' THEN RAISE EXCEPTION 'handoff actor unavailable' USING ERRCODE='42501';END IF;
 IF c->>'tenant_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO t FROM public.tenants x WHERE id=(c->>'tenant_id')::uuid FOR SHARE;
  IF t IS NULL OR t->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'handoff tenant unavailable' USING ERRCODE='42501';END IF;
 END IF;
 is_admin:=coalesce(u->>'role'='platform_admin'
  OR (u->>'company_id'=p_company::text AND u->>'role' IN ('admin','sales_admin') AND u->>'tenant_id' IS NOT DISTINCT FROM c->>'tenant_id')
  OR (u->>'role' IN ('ecosystem_admin','admin') AND u->>'company_id' IS NULL AND u->>'tenant_id' IS NOT NULL AND u->>'tenant_id'=c->>'tenant_id'),false);
 IF NOT is_admin AND (u->>'company_id' IS DISTINCT FROM p_company::text OR u->>'tenant_id' IS DISTINCT FROM c->>'tenant_id') THEN RAISE EXCEPTION 'handoff company denied' USING ERRCODE='42501';END IF;
 RETURN is_admin;
END $$;

-- One statement snapshot for list, detail and versioning. No proposer/roster
-- expiry gate: those govern new bookings, not access to existing work.
CREATE OR REPLACE FUNCTION crm_survey_control.handoff_inventory(p_company uuid)
RETURNS TABLE(proposal_id uuid,recipient_id uuid,owner_id uuid,region_id uuid,scope_ready boolean,assigned boolean,consistent boolean,version text,document jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH facts AS (
 SELECT h.*,p.business,b.event_id,b.thread_id,b.result booking_result,e.assignee_id,l.assigned_to current_owner,
  l.region_id current_region,t.mode,t.reason,t.revision,
  coalesce(b.company_id=p_company AND p.company_id=p_company AND t.company_id=p_company
   AND e.company_id=p_company AND l.company_id=p_company AND cr.company_id=p_company AND cr.is_active=true
   AND fp.default_company_id=p_company AND fp.is_active=true AND t.page_id=p.business->>'pageId' AND t.psid=p.business->>'psid'
   AND p.state='BOOKED' AND b.thread_id=p.thread_id
   AND l.id::text=p.business->>'leadId' AND l.region_id::text=p.business->>'regionId'
   AND e.lead_id=l.id AND e.customer_id IS NOT DISTINCT FROM l.customer_id
   AND l.customer_id::text IS NOT DISTINCT FROM p.business->>'customerId'
   AND (l.customer_id IS NULL OR cust.company_id=p_company)
   AND contact.n=1 AND contact.lead_id=l.id::text AND (contact.customer_id IS NULL OR contact.customer_id=l.customer_id::text),false) safe,
  coalesce(e.assignee_id=h.recipient_id AND h.recipient_id::text=p.business->>'staffId'
   AND staff.company_id=p_company AND staff.is_active=true
   AND to_jsonb(staff)->>'tenant_id' IS NOT DISTINCT FROM to_jsonb(co)->>'tenant_id'
   AND EXISTS(SELECT 1 FROM public.user_company_regions ur WHERE ur.user_id=h.recipient_id AND ur.region_id=l.region_id)
   AND EXISTS(SELECT 1 FROM public.crm_event_participants ep WHERE ep.event_id=e.id AND ep.user_id=h.recipient_id AND ep.status::text='confirmed'),false) still_assigned,
  coalesce(e.start_time=(p.business->>'startsAt')::timestamptz AND e.end_time=(p.business->>'endsAt')::timestamptz
   AND e.location=p.business->>'location' AND e.status::text='planned' AND e.event_type::text='site_visit' AND e.module='crm'
   AND e.all_day=false AND parts.n=1,false) unchanged,
  coalesce(msg.n,0) message_count,coalesce(msg.fingerprint,'') message_fingerprint,coalesce(da.conflict,false) delivery_conflict,
  jsonb_build_object('proposalId',h.proposal_id,'companyId',h.company_id,'threadId',b.thread_id,'eventId',b.event_id,
   'state',h.state,'createdAt',h.created_at,'recipientId',h.recipient_id,'recipientName',CASE WHEN staff.company_id=p_company THEN coalesce(to_jsonb(staff)->'full_name',to_jsonb(staff)->'name') ELSE p.business->'staffName' END,
   'ownerId',l.assigned_to,'regionId',l.region_id,'regionName',to_jsonb(cr)->'name',
   'leadId',l.id,'leadTitle',l.title,'requirements',to_jsonb(l)->'description',
   'customer',jsonb_build_object('id',cust.id,'name',cust.full_name,'phone',cust.phone,'email',cust.email),
   'appointment',jsonb_build_object('startsAt',e.start_time,'endsAt',e.end_time,'location',e.location,'status',e.status,'timeZone','Asia/Ho_Chi_Minh'),
   'confirmedAppointment',jsonb_build_object('startsAt',p.business->'startsAt','endsAt',p.business->'endsAt','location',p.business->'location'),
   'careMode',t.mode,'careReason',t.reason,'deliveryConflict',coalesce(da.conflict,false),
   'messageCount',coalesce(msg.n,0),'receipt',hr.result,'bookingStatus',b.result->'status') base_document,
  jsonb_build_object('handoff',to_jsonb(h),'business',p.business,'booking',to_jsonb(b),'thread',to_jsonb(t),
   'event',to_jsonb(e),'participants',parts.fingerprint,'lead',to_jsonb(l),'customer',to_jsonb(cust),'contact',contact,
   'staff',to_jsonb(staff),'region',to_jsonb(cr),'messages',msg.fingerprint,'conflict',da.conflict,'receipt',hr.result) fingerprint
 FROM crm_survey_control.handoffs h
 LEFT JOIN crm_survey_control.proposals p ON p.id=h.proposal_id
 LEFT JOIN crm_survey_control.bookings b ON b.proposal_id=h.proposal_id
 LEFT JOIN public.crm_care_threads t ON t.id=b.thread_id
 LEFT JOIN public.facebook_pages fp ON fp.page_id=t.page_id
 LEFT JOIN public.crm_leads l ON l.id=(p.business->>'leadId')::uuid
 LEFT JOIN public.customers cust ON cust.id=l.customer_id
 LEFT JOIN public.company_regions cr ON cr.id=l.region_id
 LEFT JOIN public.companies co ON co.id=h.company_id
 LEFT JOIN public.users staff ON staff.id=h.recipient_id
 LEFT JOIN public.crm_events e ON e.id=b.event_id
 LEFT JOIN crm_survey_control.handoff_receipts hr ON hr.proposal_id=h.proposal_id
 LEFT JOIN crm_survey_control.dispatch_attempts da ON da.proposal_id=h.proposal_id
 LEFT JOIN LATERAL (SELECT count(*) n,min(fc.lead_id::text) lead_id,min(to_jsonb(fc)->>'customer_id') customer_id,
   md5(coalesce(string_agg(to_jsonb(fc)::text,',' ORDER BY fc.id),'')) fingerprint
   FROM public.facebook_contacts fc WHERE fc.page_id=t.page_id AND fc.psid=t.psid) contact ON true
 LEFT JOIN LATERAL (SELECT count(*) n,md5(coalesce(string_agg(to_jsonb(ep)::text,',' ORDER BY ep.user_id),'')) fingerprint
   FROM public.crm_event_participants ep WHERE ep.event_id=e.id) parts ON true
 LEFT JOIN LATERAL (SELECT count(*) n,md5(coalesce(string_agg(to_jsonb(m)::text,',' ORDER BY m.sent_at,m.id),'')) fingerprint
   FROM public.crm_care_messages m WHERE m.thread_id=t.id) msg ON true
 WHERE h.company_id=p_company
 )
 SELECT f.proposal_id,f.recipient_id,f.current_owner,f.current_region,f.safe,f.still_assigned,f.unchanged,
  md5(f.fingerprint::text),
  CASE WHEN f.safe THEN f.base_document||jsonb_build_object('version',md5(f.fingerprint::text),'assignmentCurrent',f.still_assigned,'appointmentUnchanged',f.unchanged) ELSE NULL END
 FROM facts f;
$$;

CREATE OR REPLACE FUNCTION crm_survey_control.handoff_context(p_actor uuid,p_company uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE is_admin boolean;row record;thread_id uuid;
BEGIN
 is_admin:=crm_survey_control.handoff_actor(p_actor,p_company);
 SELECT b.thread_id INTO thread_id FROM crm_survey_control.bookings b WHERE b.proposal_id=p_id AND b.company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'handoff unavailable' USING ERRCODE='42501';END IF;
 -- Same thread -> calendar gate order as booking/dispatch. The gate protects
 -- participant insert/delete phantoms; no permit or calendar mutation occurs.
 PERFORM 1 FROM public.crm_care_threads WHERE id=thread_id FOR UPDATE;
 PERFORM crm_survey_control.assert_ready();
 PERFORM 1 FROM crm_survey_control.handoffs WHERE proposal_id=p_id FOR UPDATE;
 PERFORM 1 FROM public.facebook_pages fp JOIN public.crm_care_threads ct ON ct.page_id=fp.page_id WHERE ct.id=thread_id FOR SHARE OF fp;
 PERFORM 1 FROM public.facebook_contacts fc JOIN public.crm_care_threads ct ON ct.page_id=fc.page_id AND ct.psid=fc.psid WHERE ct.id=thread_id FOR SHARE OF fc;
 PERFORM 1 FROM public.crm_leads l JOIN crm_survey_control.proposals p ON l.id=(p.business->>'leadId')::uuid WHERE p.id=p_id FOR SHARE OF l;
 PERFORM 1 FROM public.customers c JOIN public.crm_leads l ON l.customer_id=c.id JOIN crm_survey_control.proposals p ON l.id=(p.business->>'leadId')::uuid WHERE p.id=p_id FOR SHARE OF c;
 PERFORM 1 FROM public.users u JOIN crm_survey_control.handoffs h ON h.recipient_id=u.id WHERE h.proposal_id=p_id FOR SHARE OF u;
 PERFORM 1 FROM public.company_regions r JOIN crm_survey_control.proposals p ON r.id=(p.business->>'regionId')::uuid WHERE p.id=p_id FOR SHARE OF r;
 PERFORM 1 FROM public.user_company_regions ur JOIN crm_survey_control.proposals p ON ur.region_id=(p.business->>'regionId')::uuid WHERE p.id=p_id AND ur.user_id IN (p_actor,(p.business->>'staffId')::uuid) FOR SHARE OF ur;
 SELECT * INTO row FROM crm_survey_control.handoff_inventory(p_company) i WHERE i.proposal_id=p_id;
 IF NOT FOUND OR NOT row.scope_ready OR (NOT is_admin AND (
  (p_actor=row.owner_id OR (p_actor=row.recipient_id AND row.assigned)) IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.user_company_regions WHERE user_id=p_actor AND region_id=row.region_id))) THEN
  RAISE EXCEPTION 'handoff scope unavailable' USING ERRCODE='42501';END IF;
 RETURN row.document||jsonb_build_object('canAcknowledge',p_actor=row.recipient_id AND row.assigned AND row.consistent AND row.document->>'state'='PENDING','aiMaySend',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_handoff_queue(p_actor uuid,p_company uuid,p_state text,p_after uuid DEFAULT NULL,p_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE is_admin boolean;items jsonb;counts jsonb;unavailable bigint;fingerprint text;more boolean;position integer;
BEGIN
 is_admin:=crm_survey_control.handoff_actor(p_actor,p_company);
 IF p_state NOT IN ('PENDING','ACKNOWLEDGED') OR p_state IS NULL OR (p_after IS NULL) IS DISTINCT FROM (p_version IS NULL) THEN RAISE EXCEPTION 'invalid handoff queue' USING ERRCODE='22023';END IF;
 WITH permitted AS MATERIALIZED (
  SELECT i.* FROM crm_survey_control.handoff_inventory(p_company) i
  WHERE is_admin OR (i.scope_ready AND (i.owner_id=p_actor OR (i.recipient_id=p_actor AND i.assigned))
   AND EXISTS(SELECT 1 FROM public.user_company_regions WHERE user_id=p_actor AND region_id=i.region_id))
 ), rows AS MATERIALIZED (
  SELECT i.proposal_id,coalesce(i.document->>'state',h.state) state,h.created_at,i.scope_ready,
   CASE WHEN i.scope_ready THEN i.document->'appointment' ELSE NULL END appointment,
   CASE WHEN i.scope_ready THEN i.document->'leadTitle' ELSE NULL END title,
   CASE WHEN i.scope_ready THEN i.document->'careMode' ELSE NULL END care_mode,i.version
  FROM permitted i JOIN crm_survey_control.handoffs h USING(proposal_id)
 )
 SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('proposalId',r.proposal_id,'state',r.state,'createdAt',r.created_at,'scopeReady',r.scope_ready,'appointment',r.appointment,'title',r.title,'careMode',r.care_mode) ORDER BY r.created_at,r.proposal_id),'[]'::jsonb) FROM rows r WHERE r.state=p_state),
  (SELECT jsonb_build_object('PENDING',count(*) FILTER(WHERE state='PENDING'),'ACKNOWLEDGED',count(*) FILTER(WHERE state='ACKNOWLEDGED')) FROM rows),
  (SELECT count(*) FROM rows WHERE NOT scope_ready),
  (SELECT md5(coalesce(string_agg(proposal_id::text||version,',' ORDER BY proposal_id),'')) FROM rows)
 INTO items,counts,unavailable,fingerprint;
 IF p_after IS NOT NULL THEN
  IF p_version IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'handoff queue changed' USING ERRCODE='40001';END IF;
  SELECT ord::integer INTO position FROM jsonb_array_elements(items) WITH ORDINALITY x(value,ord) WHERE value->>'proposalId'=p_after::text;
  IF position IS NULL THEN RAISE EXCEPTION 'invalid handoff queue cursor' USING ERRCODE='22023';END IF;
 ELSE position:=0;END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO items FROM jsonb_array_elements(items) WITH ORDINALITY x(value,ord) WHERE ord>position AND ord<=position+51;
 more:=jsonb_array_length(items)>50;IF more THEN items:=items-50;END IF;
 RETURN jsonb_build_object('companyId',p_company,'state',p_state,'items',items,'counts',counts,'unavailableCount',unavailable,'version',fingerprint,
  'nextAfter',CASE WHEN more THEN items->49->>'proposalId' ELSE NULL END,'observedAt',clock_timestamp(),'aiMaySend',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_handoff_read(p_actor uuid,p_company uuid,p_id uuid,p_before uuid DEFAULT NULL,p_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;messages jsonb;before_at timestamptz;more boolean;
BEGIN
 IF (p_before IS NULL) IS DISTINCT FROM (p_version IS NULL) THEN RAISE EXCEPTION 'invalid transcript cursor' USING ERRCODE='22023';END IF;
 view:=crm_survey_control.handoff_context(p_actor,p_company,p_id);
 IF p_before IS NOT NULL THEN
  IF view->>'version' IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'handoff changed' USING ERRCODE='40001';END IF;
  SELECT sent_at INTO before_at FROM public.crm_care_messages WHERE id=p_before AND thread_id=(view->>'threadId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid transcript cursor' USING ERRCODE='22023';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.sent_at DESC,m.id DESC),'[]'::jsonb) INTO messages FROM (
  SELECT id,direction,intent,content,attachments,sent_at FROM public.crm_care_messages
  WHERE thread_id=(view->>'threadId')::uuid AND (p_before IS NULL OR (sent_at,id)<(before_at,p_before)) ORDER BY sent_at DESC,id DESC LIMIT 51
 ) m;
 more:=jsonb_array_length(messages)>50;IF more THEN messages:=messages-50;END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'sent_at',value->>'id'),'[]'::jsonb) INTO messages FROM jsonb_array_elements(messages);
 RETURN view||jsonb_build_object('messages',messages,'nextBefore',CASE WHEN more THEN messages->0->>'id' ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_handoff_ack(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;old crm_survey_control.handoff_receipts%ROWTYPE;result jsonb;proposal uuid;
BEGIN
 PERFORM crm_survey_control.handoff_actor(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'proposalId' IS NULL
  OR (p_command->>'expectedVersion'~'^[a-f0-9]{32}$') IS NOT TRUE
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('proposalId','expectedVersion')) THEN RAISE EXCEPTION 'invalid handoff receipt' USING ERRCODE='22023';END IF;
 proposal:=(p_command->>'proposalId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('survey-handoff-request:'||p_request::text,0));
 view:=crm_survey_control.handoff_context(p_actor,p_company,proposal);
 IF view->>'recipientId' IS DISTINCT FROM p_actor::text OR view->>'assignmentCurrent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'only current recipient can acknowledge' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM crm_survey_control.handoff_receipts WHERE request_id=p_request;
 IF FOUND THEN
  IF old.actor_id<>p_actor OR old.company_id<>p_company OR old.command<>p_command THEN RAISE EXCEPTION 'handoff request reused' USING ERRCODE='23505';END IF;
  RETURN old.result||jsonb_build_object('replayed',true);
 END IF;
 IF view->>'version' IS DISTINCT FROM p_command->>'expectedVersion' OR view->>'canAcknowledge' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'handoff changed' USING ERRCODE='40001';END IF;
 result:=jsonb_build_object('proposalId',proposal,'companyId',p_company,'requestId',p_request,'actorId',p_actor,'state','ACKNOWLEDGED',
  'receivedVersion',p_command->>'expectedVersion','messageCount',view->'messageCount','receivedAt',clock_timestamp(),'replayed',false,'aiMaySend',false);
 INSERT INTO crm_survey_control.handoff_receipts(request_id,proposal_id,company_id,actor_id,command,result) VALUES(p_request,proposal,p_company,p_actor,p_command,result);
 UPDATE crm_survey_control.handoffs SET state='ACKNOWLEDGED' WHERE proposal_id=proposal;
 INSERT INTO crm_survey_control.proposal_events(proposal_id,action,actor_id,result) VALUES(proposal,'HANDOFF_ACK',p_actor,result);
 RETURN result;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_survey_handoff_queue(uuid,uuid,text,uuid,text),public.crm_survey_handoff_read(uuid,uuid,uuid,uuid,text),public.crm_survey_handoff_ack(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_survey_handoff_queue(uuid,uuid,text,uuid,text),public.crm_survey_handoff_read(uuid,uuid,uuid,uuid,text),public.crm_survey_handoff_ack(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
