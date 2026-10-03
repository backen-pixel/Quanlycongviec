-- Survey preparation from the canonical CRM calendar. No reservation or booking.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_survey_rosters(
 company_id uuid NOT NULL,staff_id uuid NOT NULL,region_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1,active boolean NOT NULL,document jsonb NOT NULL,
 confirmed_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(company_id,staff_id,region_id));
CREATE TABLE IF NOT EXISTS public.crm_survey_roster_events(
 request_id uuid PRIMARY KEY,company_id uuid NOT NULL,actor_id uuid NOT NULL,
 command jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.crm_survey_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_survey_roster_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_survey_rosters,public.crm_survey_roster_events FROM PUBLIC,anon,authenticated,service_role;

-- Validate current staff/region membership; caller has already established company access.
CREATE OR REPLACE FUNCTION public.crm_survey_staff(p_company uuid,p_staff uuid,p_region uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u jsonb;c jsonb;r jsonb;
BEGIN
 SELECT to_jsonb(x) INTO c FROM public.companies x WHERE id=p_company FOR SHARE;
 SELECT to_jsonb(x) INTO u FROM public.users x WHERE id=p_staff AND company_id=p_company FOR SHARE;
 SELECT to_jsonb(x) INTO r FROM public.company_regions x WHERE id=p_region AND company_id=p_company FOR SHARE;
 PERFORM 1 FROM public.user_company_regions WHERE user_id=p_staff AND region_id=p_region FOR SHARE;
 IF NOT FOUND OR u->>'is_active' IS DISTINCT FROM 'true' OR r->>'is_active' IS DISTINCT FROM 'true'
  OR u->>'tenant_id' IS DISTINCT FROM c->>'tenant_id' THEN RAISE EXCEPTION 'survey staff unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('staffId',p_staff,'staffName',coalesce(u->'full_name',u->'name'),'regionId',p_region,
  'version',md5(jsonb_build_object('staff',u,'region',r,'company',c)::text));
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_roster_read(p_actor uuid,p_company uuid,p_staff uuid,p_region uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row public.crm_survey_rosters%ROWTYPE;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 SELECT * INTO row FROM public.crm_survey_rosters WHERE company_id=p_company AND staff_id=p_staff AND region_id=p_region;
 RETURN jsonb_build_object('companyId',p_company,'staffId',p_staff,'regionId',p_region,'revision',coalesce(row.revision,0),
  'active',coalesce(row.active,false),'document',row.document,'confirmedBy',row.confirmed_by,'updatedAt',row.updated_at,'reservationMade',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_survey_roster_change(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old public.crm_survey_roster_events%ROWTYPE;row public.crm_survey_rosters%ROWTYPE;doc jsonb;slot jsonb;
 staff uuid;region uuid;revision bigint;until_at timestamptz;a timestamptz;b timestamptz;last_end timestamptz;buffer_mins integer;answer jsonb;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR (p_command->>'action' IN ('SAVE','DISABLE')) IS NOT TRUE
  OR p_command->>'staffId' IS NULL OR p_command->>'regionId' IS NULL
  OR jsonb_typeof(p_command->'expectedRevision') IS DISTINCT FROM 'number' OR (p_command->>'expectedRevision'~'^(0|[1-9][0-9]{0,14})$') IS NOT TRUE
  OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('action','staffId','regionId','expectedRevision','reason','document'))
  THEN RAISE EXCEPTION 'invalid survey roster command' USING ERRCODE='22023';END IF;
 staff:=(p_command->>'staffId')::uuid;region:=(p_command->>'regionId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('survey-roster-request:'||p_request::text,0));
 SELECT * INTO old FROM public.crm_survey_roster_events WHERE request_id=p_request;
 IF FOUND THEN
  IF old.company_id IS DISTINCT FROM p_company OR old.actor_id IS DISTINCT FROM p_actor OR old.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'survey request reused' USING ERRCODE='23505';END IF;
  RETURN old.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('survey-roster:'||p_company::text||staff::text||region::text,0));
 SELECT * INTO row FROM public.crm_survey_rosters WHERE company_id=p_company AND staff_id=staff AND region_id=region FOR UPDATE;
 IF coalesce(row.revision,0)<>(p_command->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'survey roster changed' USING ERRCODE='40001';END IF;
 IF p_command->>'action'='SAVE' THEN
  PERFORM public.crm_survey_staff(p_company,staff,region);doc:=p_command->'document';
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR pg_column_size(doc)>30000
   OR doc->>'calendarSource' IS DISTINCT FROM 'CRM_COMPLETE' OR doc->>'externalCalendarCoverage' IS DISTINCT FROM 'ALL_BUSY_IN_CRM'
   OR jsonb_typeof(doc->'sourceReference') IS DISTINCT FROM 'string' OR length(btrim(doc->>'sourceReference')) NOT BETWEEN 20 AND 2000
   OR jsonb_typeof(doc->'validUntil') IS DISTINCT FROM 'string' OR (doc->>'validUntil'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$') IS NOT TRUE
   OR jsonb_typeof(doc->'bufferMinutes') IS DISTINCT FROM 'number' OR (doc->>'bufferMinutes'~'^(0|[1-9][0-9]{0,2})$') IS NOT TRUE
   OR jsonb_typeof(doc->'slots') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'slots') NOT BETWEEN 1 AND 64
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(doc) k WHERE k NOT IN ('calendarSource','externalCalendarCoverage','sourceReference','validUntil','bufferMinutes','slots'))
   THEN RAISE EXCEPTION 'invalid survey availability source' USING ERRCODE='22023';END IF;
  until_at:=(doc->>'validUntil')::timestamptz;buffer_mins:=(doc->>'bufferMinutes')::integer;
  IF until_at<=clock_timestamp() OR until_at>clock_timestamp()+interval '31 days' OR buffer_mins>180 THEN RAISE EXCEPTION 'invalid survey availability expiry' USING ERRCODE='22023';END IF;
  FOR slot IN SELECT value FROM jsonb_array_elements(doc->'slots') ORDER BY (value->>'startsAt')::timestamptz LOOP
   IF jsonb_typeof(slot) IS DISTINCT FROM 'object' OR jsonb_typeof(slot->'startsAt') IS DISTINCT FROM 'string' OR jsonb_typeof(slot->'endsAt') IS DISTINCT FROM 'string'
    OR (slot->>'startsAt'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$') IS NOT TRUE
    OR (slot->>'endsAt'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$') IS NOT TRUE
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(slot) k WHERE k NOT IN ('startsAt','endsAt')) THEN RAISE EXCEPTION 'invalid survey slot' USING ERRCODE='22023';END IF;
   a:=(slot->>'startsAt')::timestamptz;b:=(slot->>'endsAt')::timestamptz;
   IF a<=clock_timestamp() OR b>a+interval '8 hours' OR b<a+interval '15 minutes' OR b+make_interval(mins=>buffer_mins)>until_at
    OR (last_end IS NOT NULL AND a-make_interval(mins=>buffer_mins)<last_end) THEN RAISE EXCEPTION 'overlapping or invalid survey slots' USING ERRCODE='22023';END IF;
   last_end:=b+make_interval(mins=>buffer_mins);
  END LOOP;
 ELSE
  IF row.revision IS NULL OR p_command?'document' THEN RAISE EXCEPTION 'invalid disable request' USING ERRCODE='22023';END IF;doc:=row.document;
 END IF;
 revision:=coalesce(row.revision,0)+1;
 INSERT INTO public.crm_survey_rosters(company_id,staff_id,region_id,revision,active,document,confirmed_by)
 VALUES(p_company,staff,region,revision,p_command->>'action'='SAVE',doc,p_actor)
 ON CONFLICT(company_id,staff_id,region_id) DO UPDATE SET revision=EXCLUDED.revision,active=EXCLUDED.active,document=EXCLUDED.document,confirmed_by=EXCLUDED.confirmed_by,updated_at=clock_timestamp();
 answer:=jsonb_build_object('companyId',p_company,'staffId',staff,'regionId',region,'revision',revision,'action',p_command->>'action','requestId',p_request,'accepted',true,'replayed',false,'reservationMade',false);
 INSERT INTO public.crm_survey_roster_events(request_id,company_id,actor_id,command,result) VALUES(p_request,p_company,p_actor,p_command,answer);
 RETURN answer;
END $$;

-- Conservative busy interpretation of legacy calendar data. Unknown duration
-- is not inferred as zero. Discrete occurrence dates block their entire VN day.
CREATE OR REPLACE FUNCTION public.crm_survey_event_busy(p_start timestamptz,p_end timestamptz,p_all_day boolean,p_days date[],p_from timestamptz,p_to timestamptz)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE day date;day_start timestamptz;a timestamptz;b timestamptz;
BEGIN
 IF p_all_day IS NULL OR p_start IS NULL OR NOT isfinite(p_start) OR (p_end IS NOT NULL AND (NOT isfinite(p_end) OR p_end<p_start)) THEN RETURN true;END IF;
 IF cardinality(p_days)>0 THEN
  FOREACH day IN ARRAY p_days LOOP
   IF day IS NULL OR NOT isfinite(day) THEN RETURN true;END IF;day_start:=day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
   IF day_start<p_to AND day_start+interval '1 day'>p_from THEN RETURN true;END IF;
  END LOOP;RETURN false;
 END IF;
 IF p_start IS NULL OR (p_end IS NOT NULL AND p_end<p_start) THEN RETURN true;END IF;
 IF p_all_day IS TRUE THEN
  a:=date_trunc('day',p_start AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  b:=(date_trunc('day',coalesce(p_end,p_start) AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh';
 ELSE a:=p_start;b:=CASE WHEN p_end IS NULL OR p_end=p_start THEN 'infinity'::timestamptz ELSE p_end END;END IF;
 RETURN a<p_to AND b>p_from;
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
REVOKE ALL ON FUNCTION public.crm_survey_staff(uuid,uuid,uuid),public.crm_survey_event_busy(timestamptz,timestamptz,boolean,date[],timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_survey_roster_read(uuid,uuid,uuid,uuid),public.crm_survey_roster_change(uuid,uuid,uuid,jsonb),public.crm_survey_availability(uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_survey_roster_read(uuid,uuid,uuid,uuid),public.crm_survey_roster_change(uuid,uuid,uuid,jsonb),public.crm_survey_availability(uuid,uuid,uuid,timestamptz,timestamptz) TO service_role;
COMMIT;
