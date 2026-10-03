-- Durable customer-care control. No AI delegation, templates or outbound send is enabled here.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_care_threads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,page_id text NOT NULL,psid text NOT NULL,
 mode text NOT NULL DEFAULT 'WAITING' CHECK(mode IN ('WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT')),
 revision bigint NOT NULL DEFAULT 0,reason text,human_deadline timestamptz,claimed_by uuid,
 last_inbound_at timestamptz,last_message_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(page_id,psid));
CREATE TABLE IF NOT EXISTS public.crm_care_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL,page_id text NOT NULL,provider_mid text NOT NULL,
 direction text NOT NULL CHECK(direction IN ('inbound','outbound')),intent text NOT NULL CHECK(intent IN ('MESSAGE','REQUEST_HUMAN','OPT_OUT','OUTBOUND_ECHO')),
 content text NOT NULL,attachments jsonb NOT NULL,sent_at timestamptz NOT NULL,payload_hash text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(page_id,provider_mid));
CREATE TABLE IF NOT EXISTS public.crm_care_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid UNIQUE,thread_id uuid NOT NULL,company_id uuid NOT NULL,
 actor_id uuid,source_message_id uuid UNIQUE,action text NOT NULL,previous_mode text NOT NULL,result jsonb NOT NULL,
 command jsonb,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX IF NOT EXISTS crm_care_company_queue ON public.crm_care_threads(company_id,mode,last_message_at,id);
CREATE INDEX IF NOT EXISTS crm_care_thread_messages ON public.crm_care_messages(thread_id,sent_at,id);
ALTER TABLE public.crm_care_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_care_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_care_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_care_threads,public.crm_care_messages,public.crm_care_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_care_human_deadline(p_at timestamptz)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE d timestamp:=p_at AT TIME ZONE 'Asia/Ho_Chi_Minh';start_at timestamp;end_at timestamp;
BEGIN
 start_at:=date_trunc('day',d)+interval '8 hours';end_at:=date_trunc('day',d)+interval '20 hours';
 IF d<start_at THEN d:=start_at;ELSIF d>=end_at THEN d:=start_at+interval '1 day';END IF;
 end_at:=date_trunc('day',d)+interval '20 hours';d:=d+interval '15 minutes';IF d>end_at THEN d:=d+interval '12 hours';END IF;
 RETURN d AT TIME ZONE 'Asia/Ho_Chi_Minh';
END $$;

