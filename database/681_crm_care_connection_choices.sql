-- Candidate search is scoped by the same current authority as the write.
-- It returns possible CRM records, never an automatic identity decision.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_care_control.connection_cancellations(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,company_id uuid NOT NULL,thread_id uuid NOT NULL,
 command jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_care_control.connection_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.connection_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION crm_care_control.connection_base(p_actor uuid,p_company uuid,p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.crm_care_threads%ROWTYPE;page jsonb;enrollment jsonb;role_name text;
BEGIN
 PERFORM crm_care_control.connection_ready();
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(role_name,'crm_care_control.connection_cancellations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
   RAISE EXCEPTION 'connection controls unavailable' USING ERRCODE='42501';END IF;
 END LOOP;
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current actor required' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.crm_care_threads WHERE id=p_thread AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO page FROM public.facebook_pages x WHERE page_id=t.page_id FOR SHARE;
 IF page->>'default_company_id' IS DISTINCT FROM p_company::text OR page->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Page unavailable' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO enrollment FROM crm_care_control.connection_pages x WHERE page_id=t.page_id FOR SHARE;
 PERFORM 1 FROM public.users WHERE id=(enrollment->>'enrolled_by')::uuid FOR SHARE;
 IF NOT FOUND OR enrollment->>'company_id' IS DISTINCT FROM p_company::text OR enrollment->>'active' IS DISTINCT FROM 'true'
  OR NOT marketing_measurement.source_actor_current((enrollment->>'enrolled_by')::uuid,p_company) THEN RAISE EXCEPTION 'connection not released' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('thread',to_jsonb(t),'enrollment',enrollment,
  'page',jsonb_build_object('pageId',t.page_id,'companyId',page->>'default_company_id','active',page->>'is_active'));
END $$;
REVOKE ALL ON FUNCTION crm_care_control.connection_base(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_care_control.connection_context(p_actor uuid,p_company uuid,p_thread uuid,p_lead uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE base jsonb;t public.crm_care_threads%ROWTYPE;contact jsonb;l jsonb;c jsonb;body jsonb;n integer;owner_row jsonb;region_row jsonb;inverse_links jsonb;
BEGIN
 base:=crm_care_control.connection_base(p_actor,p_company,p_thread);
 t:=jsonb_populate_record(NULL::public.crm_care_threads,base->'thread');
 SELECT count(*) INTO n FROM public.facebook_contacts WHERE page_id=t.page_id AND psid=t.psid;
 IF n>1 THEN RAISE EXCEPTION 'ambiguous contact' USING ERRCODE='40001';END IF;
 SELECT to_jsonb(x) INTO contact FROM public.facebook_contacts x WHERE page_id=t.page_id AND psid=t.psid FOR UPDATE;
 SELECT coalesce(jsonb_agg(x.id ORDER BY x.id),'[]'::jsonb) INTO inverse_links
 FROM public.crm_leads x WHERE x.facebook_contact_id=(contact->>'id')::uuid;
 SELECT to_jsonb(x) INTO l FROM public.crm_leads x WHERE id=p_lead AND company_id=p_company AND type='lead' FOR SHARE;
 IF l IS NULL THEN RAISE EXCEPTION 'Lead unavailable' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO c FROM public.customers x WHERE id=(l->>'customer_id')::uuid AND company_id=p_company FOR SHARE;
 IF c IS NULL THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO owner_row FROM public.users x WHERE id=(l->>'assigned_to')::uuid AND company_id=p_company FOR SHARE;
 SELECT to_jsonb(x) INTO region_row FROM public.company_regions x WHERE id=(l->>'region_id')::uuid AND company_id=p_company FOR SHARE;
 PERFORM 1 FROM public.user_company_regions WHERE user_id=(owner_row->>'id')::uuid AND region_id=(region_row->>'id')::uuid FOR SHARE;
 IF NOT FOUND OR owner_row->>'is_active' IS DISTINCT FROM 'true' OR region_row->>'is_active' IS DISTINCT FROM 'true'
  OR owner_row->>'tenant_id' IS DISTINCT FROM(SELECT to_jsonb(z)->>'tenant_id' FROM public.companies z WHERE id=p_company) THEN
  RAISE EXCEPTION 'CRM recipient unavailable' USING ERRCODE='42501';END IF;
 -- Keep the exact version document used by SQL680. Merely deploying search
 -- must not invalidate an unchanged pending connection request.
 body:=base||jsonb_build_object('contact',contact,'legacyInverseLinks',inverse_links,'lead',l,'customer',c,'owner',owner_row,'region',region_row);
 RETURN body||jsonb_build_object('version',md5(body::text));
END $$;
REVOKE ALL ON FUNCTION crm_care_control.connection_context(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- alreadyLinked is the historic Lead-only flag. The UI needs the complete
-- Lead/Customer mapping and absence of conflicts before declaring completion.
CREATE OR REPLACE FUNCTION public.crm_care_connection_read(p_actor uuid,p_company uuid,p_thread uuid,p_lead uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE x jsonb;existing uuid;customer uuid;items jsonb;can_link boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 x:=crm_care_control.connection_context(p_actor,p_company,p_thread,p_lead);
 existing:=(x->'contact'->>'lead_id')::uuid;customer:=(x->'contact'->>'customer_id')::uuid;
 can_link:=(existing IS NULL OR existing=p_lead) AND(customer IS NULL OR customer=(x->'lead'->>'customer_id')::uuid)
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(x->'legacyInverseLinks') v WHERE v<>p_lead::text);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sentAt',m.sent_at,'text',m.content) ORDER BY m.sent_at DESC,m.id DESC),'[]'::jsonb) INTO items
 FROM(SELECT id,sent_at,content FROM public.crm_care_messages WHERE thread_id=p_thread AND direction='inbound' ORDER BY sent_at DESC,id DESC LIMIT 20)m;
 RETURN jsonb_build_object('policy','CARE_CONNECTION_V1','companyId',p_company,'actorId',p_actor,'threadId',p_thread,'leadId',p_lead,
  'version',x->'version','careMode',x->'thread'->'mode','canLink',can_link,'alreadyLinked',coalesce(existing=p_lead,false),
  'mappingComplete',coalesce(can_link AND existing=p_lead AND customer=(x->'lead'->>'customer_id')::uuid,false),
  'lead',jsonb_build_object('id',p_lead,'code',x->'lead'->'code','title',x->'lead'->'title','customerName',x->'customer'->'full_name','phone',x->'customer'->'phone'),
  'messages',items,'requiresIdentityEvidence',true,'sendAllowed',false,'automaticallyVerified',false);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_connection_read(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_connection_read(uuid,uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_care_connection_choices(p_actor uuid,p_company uuid,p_thread uuid,p_search text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE base jsonb;items jsonb;needle text;more boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 IF p_search IS NULL OR length(btrim(p_search)) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'bounded search required' USING ERRCODE='22023';END IF;
 base:=crm_care_control.connection_base(p_actor,p_company,p_thread);
 -- strpos makes %, _ and backslash literal, never wildcard selectors.
 needle:=lower(btrim(p_search));
 SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) INTO items FROM(
  SELECT l.id,jsonb_build_object('id',l.id,'code',l.code,'title',l.title,'customerName',c.full_name,'phone',c.phone,
   'ownerName',coalesce(to_jsonb(u)->>'full_name',to_jsonb(u)->>'name'),'regionName',to_jsonb(r)->>'name') item
  FROM public.crm_leads l JOIN public.customers c ON c.id=l.customer_id AND c.company_id=p_company
  JOIN public.users u ON u.id=l.assigned_to AND u.company_id=p_company AND u.is_active IS TRUE
  JOIN public.company_regions r ON r.id=l.region_id AND r.company_id=p_company AND r.is_active IS TRUE
  JOIN public.companies co ON co.id=p_company AND (to_jsonb(u)->>'tenant_id') IS NOT DISTINCT FROM (to_jsonb(co)->>'tenant_id')
  WHERE l.company_id=p_company AND l.type='lead'
   AND EXISTS(SELECT 1 FROM public.user_company_regions ur WHERE ur.user_id=u.id AND ur.region_id=r.id)
   AND (strpos(lower(coalesce(l.code,'')),needle)>0 OR strpos(lower(l.title),needle)>0
     OR strpos(lower(c.full_name),needle)>0 OR strpos(lower(coalesce(c.phone,'')),needle)>0)
  ORDER BY l.id LIMIT 21
 )x;
 more:=jsonb_array_length(items)>20;IF more THEN items:=items-20;END IF;
 RETURN jsonb_build_object('policy','CARE_CONNECTION_CHOICES_V1','actorId',p_actor,'companyId',p_company,'threadId',p_thread,
  'search',btrim(p_search),'observedAt',clock_timestamp(),'careMode',base->'thread'->'mode','items',items,'hasMore',more,
  'automaticallyVerified',false,'sendAllowed',false);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_connection_choices(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_connection_choices(uuid,uuid,uuid,text) TO service_role;

-- A durable tombstone closes an unresolved command. A delayed original HTTP
-- request cannot become a new write after the operator closes that request.
DO $$ BEGIN
 IF to_regprocedure('crm_care_control.link_before_console(uuid,uuid,uuid,jsonb)') IS NULL THEN
  ALTER FUNCTION public.crm_care_connection_link(uuid,uuid,uuid,jsonb) SET SCHEMA crm_care_control;
  ALTER FUNCTION crm_care_control.crm_care_connection_link(uuid,uuid,uuid,jsonb) RENAME TO link_before_console;
 END IF;
END $$;
REVOKE ALL ON FUNCTION crm_care_control.link_before_console(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_care_connection_link(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old crm_care_control.connection_cancellations%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 PERFORM crm_care_control.connection_base(p_actor,p_company,(p_command->>'threadId')::uuid);
 SELECT * INTO old FROM crm_care_control.connection_cancellations WHERE request_id=p_request;
 IF FOUND THEN
  IF old.actor_id IS DISTINCT FROM p_actor OR old.company_id IS DISTINCT FROM p_company OR old.command IS DISTINCT FROM p_command THEN
   RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RAISE EXCEPTION 'request cancelled' USING ERRCODE='P6801';
 END IF;
 RETURN crm_care_control.link_before_console(p_actor,p_company,p_request,p_command);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_connection_link(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_connection_link(uuid,uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_care_connection_close(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t uuid;old crm_care_control.connection_cancellations%ROWTYPE;e crm_care_control.connection_events%ROWTYPE;state text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command)k WHERE k NOT IN('threadId','leadId','expectedVersion','evidenceMessageId','identityConfirmed','reason'))
  OR p_command->>'threadId' IS NULL OR p_command->>'leadId' IS NULL OR p_command->>'evidenceMessageId' IS NULL
  OR(p_command->>'expectedVersion'~'^[a-f0-9]{32}$') IS NOT TRUE OR p_command->'identityConfirmed' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'invalid connection request' USING ERRCODE='22023';END IF;
 t:=(p_command->>'threadId')::uuid;
 PERFORM (p_command->>'leadId')::uuid,(p_command->>'evidenceMessageId')::uuid;
 PERFORM crm_care_control.connection_base(p_actor,p_company,t);
 SELECT * INTO e FROM crm_care_control.connection_events WHERE request_id=p_request;
 IF FOUND THEN
  IF e.actor_id IS DISTINCT FROM p_actor OR e.company_id IS DISTINCT FROM p_company OR e.command IS DISTINCT FROM p_command THEN
   RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  state:='ALREADY_RECORDED';
 ELSE
  SELECT * INTO old FROM crm_care_control.connection_cancellations WHERE request_id=p_request;
  IF FOUND THEN
   IF old.actor_id IS DISTINCT FROM p_actor OR old.company_id IS DISTINCT FROM p_company OR old.command IS DISTINCT FROM p_command THEN
    RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  ELSE
   INSERT INTO crm_care_control.connection_cancellations VALUES(p_request,p_actor,p_company,t,p_command,clock_timestamp());
  END IF;
  state:='CANCELLED';
 END IF;
 RETURN jsonb_build_object('policy','CARE_CONNECTION_CLOSURE_V1','actorId',p_actor,'companyId',p_company,'threadId',t,
  'requestId',p_request,'status',state,'sendAllowed',false,'automaticallyVerified',false);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_connection_close(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_connection_close(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
