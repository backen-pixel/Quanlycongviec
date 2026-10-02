-- Approved customer-facing responses. No product data, approvers or live permissions are seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_care_library_publishers (
 company_id uuid NOT NULL REFERENCES public.companies(id),
 user_id uuid NOT NULL REFERENCES public.users(id),
 authorization_id uuid NOT NULL DEFAULT gen_random_uuid(),
 active boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 approval_reference text NOT NULL CHECK(length(approval_reference) BETWEEN 20 AND 2000),
 PRIMARY KEY(company_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.crm_care_library_entries (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 revision integer NOT NULL CHECK(revision>0),
 state text NOT NULL CHECK(state IN ('DRAFT','APPROVED','REVOKED')),
 document jsonb NOT NULL,
 source_version text NOT NULL,
 edited_by uuid NOT NULL REFERENCES public.users(id),
 approved_by uuid REFERENCES public.users(id),
 publisher_authorization uuid,
 approved_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS crm_care_library_company ON public.crm_care_library_entries(company_id,id);
CREATE TABLE IF NOT EXISTS public.crm_care_library_events (
 request_id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 actor_id uuid NOT NULL REFERENCES public.users(id),
 entry_id uuid NOT NULL REFERENCES public.crm_care_library_entries(id),
 command jsonb NOT NULL,
 result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.crm_care_library_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_care_library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_care_library_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_care_library_publishers,public.crm_care_library_entries,public.crm_care_library_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_care_library_rotate_publisher()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN NEW.authorization_id:=gen_random_uuid();RETURN NEW;END $$;
DROP TRIGGER IF EXISTS crm_care_library_publisher_changed ON public.crm_care_library_publishers;
CREATE TRIGGER crm_care_library_publisher_changed BEFORE UPDATE ON public.crm_care_library_publishers FOR EACH ROW EXECUTE FUNCTION public.crm_care_library_rotate_publisher();
REVOKE ALL ON FUNCTION public.crm_care_library_rotate_publisher() FROM PUBLIC,anon,authenticated,service_role;

-- Publisher enrollment is a release operation for named human users, not an app/Agent tool.
CREATE OR REPLACE FUNCTION public.crm_care_library_publisher(p_actor uuid,p_company uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g public.crm_care_library_publishers%ROWTYPE;
BEGIN
 BEGIN PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 EXCEPTION WHEN insufficient_privilege THEN RETURN false; END;
 SELECT * INTO g FROM public.crm_care_library_publishers WHERE company_id=p_company AND user_id=p_actor FOR SHARE;
 RETURN FOUND AND g.active AND g.expires_at>clock_timestamp();
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_library_validate(p_document jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k text;
BEGIN
 IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR octet_length(p_document::text)>30000
  OR NOT p_document ?& ARRAY['title','purpose','question','answer','sourceReference','productId','regionIds','channels','validUntil']
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_document) x WHERE x NOT IN ('title','purpose','question','answer','sourceReference','productId','regionIds','channels','validUntil'))
  THEN RAISE EXCEPTION 'invalid document' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['title','question','answer','sourceReference','validUntil'] LOOP
  IF jsonb_typeof(p_document->k) IS DISTINCT FROM 'string' OR length(btrim(p_document->>k))=0 THEN RAISE EXCEPTION 'missing document text' USING ERRCODE='22023';END IF;
 END LOOP;
 IF length(p_document->>'title')>200 OR length(p_document->>'question')>1000 OR length(p_document->>'answer')>4000
  OR length(p_document->>'sourceReference') NOT BETWEEN 20 AND 2000
  OR (p_document->>'purpose' IN ('ADVICE','QUALIFY','HANDOFF')) IS NOT TRUE
  OR p_document->>'answer' ~ '(\{\{|\}\})'
  OR jsonb_typeof(p_document->'productId') NOT IN ('null','string')
  OR jsonb_typeof(p_document->'regionIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'regionIds') NOT BETWEEN 1 AND 20
  OR jsonb_typeof(p_document->'channels') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'channels') NOT BETWEEN 1 AND 6
  THEN RAISE EXCEPTION 'invalid document content' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'regionIds') x WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') IS NOT TRUE)
  OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(p_document->'regionIds') x)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'channels') x WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}' IN ('facebook','website','google','tiktok','zalo','chatgpt')) IS NOT TRUE)
  OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(p_document->'channels') x)
  THEN RAISE EXCEPTION 'invalid audience' USING ERRCODE='22023';END IF;
 IF p_document->>'productId' IS NOT NULL THEN PERFORM (p_document->>'productId')::uuid;END IF;
 IF (p_document->>'validUntil' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$') IS NOT TRUE
  OR NOT isfinite((p_document->>'validUntil')::timestamptz) THEN RAISE EXCEPTION 'invalid expiry' USING ERRCODE='22023';END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_library_source(p_company uuid,p_document jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE product jsonb;region jsonb;versions jsonb:='[]';rid uuid;
BEGIN
 IF p_document->>'productId' IS NOT NULL THEN
  SELECT to_jsonb(p) INTO product FROM public.products p WHERE id=(p_document->>'productId')::uuid FOR SHARE;
  IF NOT FOUND OR product->>'company_id' IS DISTINCT FROM p_company::text OR product->>'status' IS DISTINCT FROM 'active'
   THEN RAISE EXCEPTION 'product unavailable' USING ERRCODE='42501';END IF;
 END IF;
 FOR rid IN SELECT value::uuid FROM jsonb_array_elements_text(p_document->'regionIds') ORDER BY value::uuid LOOP
  SELECT to_jsonb(r) INTO region FROM public.company_regions r WHERE id=rid FOR SHARE;
  IF NOT FOUND OR region->>'company_id' IS DISTINCT FROM p_company::text OR region->>'is_active' IS DISTINCT FROM 'true'
   THEN RAISE EXCEPTION 'region unavailable' USING ERRCODE='42501';END IF;
  versions:=versions||jsonb_build_array(region);
 END LOOP;
 -- Only the digest leaves this function: cost prices and internal product fields are never returned.
 RETURN md5(jsonb_build_object('product',product,'regions',versions)::text);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_library_read(p_actor uuid,p_company uuid,p_entry uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.crm_care_library_entries%ROWTYPE;source text;source_ok boolean:=true;publisher_ok boolean:=false;reason text;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 SELECT * INTO e FROM public.crm_care_library_entries WHERE id=p_entry AND company_id=p_company FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'entry unavailable' USING ERRCODE='42501';END IF;
 BEGIN source:=public.crm_care_library_source(p_company,e.document);
 EXCEPTION WHEN insufficient_privilege THEN source_ok:=false; END;
 IF e.approved_by IS NOT NULL THEN
  publisher_ok:=public.crm_care_library_publisher(e.approved_by,p_company) AND EXISTS(SELECT 1 FROM public.crm_care_library_publishers WHERE company_id=p_company AND user_id=e.approved_by AND authorization_id=e.publisher_authorization);
 END IF;
 reason:=CASE WHEN e.state<>'APPROVED' THEN 'NOT_APPROVED' WHEN NOT source_ok THEN 'SOURCE_UNAVAILABLE'
  WHEN source IS DISTINCT FROM e.source_version THEN 'SOURCE_CHANGED' WHEN NOT publisher_ok THEN 'APPROVER_UNAVAILABLE'
  WHEN (e.document->>'validUntil')::timestamptz<=clock_timestamp() THEN 'EXPIRED' ELSE NULL END;
 RETURN jsonb_build_object('companyId',p_company,'entryId',e.id,'revision',e.revision,'state',e.state,'document',e.document,
  'version',md5(to_jsonb(e)::text||coalesce(source,'unavailable')||publisher_ok::text),'sourceReady',source_ok AND source=e.source_version,
  'approvedReady',reason IS NULL,'invalidReason',reason,'approvedBy',e.approved_by,'approvedAt',e.approved_at,
  'canApprove',public.crm_care_library_publisher(p_actor,p_company));
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_library_change(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.crm_care_library_entries%ROWTYPE;receipt public.crm_care_library_events%ROWTYPE;
 view jsonb;result jsonb;source text;entry_id uuid;action text;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR NOT p_command ?& ARRAY['entryId','action','expectedVersion','reason']
  OR (p_command->>'action' IN ('SAVE','APPROVE','REVOKE')) IS NOT TRUE
  OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 20 AND 2000
  OR jsonb_typeof(p_command->'entryId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_command->'expectedVersion') NOT IN ('null','string')
  OR (p_command->>'expectedVersion' IS NOT NULL AND (p_command->>'expectedVersion' ~ '^[a-f0-9]{32}$') IS NOT TRUE)
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) x WHERE x NOT IN ('entryId','action','expectedVersion','reason','document'))
  THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023';END IF;
 entry_id:=(p_command->>'entryId')::uuid;action:=p_command->>'action';
 IF entry_id IS NULL OR (action<>'SAVE' AND p_command?'document') THEN RAISE EXCEPTION 'invalid command shape' USING ERRCODE='22023';END IF;
 IF action='APPROVE' AND NOT public.crm_care_library_publisher(p_actor,p_company) THEN RAISE EXCEPTION 'publisher denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-library-request:'||p_request::text,0));
 SELECT * INTO receipt FROM public.crm_care_library_events WHERE request_id=p_request;
 IF FOUND THEN
  IF receipt.actor_id<>p_actor OR receipt.company_id<>p_company OR receipt.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN receipt.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('care-library-entry:'||entry_id::text,0));
 SELECT * INTO e FROM public.crm_care_library_entries WHERE id=entry_id FOR UPDATE;
 IF FOUND THEN
  IF e.company_id<>p_company THEN RAISE EXCEPTION 'entry cannot transfer' USING ERRCODE='42501';END IF;
  view:=public.crm_care_library_read(p_actor,p_company,entry_id);
  IF view->>'version' IS DISTINCT FROM p_command->>'expectedVersion' THEN RAISE EXCEPTION 'entry changed' USING ERRCODE='40001';END IF;
 ELSE
  IF action<>'SAVE' OR p_command->>'expectedVersion' IS NOT NULL THEN RAISE EXCEPTION 'entry missing' USING ERRCODE='40001';END IF;
 END IF;
 IF action='SAVE' THEN
  PERFORM public.crm_care_library_validate(p_command->'document');
  source:=public.crm_care_library_source(p_company,p_command->'document');
  IF (p_command->'document'->>'validUntil')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'expired content' USING ERRCODE='22023';END IF;
  INSERT INTO public.crm_care_library_entries(id,company_id,revision,state,document,source_version,edited_by)
   VALUES(entry_id,p_company,coalesce(e.revision,0)+1,'DRAFT',p_command->'document',source,p_actor)
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,state='DRAFT',document=excluded.document,source_version=excluded.source_version,
    edited_by=excluded.edited_by,approved_by=NULL,publisher_authorization=NULL,approved_at=NULL,updated_at=clock_timestamp();
 ELSIF action='APPROVE' THEN
  IF e.state<>'DRAFT' OR (view->>'sourceReady')::boolean IS NOT TRUE OR (e.document->>'validUntil')::timestamptz<=clock_timestamp()
   OR NOT public.crm_care_library_publisher(p_actor,p_company) THEN RAISE EXCEPTION 'approval unavailable' USING ERRCODE='40001';END IF;
  UPDATE public.crm_care_library_entries SET revision=revision+1,state='APPROVED',approved_by=p_actor,
   publisher_authorization=(SELECT authorization_id FROM public.crm_care_library_publishers WHERE company_id=p_company AND user_id=p_actor),
   approved_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=entry_id;
 ELSE
  UPDATE public.crm_care_library_entries SET revision=revision+1,state='REVOKED',updated_at=clock_timestamp() WHERE id=entry_id;
 END IF;
 result:=jsonb_build_object('companyId',p_company,'entryId',entry_id,'requestId',p_request,'action',action,'replayed',false,
  'entry',public.crm_care_library_read(p_actor,p_company,entry_id));
 INSERT INTO public.crm_care_library_events(request_id,company_id,actor_id,entry_id,command,result) VALUES(p_request,p_company,p_actor,entry_id,p_command,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_library_list(p_actor uuid,p_company uuid,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.crm_care_library_entries%ROWTYPE;items jsonb:='[]';view jsonb;last_id uuid;more boolean:=false;n integer:=0;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF p_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_care_library_entries WHERE id=p_after AND company_id=p_company) THEN RAISE EXCEPTION 'cursor denied' USING ERRCODE='42501';END IF;
 FOR e IN SELECT * FROM public.crm_care_library_entries WHERE company_id=p_company AND (p_after IS NULL OR id>p_after) ORDER BY id LIMIT 51 LOOP
  n:=n+1;IF n=51 THEN more:=true;EXIT;END IF;
  view:=public.crm_care_library_read(p_actor,p_company,e.id);
  items:=items||jsonb_build_array((view-'document')||jsonb_build_object('title',view->'document'->'title','purpose',view->'document'->'purpose','validUntil',view->'document'->'validUntil'));
  last_id:=e.id;
 END LOOP;
 RETURN jsonb_build_object('companyId',p_company,'items',items,'nextAfter',CASE WHEN more THEN last_id ELSE NULL END,'canApprove',public.crm_care_library_publisher(p_actor,p_company));
END $$;

REVOKE ALL ON FUNCTION public.crm_care_library_publisher(uuid,uuid),public.crm_care_library_validate(jsonb),public.crm_care_library_source(uuid,jsonb),public.crm_care_library_read(uuid,uuid,uuid),public.crm_care_library_change(uuid,uuid,uuid,jsonb),public.crm_care_library_list(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_library_read(uuid,uuid,uuid),public.crm_care_library_change(uuid,uuid,uuid,jsonb),public.crm_care_library_list(uuid,uuid,uuid) TO service_role;
COMMIT;