-- Read-only routing projection from canonical CRM. Missing/foreign/inactive
-- ownership is an explicit exception; the inbox never creates a second Lead.
CREATE OR REPLACE FUNCTION public.crm_care_target(p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.crm_care_threads%ROWTYPE;page public.facebook_pages%ROWTYPE;contact jsonb;customer jsonb;l jsonb;u jsonb;c jsonb;region jsonb;tenant jsonb;ready boolean:=false;result jsonb;
BEGIN
 SELECT * INTO t FROM public.crm_care_threads WHERE id=p_thread;
 SELECT * INTO page FROM public.facebook_pages WHERE page_id=t.page_id FOR SHARE;
 IF NOT FOUND OR page.default_company_id IS DISTINCT FROM t.company_id OR page.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'care Page scope unavailable' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO c FROM public.companies x WHERE id=t.company_id FOR SHARE;
 IF NOT FOUND OR c->>'is_active'='false' THEN RAISE EXCEPTION 'care company unavailable' USING ERRCODE='42501';END IF;
 IF c->>'tenant_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO tenant FROM public.tenants x WHERE id=(c->>'tenant_id')::uuid FOR SHARE;
  IF NOT FOUND OR tenant->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'care tenant unavailable' USING ERRCODE='42501';END IF;
 END IF;
 SELECT to_jsonb(x) INTO contact FROM public.facebook_contacts x WHERE page_id=t.page_id AND psid=t.psid FOR SHARE;
 IF contact->>'lead_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO l FROM public.crm_leads x WHERE id=(contact->>'lead_id')::uuid FOR SHARE;
  IF l IS NOT NULL AND (l->>'company_id')::uuid IS DISTINCT FROM t.company_id THEN RAISE EXCEPTION 'foreign care Lead mapping' USING ERRCODE='42501';END IF;
 END IF;
 IF contact->>'customer_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO customer FROM public.customers x WHERE id=(contact->>'customer_id')::uuid FOR SHARE;
  IF customer IS NOT NULL AND (customer->>'company_id')::uuid IS DISTINCT FROM t.company_id THEN RAISE EXCEPTION 'foreign care Customer mapping' USING ERRCODE='42501';END IF;
 END IF;
 IF l IS NOT NULL THEN
  SELECT to_jsonb(x) INTO u FROM public.users x WHERE id=(l->>'assigned_to')::uuid AND company_id=t.company_id FOR SHARE;
  SELECT to_jsonb(x) INTO region FROM public.company_regions x WHERE id=(l->>'region_id')::uuid AND company_id=t.company_id FOR SHARE;
  PERFORM 1 FROM public.user_company_regions WHERE user_id=(u->>'id')::uuid AND region_id=(region->>'id')::uuid FOR SHARE;
  ready:=FOUND AND u->>'is_active'='true' AND region->>'is_active'='true' AND u->>'tenant_id' IS NOT DISTINCT FROM c->>'tenant_id';
 END IF;
 result:=jsonb_build_object('contactId',contact->'id','leadId',l->'id','leadCode',l->'code','leadTitle',l->'title',
  'regionId',region->'id','regionName',region->'name','ownerId',CASE WHEN ready THEN u->'id' ELSE NULL END,
  'ownerName',CASE WHEN ready THEN coalesce(u->'full_name',u->'name') ELSE NULL END,
  'routingReady',coalesce(ready,false),'routingIssue',CASE WHEN l IS NULL THEN 'CRM_LINK_UNAVAILABLE' WHEN ready IS NOT TRUE THEN 'CRM_OWNER_UNAVAILABLE' ELSE NULL END);
 RETURN result||jsonb_build_object('targetVersion',md5(jsonb_build_object('target',result,'contact',contact,'lead',l,'owner',u,'region',region)::text));
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_receive(p_events jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb;page public.facebook_pages%ROWTYPE;t public.crm_care_threads%ROWTYPE;m public.crm_care_messages%ROWTYPE;target jsonb;next_mode text;n integer:=0;event_time timestamptz;
BEGIN
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
   n:=n+1;CONTINUE;
  END IF;
  INSERT INTO public.crm_care_messages(thread_id,page_id,provider_mid,direction,intent,content,attachments,sent_at,payload_hash)
  VALUES(t.id,t.page_id,e->>'mid',e->>'direction',e->>'intent',e->>'content',e->'attachments',event_time,e->>'payloadHash') RETURNING * INTO m;
  next_mode:=CASE WHEN t.mode='OPTED_OUT' OR m.intent='OPT_OUT' THEN 'OPTED_OUT'
   WHEN m.intent='OUTBOUND_ECHO' AND t.mode<>'HUMAN_ACTIVE' THEN 'HUMAN_REQUESTED'
   WHEN m.intent='REQUEST_HUMAN' AND t.mode<>'HUMAN_ACTIVE' THEN 'HUMAN_REQUESTED' ELSE t.mode END;
  UPDATE public.crm_care_threads SET mode=next_mode,revision=revision+1,
   reason=CASE WHEN m.intent<>'MESSAGE' THEN m.intent ELSE reason END,
   human_deadline=CASE WHEN next_mode='HUMAN_REQUESTED' AND m.intent IN ('REQUEST_HUMAN','OUTBOUND_ECHO') THEN least(human_deadline,public.crm_care_human_deadline(least(event_time,clock_timestamp()))) WHEN next_mode IN ('HUMAN_ACTIVE','OPTED_OUT') THEN NULL ELSE human_deadline END,
   last_inbound_at=CASE WHEN m.direction='inbound' THEN greatest(last_inbound_at,event_time) ELSE last_inbound_at END,
   last_message_at=greatest(last_message_at,event_time) WHERE id=t.id;
  INSERT INTO public.crm_care_events(thread_id,company_id,source_message_id,action,previous_mode,result)
  VALUES(t.id,t.company_id,m.id,m.intent,t.mode,jsonb_build_object('mode',next_mode,'ownerId',target->'ownerId','routingReady',target->'routingReady'));
  n:=n+1;
 END LOOP;RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_read(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.crm_care_threads%ROWTYPE;target jsonb;messages jsonb;total integer;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
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

CREATE OR REPLACE FUNCTION public.crm_care_list(p_actor uuid,p_company uuid,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb;counts jsonb;cursor_time timestamptz;cursor_id uuid;more boolean;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_after IS NOT NULL THEN SELECT created_at,id INTO cursor_time,cursor_id FROM public.crm_care_threads WHERE id=p_after AND company_id=p_company;IF NOT FOUND THEN RAISE EXCEPTION 'invalid care cursor' USING ERRCODE='22023';END IF;END IF;
 SELECT coalesce(jsonb_object_agg(mode,n),'{}'::jsonb) INTO counts FROM(SELECT mode,count(*) n FROM public.crm_care_threads WHERE company_id=p_company GROUP BY mode)x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]'::jsonb) INTO items FROM(
  SELECT id,mode,reason,human_deadline,last_message_at,created_at FROM public.crm_care_threads
  WHERE company_id=p_company AND (p_after IS NULL OR (created_at,id)>(cursor_time,cursor_id)) ORDER BY created_at,id LIMIT 51)x;
 more:=jsonb_array_length(items)>50;IF more THEN items:=items-50;END IF;
 RETURN jsonb_build_object('companyId',p_company,'counts',counts,'items',items,'nextCursor',CASE WHEN more THEN items->49->>'id' ELSE NULL END,'observedAt',clock_timestamp(),'aiMaySend',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_control(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old public.crm_care_events%ROWTYPE;view jsonb;t public.crm_care_threads%ROWTYPE;result jsonb;next_mode text;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'threadId' IS NULL
  OR (p_command->>'expectedVersion'~'^[a-f0-9]{32}$') IS NOT TRUE OR (p_command->>'action' IN ('TAKEOVER','OPT_OUT')) IS NOT TRUE
  OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('threadId','expectedVersion','action','reason')) THEN RAISE EXCEPTION 'invalid care control' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-control:'||p_request::text,0));
 SELECT * INTO old FROM public.crm_care_events WHERE request_id=p_request;
 IF FOUND THEN
  IF old.actor_id IS DISTINCT FROM p_actor OR old.company_id IS DISTINCT FROM p_company OR old.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'care request reused' USING ERRCODE='23505';END IF;
  RETURN old.result||jsonb_build_object('replayed',true);
 END IF;
 view:=public.crm_care_read(p_actor,p_company,(p_command->>'threadId')::uuid);
 IF view->>'version' IS DISTINCT FROM p_command->>'expectedVersion' THEN RAISE EXCEPTION 'care context changed' USING ERRCODE='40001';END IF;
 SELECT * INTO t FROM public.crm_care_threads WHERE id=(p_command->>'threadId')::uuid FOR UPDATE;
 IF t.mode='OPTED_OUT' AND p_command->>'action'<>'OPT_OUT' THEN RAISE EXCEPTION 'customer opted out' USING ERRCODE='42501';END IF;
 next_mode:=CASE WHEN p_command->>'action'='OPT_OUT' THEN 'OPTED_OUT' ELSE 'HUMAN_ACTIVE' END;
 UPDATE public.crm_care_threads SET mode=next_mode,reason=p_command->>'action',revision=revision+1,human_deadline=NULL,
  claimed_by=CASE WHEN next_mode='HUMAN_ACTIVE' THEN p_actor ELSE claimed_by END WHERE id=t.id;
 result:=jsonb_build_object('accepted',true,'companyId',p_company,'threadId',t.id,'mode',next_mode,'replayed',false);
 INSERT INTO public.crm_care_events(request_id,thread_id,company_id,actor_id,action,previous_mode,result,command)
 VALUES(p_request,t.id,p_company,p_actor,p_command->>'action',t.mode,result,p_command);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_care_human_deadline(timestamptz),public.crm_care_target(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_care_receive(jsonb),public.crm_care_read(uuid,uuid,uuid),public.crm_care_list(uuid,uuid,uuid),public.crm_care_control(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_receive(jsonb),public.crm_care_read(uuid,uuid,uuid),public.crm_care_list(uuid,uuid,uuid),public.crm_care_control(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
