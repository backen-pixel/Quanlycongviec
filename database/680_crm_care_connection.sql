-- Explicit conversation-to-CRM identity handoff. No phone/name inference.
-- Release enrollment is private and empty; no existing Page is activated.
-- Local candidate: PostgreSQL/concurrency acceptance and legacy writer cutover
-- are outstanding. Do not apply as a release-ready migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS crm_care_control;
REVOKE ALL ON SCHEMA crm_care_control FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS crm_care_control.connection_pages(
 page_id text PRIMARY KEY,company_id uuid NOT NULL,active boolean NOT NULL DEFAULT false,
 enrolled_by uuid NOT NULL,release_reference text NOT NULL CHECK(length(btrim(release_reference)) BETWEEN 20 AND 2000)
);
CREATE TABLE IF NOT EXISTS crm_care_control.connection_permits(
 transaction_id bigint NOT NULL,backend_pid integer NOT NULL,contact_id uuid NOT NULL,
 PRIMARY KEY(transaction_id,backend_pid,contact_id)
);
CREATE TABLE IF NOT EXISTS crm_care_control.connection_events(
 request_id uuid PRIMARY KEY,company_id uuid NOT NULL,actor_id uuid NOT NULL,thread_id uuid NOT NULL,
 command jsonb NOT NULL,before_state jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_care_control.connection_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_care_control.connection_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_care_control.connection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_care_control.connection_pages,crm_care_control.connection_permits,crm_care_control.connection_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_care_control.connection_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'connection mutation requires read committed' USING ERRCODE='0A000';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-care-connection-write-v1',0));
 IF TG_OP='TRUNCATE' AND EXISTS(SELECT 1 FROM crm_care_control.connection_pages) THEN RAISE EXCEPTION 'controlled connection required' USING ERRCODE='42501';END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION crm_care_control.connection_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;b jsonb;changed boolean;protected boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'connection mutation requires read committed' USING ERRCODE='0A000';END IF;
 IF TG_OP<>'INSERT' THEN a:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN b:=to_jsonb(NEW);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-care-connection-write-v1',0));
 SELECT EXISTS(SELECT 1 FROM crm_care_control.connection_pages WHERE page_id IN(a->>'page_id',b->>'page_id')) INTO protected;
 changed:=TG_OP='DELETE' OR (TG_OP='INSERT' AND(coalesce(b->>'lead_id',b->>'customer_id') IS NOT NULL))
  OR(TG_OP='UPDATE' AND ROW(a->>'id',a->>'page_id',a->>'psid',a->>'lead_id',a->>'customer_id')
    IS DISTINCT FROM ROW(b->>'id',b->>'page_id',b->>'psid',b->>'lead_id',b->>'customer_id'));
 IF protected AND changed THEN
  IF TG_OP='DELETE' OR NOT EXISTS(SELECT 1 FROM crm_care_control.connection_permits p
   WHERE p.transaction_id=txid_current() AND p.backend_pid=pg_backend_pid() AND p.contact_id=(b->>'id')::uuid) THEN
   RAISE EXCEPTION 'controlled connection required' USING ERRCODE='42501';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DROP TRIGGER IF EXISTS crm_care_connection_gate ON public.facebook_contacts;
CREATE TRIGGER crm_care_connection_gate BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.facebook_contacts FOR EACH STATEMENT EXECUTE FUNCTION crm_care_control.connection_gate();
DROP TRIGGER IF EXISTS crm_care_connection_guard ON public.facebook_contacts;
CREATE TRIGGER crm_care_connection_guard BEFORE INSERT OR UPDATE OR DELETE ON public.facebook_contacts FOR EACH ROW EXECUTE FUNCTION crm_care_control.connection_guard();
DROP TRIGGER IF EXISTS crm_care_connection_gate ON crm_care_control.connection_pages;
CREATE TRIGGER crm_care_connection_gate BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON crm_care_control.connection_pages FOR EACH STATEMENT EXECUTE FUNCTION crm_care_control.connection_gate();
ALTER TABLE public.facebook_contacts ENABLE ALWAYS TRIGGER crm_care_connection_gate;
ALTER TABLE public.facebook_contacts ENABLE ALWAYS TRIGGER crm_care_connection_guard;
ALTER TABLE crm_care_control.connection_pages ENABLE ALWAYS TRIGGER crm_care_connection_gate;
REVOKE ALL ON FUNCTION crm_care_control.connection_gate(),crm_care_control.connection_guard() FROM PUBLIC,anon,authenticated,service_role;

-- Legacy inverse links are recovery evidence, not a second writable source.
-- Acquire the same gate before tuple locks or inserts can change that evidence.
CREATE OR REPLACE FUNCTION crm_care_control.inverse_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;b jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'connection mutation requires read committed' USING ERRCODE='0A000';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-care-connection-write-v1',0));
 IF TG_OP<>'INSERT' THEN a:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN b:=to_jsonb(NEW);END IF;
 IF (TG_OP IN('INSERT','DELETE') OR ROW(a->>'id',a->>'facebook_contact_id') IS DISTINCT FROM ROW(b->>'id',b->>'facebook_contact_id'))
  AND EXISTS(SELECT 1 FROM public.facebook_contacts c JOIN crm_care_control.connection_pages p ON p.page_id=c.page_id
    WHERE c.id::text IN(a->>'facebook_contact_id',b->>'facebook_contact_id')) THEN
  RAISE EXCEPTION 'legacy inverse identity requires review' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DROP TRIGGER IF EXISTS crm_care_inverse_gate ON public.crm_leads;
CREATE TRIGGER crm_care_inverse_gate BEFORE INSERT OR UPDATE OF id,facebook_contact_id OR DELETE OR TRUNCATE ON public.crm_leads
 FOR EACH STATEMENT EXECUTE FUNCTION crm_care_control.connection_gate();
DROP TRIGGER IF EXISTS crm_care_inverse_guard ON public.crm_leads;
CREATE TRIGGER crm_care_inverse_guard BEFORE INSERT OR UPDATE OF id,facebook_contact_id OR DELETE ON public.crm_leads
 FOR EACH ROW EXECUTE FUNCTION crm_care_control.inverse_guard();
ALTER TABLE public.crm_leads ENABLE ALWAYS TRIGGER crm_care_inverse_gate;
ALTER TABLE public.crm_leads ENABLE ALWAYS TRIGGER crm_care_inverse_guard;
REVOKE ALL ON FUNCTION crm_care_control.inverse_guard() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_care_control.connection_ready()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role_name text;object_name text;
BEGIN
 LOCK TABLE public.facebook_contacts,public.crm_leads,crm_care_control.connection_pages IN ROW EXCLUSIVE MODE;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'connection mutation requires read committed' USING ERRCODE='0A000';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-care-connection-write-v1',0));
 IF(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='A' AND
  ((tgrelid='public.facebook_contacts'::regclass AND tgname IN('crm_care_connection_gate','crm_care_connection_guard'))
  OR(tgrelid='crm_care_control.connection_pages'::regclass AND tgname='crm_care_connection_gate')
  OR(tgrelid='public.crm_leads'::regclass AND tgname IN('crm_care_inverse_gate','crm_care_inverse_guard'))))<>5 THEN
  RAISE EXCEPTION 'connection controls unavailable' USING ERRCODE='42501';END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_schema_privilege(role_name,'crm_care_control','USAGE,CREATE') THEN RAISE EXCEPTION 'connection controls unavailable' USING ERRCODE='42501';END IF;
  FOREACH object_name IN ARRAY ARRAY['crm_care_control.connection_pages','crm_care_control.connection_permits','crm_care_control.connection_events'] LOOP
   IF has_table_privilege(role_name,object_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'connection controls unavailable' USING ERRCODE='42501';END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION crm_care_control.connection_ready() FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the old transaction only for unenrolled Pages. The gate precedes
-- every contact lock, including the legacy implementation's SELECT FOR UPDATE.
DO $$ BEGIN
 IF to_regprocedure('crm_care_control.legacy_contact_lead_before_connection(uuid,text,uuid,jsonb,uuid)') IS NULL THEN
  ALTER FUNCTION public.create_facebook_contact_lead_once(uuid,text,uuid,jsonb,uuid) SET SCHEMA crm_care_control;
  ALTER FUNCTION crm_care_control.create_facebook_contact_lead_once(uuid,text,uuid,jsonb,uuid) RENAME TO legacy_contact_lead_before_connection;
 END IF;
END $$;
REVOKE ALL ON FUNCTION crm_care_control.legacy_contact_lead_before_connection(uuid,text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.create_facebook_contact_lead_once(
 p_contact_id uuid,p_page_id text,p_company_id uuid,p_lead_data jsonb,p_existing_lead_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 PERFORM crm_care_control.connection_ready();
 IF EXISTS(SELECT 1 FROM crm_care_control.connection_pages WHERE page_id=p_page_id)
  OR EXISTS(SELECT 1 FROM public.facebook_contacts c JOIN crm_care_control.connection_pages p ON p.page_id=c.page_id WHERE c.id=p_contact_id) THEN
  RAISE EXCEPTION 'controlled connection required' USING ERRCODE='42501';
 END IF;
 RETURN crm_care_control.legacy_contact_lead_before_connection(p_contact_id,p_page_id,p_company_id,p_lead_data,p_existing_lead_id);
END $$;
REVOKE ALL ON FUNCTION public.create_facebook_contact_lead_once(uuid,text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_facebook_contact_lead_once(uuid,text,uuid,jsonb,uuid) TO service_role;

-- Hold the same current actor, company, Page, thread, contact and selected Lead
-- through the write. No caller-provided company/phone is an identity proof.
CREATE OR REPLACE FUNCTION crm_care_control.connection_context(p_actor uuid,p_company uuid,p_thread uuid,p_lead uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.crm_care_threads%ROWTYPE;contact jsonb;l jsonb;c jsonb;enrollment jsonb;body jsonb;n integer;page jsonb;owner_row jsonb;region_row jsonb;inverse_links jsonb;
BEGIN
 PERFORM crm_care_control.connection_ready();
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF NOT marketing_measurement.source_actor_current(p_actor,p_company) THEN RAISE EXCEPTION 'current actor required' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.crm_care_threads WHERE id=p_thread AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO page FROM public.facebook_pages x WHERE page_id=t.page_id FOR SHARE;
 IF page->>'default_company_id' IS DISTINCT FROM p_company::text OR page->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Page unavailable' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x) INTO enrollment FROM crm_care_control.connection_pages x WHERE page_id=t.page_id FOR SHARE;
 -- Serialize release-author revocation with this command as well as actor
 -- revocation. Both user rows remain locked through the commit.
 PERFORM 1 FROM public.users WHERE id=(enrollment->>'enrolled_by')::uuid FOR SHARE;
 IF NOT FOUND OR enrollment->>'company_id' IS DISTINCT FROM p_company::text OR enrollment->>'active' IS DISTINCT FROM 'true'
  OR NOT marketing_measurement.source_actor_current((enrollment->>'enrolled_by')::uuid,p_company) THEN RAISE EXCEPTION 'connection not released' USING ERRCODE='42501';END IF;
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
 body:=jsonb_build_object('thread',to_jsonb(t),'contact',contact,'legacyInverseLinks',inverse_links,'lead',l,'customer',c,'enrollment',enrollment,
  'owner',owner_row,'region',region_row,'page',jsonb_build_object('pageId',t.page_id,'companyId',page->>'default_company_id','active',page->>'is_active'));
 RETURN body||jsonb_build_object('version',md5(body::text));
END $$;
REVOKE ALL ON FUNCTION crm_care_control.connection_context(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

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
  'lead',jsonb_build_object('id',p_lead,'code',x->'lead'->'code','title',x->'lead'->'title','customerName',x->'customer'->'full_name','phone',x->'customer'->'phone'),
  'messages',items,'requiresIdentityEvidence',true,'sendAllowed',false,'automaticallyVerified',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_connection_link(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE x jsonb;old crm_care_control.connection_events%ROWTYPE;t uuid;l uuid;cid uuid;v_contact_id uuid;result jsonb;evidence public.crm_care_messages%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server required' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command)k WHERE k NOT IN('threadId','leadId','expectedVersion','evidenceMessageId','identityConfirmed','reason'))
  OR p_command->>'threadId' IS NULL OR p_command->>'leadId' IS NULL OR p_command->>'evidenceMessageId' IS NULL
  OR(p_command->>'expectedVersion'~'^[a-f0-9]{32}$') IS NOT TRUE OR p_command->'identityConfirmed' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'invalid connection evidence' USING ERRCODE='22023';END IF;
 t:=(p_command->>'threadId')::uuid;l:=(p_command->>'leadId')::uuid;
 x:=crm_care_control.connection_context(p_actor,p_company,t,l);cid:=(x->'lead'->>'customer_id')::uuid;
 SELECT * INTO old FROM crm_care_control.connection_events WHERE request_id=p_request;
 IF FOUND THEN
  IF old.actor_id IS DISTINCT FROM p_actor OR old.company_id IS DISTINCT FROM p_company OR old.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN old.result||jsonb_build_object('replayed',true,'currentLink',coalesce(x->'contact'->>'lead_id'=l::text AND x->'contact'->>'customer_id'=cid::text,false));
 END IF;
 IF x->>'version' IS DISTINCT FROM p_command->>'expectedVersion' THEN RAISE EXCEPTION 'connection changed' USING ERRCODE='40001';END IF;
 IF(x->'contact'->>'lead_id' IS NOT NULL AND x->'contact'->>'lead_id'<>l::text)
  OR(x->'contact'->>'customer_id' IS NOT NULL AND x->'contact'->>'customer_id'<>cid::text)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(x->'legacyInverseLinks') v WHERE v<>l::text) THEN
  RAISE EXCEPTION 'existing identity requires review' USING ERRCODE='40001';END IF;
 SELECT * INTO evidence FROM public.crm_care_messages WHERE id=(p_command->>'evidenceMessageId')::uuid AND thread_id=t AND direction='inbound' FOR SHARE;
 IF NOT FOUND OR coalesce(length(btrim(evidence.content)),0)=0 THEN RAISE EXCEPTION 'inbound evidence required' USING ERRCODE='22023';END IF;
 v_contact_id:=coalesce((x->'contact'->>'id')::uuid,gen_random_uuid());
 INSERT INTO crm_care_control.connection_permits VALUES(txid_current(),pg_backend_pid(),v_contact_id);
 IF x->'contact'='null'::jsonb THEN
  INSERT INTO public.facebook_contacts(id,page_id,psid,lead_id,customer_id) VALUES(v_contact_id,x->'thread'->>'page_id',x->'thread'->>'psid',l,cid);
 ELSE
  UPDATE public.facebook_contacts SET lead_id=l,customer_id=cid WHERE id=v_contact_id;
 END IF;
 DELETE FROM crm_care_control.connection_permits p WHERE p.transaction_id=txid_current() AND p.backend_pid=pg_backend_pid() AND p.contact_id=v_contact_id;
 result:=jsonb_build_object('policy','CARE_CONNECTION_V1','companyId',p_company,'actorId',p_actor,'threadId',t,'leadId',l,'contactId',v_contact_id,
  'requestId',p_request,'replayed',false,'currentLink',true,'careMode',x->'thread'->'mode','sendAllowed',false,'automaticallyVerified',false);
 INSERT INTO crm_care_control.connection_events(request_id,company_id,actor_id,thread_id,command,before_state,result) VALUES(p_request,p_company,p_actor,t,p_command,x,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_care_connection_read(uuid,uuid,uuid,uuid),public.crm_care_connection_link(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_connection_read(uuid,uuid,uuid,uuid),public.crm_care_connection_link(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
