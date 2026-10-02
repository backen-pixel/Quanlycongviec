-- Explicit identity decisions; no customer deletion, qualification or attribution.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_identity_distinctions(
 company_id uuid NOT NULL,left_lead_id uuid NOT NULL,right_lead_id uuid NOT NULL,
 active boolean NOT NULL,revision integer NOT NULL,left_context text NOT NULL,right_context text NOT NULL,
 evidence_id uuid NOT NULL,PRIMARY KEY(company_id,left_lead_id,right_lead_id),CHECK(left_lead_id<right_lead_id));
CREATE TABLE IF NOT EXISTS public.crm_identity_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,actor_id uuid NOT NULL,
 request_id uuid NOT NULL,command jsonb NOT NULL,before_token text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(company_id,request_id));
ALTER TABLE public.crm_identity_distinctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_identity_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_identity_distinctions,public.crm_identity_review_events FROM PUBLIC,anon,authenticated,service_role;

-- A restored historical ID must not revive old decisions. This also serializes
-- an INSERT against an operator holding its historical node during detach.
CREATE OR REPLACE FUNCTION public.crm_identity_restored()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.crm_lead_identity_nodes SET generation=generation+1,review_required=true WHERE lead_id=NEW.id;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS crm_identity_restore_guard ON public.crm_leads;
CREATE TRIGGER crm_identity_restore_guard AFTER INSERT ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_identity_restored();
REVOKE ALL ON FUNCTION public.crm_identity_restored() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_identity_review_admin(p_actor uuid,p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users%ROWTYPE;c public.companies%ROWTYPE;t jsonb;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_actor FOR SHARE;
 IF NOT FOUND OR u.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'actor denied' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR SHARE;
 IF NOT FOUND OR to_jsonb(c)->>'is_active'='false' THEN RAISE EXCEPTION 'company denied' USING ERRCODE='42501';END IF;
 IF to_jsonb(c)->>'tenant_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO t FROM public.tenants x WHERE id=(to_jsonb(c)->>'tenant_id')::uuid FOR SHARE;
  IF NOT FOUND OR t->>'is_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'tenant denied' USING ERRCODE='42501';END IF;
 END IF;
 IF (u.role::text='platform_admin' OR
  (u.company_id=p_company AND u.role::text IN('admin','sales_admin') AND to_jsonb(u)->>'tenant_id' IS NOT DISTINCT FROM to_jsonb(c)->>'tenant_id') OR
  (u.company_id IS NULL AND u.role::text IN('ecosystem_admin','admin') AND to_jsonb(u)->>'tenant_id' IS NOT NULL AND to_jsonb(u)->>'tenant_id'=to_jsonb(c)->>'tenant_id')) IS NOT TRUE
 THEN RAISE EXCEPTION 'company identity review denied' USING ERRCODE='42501';END IF;
END $$;

-- One SQL statement builds the complete company universe from a single MVCC
-- snapshot. INSERTs and all current contact fields are in the token; completeness
-- is recomputed on every read, never cached on a node. Historical IDs remain.
CREATE OR REPLACE FUNCTION public.crm_identity_review_snapshot(p_actor uuid,p_company uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.crm_identity_review_admin(p_actor,p_company);
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-identity:'||p_company::text,0));
 WITH ids AS(
  SELECT id FROM public.crm_leads WHERE company_id=p_company
  UNION SELECT lead_id FROM public.crm_lead_identity_nodes WHERE company_id=p_company
  UNION SELECT left_lead_id FROM public.crm_lead_identity_edges WHERE company_id=p_company
  UNION SELECT right_lead_id FROM public.crm_lead_identity_edges WHERE company_id=p_company
 ), limited AS(SELECT id FROM ids ORDER BY id LIMIT 5001), rows AS(
  SELECT x.id,l.company_id,l.customer_id,to_jsonb(l) lj,to_jsonb(c) cj,
   coalesce(n.generation,0) generation,coalesce(n.review_required,false) review_required,
   (l.id IS NOT NULL AND l.type IN('lead','deal') AND (l.customer_id IS NULL OR c.id IS NOT NULL)) available
  FROM limited x LEFT JOIN public.crm_leads l ON l.id=x.id AND l.company_id=p_company
  LEFT JOIN public.customers c ON c.id=l.customer_id AND c.company_id=p_company
  LEFT JOIN public.crm_lead_identity_nodes n ON n.company_id=p_company AND n.lead_id=x.id
 ), members AS(
  SELECT id,jsonb_build_object('leadId',id,'companyId',p_company,'available',coalesce(available,false),'generation',generation,'reviewRequired',review_required,
   'title',CASE WHEN available THEN lj->>'title' ELSE NULL END,
   'contacts',CASE WHEN available THEN jsonb_build_object('leadPhone',lj->'phone','leadEmail',lj->'email','customerPhone',cj->'phone','customerEmail',cj->'email') ELSE '{}'::jsonb END,
   'contextVersion',CASE WHEN available THEN md5(jsonb_build_object('lead',id,'company',company_id,'customer',customer_id,
    'phone',lj->'phone','email',lj->'email','name',cj->'full_name','customerPhone',cj->'phone','customerEmail',cj->'email','generation',generation)::text) ELSE NULL END,
   'foreignHistory',EXISTS(SELECT 1 FROM public.crm_lead_identity_edges e WHERE e.company_id<>p_company AND e.active AND(e.left_lead_id=id OR e.right_lead_id=id))) value FROM rows
 )
 SELECT jsonb_build_object('companyId',p_company,'policy','CRM_EXACT_CONTACT_REVIEW_V1','complete',(SELECT count(*)<=5000 FROM limited),'members',coalesce((SELECT jsonb_agg(value ORDER BY id) FROM members),'[]'::jsonb),
  'graphRevision',coalesce((SELECT revision FROM public.crm_lead_identity_scopes WHERE company_id=p_company),0),
  'edges',coalesce((SELECT jsonb_agg(jsonb_build_object('leftLeadId',left_lead_id,'rightLeadId',right_lead_id,'active',active,'revision',revision,'leftContext',left_context,'rightContext',right_context,'evidenceId',evidence_id) ORDER BY left_lead_id,right_lead_id) FROM public.crm_lead_identity_edges WHERE company_id=p_company),'[]'::jsonb),
  'distinctions',coalesce((SELECT jsonb_agg(jsonb_build_object('leftLeadId',left_lead_id,'rightLeadId',right_lead_id,'active',active,'revision',revision,'leftContext',left_context,'rightContext',right_context,'evidenceId',evidence_id) ORDER BY left_lead_id,right_lead_id) FROM public.crm_identity_distinctions WHERE company_id=p_company),'[]'::jsonb)) INTO result;
 IF result->>'complete' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'identity inventory limit' USING ERRCODE='54000';END IF;
 RETURN result||jsonb_build_object('snapshotToken',md5(result::text),'asOf',clock_timestamp());
END $$;

-- Negative decisions also guard the original651 LINK RPC. Do not silently
-- ignore a stale DISTINCT: it needs an explicit revoke before contradictory LINK.
CREATE OR REPLACE FUNCTION public.crm_identity_guard_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[];
BEGIN
 IF NEW.active IS NOT TRUE THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-identity:'||NEW.company_id::text,0));
 WITH RECURSIVE reachable(id) AS(
  SELECT unnest(ARRAY[NEW.left_lead_id,NEW.right_lead_id])
  UNION SELECT CASE WHEN e.left_lead_id=r.id THEN e.right_lead_id ELSE e.left_lead_id END
  FROM reachable r JOIN public.crm_lead_identity_edges e ON e.company_id=NEW.company_id AND e.active AND(e.left_lead_id=r.id OR e.right_lead_id=r.id)
 ) SELECT array_agg(id) INTO ids FROM reachable;
 IF EXISTS(SELECT 1 FROM public.crm_identity_distinctions WHERE company_id=NEW.company_id AND active AND left_lead_id=ANY(ids) AND right_lead_id=ANY(ids))
 THEN RAISE EXCEPTION 'distinct decision must be revoked first' USING ERRCODE='40001';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_identity_distinct_guard ON public.crm_lead_identity_edges;
CREATE TRIGGER crm_identity_distinct_guard BEFORE INSERT OR UPDATE ON public.crm_lead_identity_edges FOR EACH ROW EXECUTE FUNCTION public.crm_identity_guard_link();

CREATE OR REPLACE FUNCTION public.crm_identity_review_record(p_actor uuid,p_company uuid,p_request uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_snapshot jsonb;left_snapshot jsonb;right_snapshot jsonb;a uuid;b uuid;lo uuid;hi uuid;
 event public.crm_identity_review_events%ROWTYPE;d public.crm_identity_distinctions%ROWTYPE;
 ids uuid[];eid uuid:=gen_random_uuid();lo_ctx text;hi_ctx text;action text;rev integer;ignored jsonb;
BEGIN
 IF p_request IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  OR (p_command->>'action' IN('LINK','UNLINK','DISTINCT','REVOKE_DISTINCT','RECONFIRM','DETACH_UNAVAILABLE')) IS NOT TRUE
  OR (p_command->>'snapshotToken'~'^[a-f0-9]{32}$') IS NOT TRUE
  OR jsonb_typeof(p_command->'evidence') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'evidence')) NOT BETWEEN 20 AND 2000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN('action','leadId','peerLeadId','snapshotToken','evidence'))
 THEN RAISE EXCEPTION 'invalid review command' USING ERRCODE='22023';END IF;
 a:=(p_command->>'leadId')::uuid;b:=(p_command->>'peerLeadId')::uuid;action:=p_command->>'action';
 IF a IS NULL OR (action='RECONFIRM' AND b IS NOT NULL) OR (action<>'RECONFIRM' AND(b IS NULL OR b=a)) THEN RAISE EXCEPTION 'invalid review pair' USING ERRCODE='22023';END IF;
 PERFORM public.crm_identity_review_admin(p_actor,p_company);
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-identity:'||p_company::text,0));
 -- Stable full current company row order. Source edits cannot change selected
 -- members while their decision commits. The next projection sees later INSERTs.
 -- Historical IDs may now belong to another company. Lock only their identity
 -- metadata, never return that company's data. Also fence deleted-ID restores.
 PERFORM 1 FROM public.crm_leads WHERE company_id=p_company OR id IN(
  SELECT lead_id FROM public.crm_lead_identity_nodes WHERE company_id=p_company
  UNION SELECT left_lead_id FROM public.crm_lead_identity_edges WHERE company_id=p_company
  UNION SELECT right_lead_id FROM public.crm_lead_identity_edges WHERE company_id=p_company) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.crm_lead_identity_nodes WHERE company_id=p_company ORDER BY lead_id FOR UPDATE;
 -- A restore that acquired the node first may have committed while we waited.
 PERFORM 1 FROM public.crm_leads WHERE company_id=p_company OR id IN(SELECT lead_id FROM public.crm_lead_identity_nodes WHERE company_id=p_company) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.customers WHERE company_id=p_company ORDER BY id FOR SHARE;
 before_snapshot:=public.crm_identity_review_snapshot(p_actor,p_company);
 PERFORM public.crm_lead_quality_context(p_actor,p_company,a);
 SELECT * INTO event FROM public.crm_identity_review_events WHERE company_id=p_company AND request_id=p_request;
 IF FOUND THEN
  IF event.actor_id IS DISTINCT FROM p_actor OR event.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('replayed',true,'snapshot',public.crm_identity_review_snapshot(p_actor,p_company));
 END IF;
 IF before_snapshot->>'snapshotToken' IS DISTINCT FROM p_command->>'snapshotToken' THEN RAISE EXCEPTION 'inventory changed' USING ERRCODE='40001';END IF;
 left_snapshot:=public.crm_lead_identity_snapshot(p_actor,p_company,a);
 IF action<>'DETACH_UNAVAILABLE' AND action<>'RECONFIRM' THEN right_snapshot:=public.crm_lead_identity_snapshot(p_actor,p_company,b);END IF;
 INSERT INTO public.crm_identity_review_events(id,company_id,actor_id,request_id,command,before_token) VALUES(eid,p_company,p_actor,p_request,p_command,before_snapshot->>'snapshotToken');
 IF action IN('LINK','UNLINK') THEN
  ignored:=public.crm_lead_identity_record(p_actor,p_company,p_request,jsonb_build_object('action',action,'leftLeadId',a,'rightLeadId',b,'leftToken',left_snapshot->>'snapshotToken','rightToken',right_snapshot->>'snapshotToken','evidence',p_command->>'evidence'));
 ELSIF action IN('DISTINCT','REVOKE_DISTINCT') THEN
  lo:=least(a,b);hi:=greatest(a,b);
  SELECT * INTO d FROM public.crm_identity_distinctions WHERE company_id=p_company AND left_lead_id=lo AND right_lead_id=hi;
  IF action='REVOKE_DISTINCT' AND(d.company_id IS NULL OR d.active IS DISTINCT FROM true) THEN RAISE EXCEPTION 'distinct decision missing' USING ERRCODE='22023';END IF;
  IF action='DISTINCT' AND (EXISTS(SELECT 1 FROM jsonb_array_elements(left_snapshot->'members') m WHERE m->>'leadId'=b::text)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements((left_snapshot->'members')||(right_snapshot->'members')) m WHERE m->>'available' IS DISTINCT FROM 'true' OR m->>'reviewRequired'='true')
    OR jsonb_array_length(left_snapshot->'foreignLinkLeadIds')>0 OR jsonb_array_length(right_snapshot->'foreignLinkLeadIds')>0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements((left_snapshot->'edges')||(right_snapshot->'edges')) e
       WHERE e->>'leftContext' IS DISTINCT FROM (SELECT m->>'contextVersion' FROM jsonb_array_elements(before_snapshot->'members') m WHERE m->>'leadId'=e->>'leftLeadId')
       OR e->>'rightContext' IS DISTINCT FROM (SELECT m->>'contextVersion' FROM jsonb_array_elements(before_snapshot->'members') m WHERE m->>'leadId'=e->>'rightLeadId')))
  THEN RAISE EXCEPTION 'unresolved or identical group' USING ERRCODE='40001';END IF;
  SELECT m->>'contextVersion' INTO lo_ctx FROM jsonb_array_elements(before_snapshot->'members') m WHERE m->>'leadId'=lo::text;
  SELECT m->>'contextVersion' INTO hi_ctx FROM jsonb_array_elements(before_snapshot->'members') m WHERE m->>'leadId'=hi::text;
  INSERT INTO public.crm_identity_distinctions(company_id,left_lead_id,right_lead_id,active,revision,left_context,right_context,evidence_id)
  VALUES(p_company,lo,hi,action='DISTINCT',coalesce(d.revision,0)+1,lo_ctx,hi_ctx,eid)
  ON CONFLICT(company_id,left_lead_id,right_lead_id) DO UPDATE SET active=EXCLUDED.active,revision=EXCLUDED.revision,left_context=EXCLUDED.left_context,right_context=EXCLUDED.right_context,evidence_id=EXCLUDED.evidence_id;
 ELSIF action='RECONFIRM' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(left_snapshot->'members') m WHERE m->>'available' IS DISTINCT FROM 'true') OR jsonb_array_length(left_snapshot->'foreignLinkLeadIds')>0 THEN RAISE EXCEPTION 'group unavailable' USING ERRCODE='40001';END IF;
  SELECT array_agg((m->>'leadId')::uuid) INTO ids FROM jsonb_array_elements(left_snapshot->'members') m;
  INSERT INTO public.crm_lead_identity_events(id,company_id,actor_id,request_id,command,graph_revision)
  VALUES(eid,p_company,p_actor,p_request,p_command,coalesce((before_snapshot->>'graphRevision')::integer,0)+1);
  UPDATE public.crm_lead_identity_edges e SET revision=e.revision+1,evidence_id=eid,
   left_context=(SELECT m->>'contextVersion' FROM jsonb_array_elements(left_snapshot->'members') m WHERE m->>'leadId'=e.left_lead_id::text),
   right_context=(SELECT m->>'contextVersion' FROM jsonb_array_elements(left_snapshot->'members') m WHERE m->>'leadId'=e.right_lead_id::text)
  WHERE e.company_id=p_company AND e.active AND e.left_lead_id=ANY(ids);
  UPDATE public.crm_lead_identity_nodes SET review_required=false WHERE company_id=p_company AND lead_id=ANY(ids);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(left_snapshot->'members') m WHERE m->>'leadId'=b::text AND m->>'available'='false') THEN RAISE EXCEPTION 'unavailable member required' USING ERRCODE='40001';END IF;
  -- Only graph relationships change; all CRM/source/receipt tombstones survive.
  INSERT INTO public.crm_lead_identity_events(id,company_id,actor_id,request_id,command,graph_revision)
  VALUES(eid,p_company,p_actor,p_request,p_command,coalesce((before_snapshot->>'graphRevision')::integer,0)+1);
  UPDATE public.crm_lead_identity_edges SET active=false,revision=revision+1,evidence_id=eid WHERE company_id=p_company AND active AND(left_lead_id=b OR right_lead_id=b);
  SELECT array_agg((m->>'leadId')::uuid) INTO ids FROM jsonb_array_elements(left_snapshot->'members') m;
  UPDATE public.crm_lead_identity_nodes SET review_required=true WHERE company_id=p_company AND lead_id=ANY(ids);
 END IF;
 IF action NOT IN('LINK','UNLINK') THEN UPDATE public.crm_lead_identity_scopes SET revision=revision+1 WHERE company_id=p_company;END IF;
 RETURN jsonb_build_object('replayed',false,'snapshot',public.crm_identity_review_snapshot(p_actor,p_company));
END $$;
REVOKE ALL ON FUNCTION public.crm_identity_review_admin(uuid,uuid),public.crm_identity_guard_link() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_identity_review_snapshot(uuid,uuid),public.crm_identity_review_record(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_identity_review_snapshot(uuid,uuid),public.crm_identity_review_record(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
