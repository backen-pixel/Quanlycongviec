-- CRM-owned, non-destructive identity links. No automatic phone matching.
-- Depends on650 current-authority context. Default-off application feature.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_lead_identity_scopes(company_id uuid PRIMARY KEY,revision integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.crm_lead_identity_nodes(
 company_id uuid NOT NULL,lead_id uuid NOT NULL,generation integer NOT NULL DEFAULT 0,review_required boolean NOT NULL DEFAULT false,
 PRIMARY KEY(company_id,lead_id));
CREATE TABLE IF NOT EXISTS public.crm_lead_identity_edges(
 company_id uuid NOT NULL,left_lead_id uuid NOT NULL,right_lead_id uuid NOT NULL,
 active boolean NOT NULL,revision integer NOT NULL,left_context text NOT NULL,right_context text NOT NULL,evidence_id uuid NOT NULL,
 PRIMARY KEY(company_id,left_lead_id,right_lead_id),CHECK(left_lead_id<right_lead_id));
CREATE TABLE IF NOT EXISTS public.crm_lead_identity_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,
 command jsonb NOT NULL,graph_revision integer NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,request_id));
CREATE INDEX IF NOT EXISTS crm_identity_active_right ON public.crm_lead_identity_edges(company_id,right_lead_id) WHERE active;
CREATE INDEX IF NOT EXISTS crm_identity_foreign_left ON public.crm_lead_identity_edges(left_lead_id,company_id) WHERE active;
CREATE INDEX IF NOT EXISTS crm_identity_foreign_right ON public.crm_lead_identity_edges(right_lead_id,company_id) WHERE active;
ALTER TABLE public.crm_lead_identity_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_identity_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_identity_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_identity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lead_identity_scopes,public.crm_lead_identity_nodes,public.crm_lead_identity_edges,public.crm_lead_identity_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_lead_identity_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE keys text[]; before_data jsonb; after_data jsonb;
BEGIN
 keys:=CASE TG_TABLE_NAME WHEN 'crm_leads' THEN ARRAY['company_id','customer_id','phone','email']
   WHEN 'customers' THEN ARRAY['company_id','full_name','phone','email'] END;
 SELECT jsonb_object_agg(k,to_jsonb(OLD)->k) INTO before_data FROM unnest(keys) k;
 IF TG_OP='UPDATE' THEN SELECT jsonb_object_agg(k,to_jsonb(NEW)->k) INTO after_data FROM unnest(keys) k; END IF;
 IF TG_OP='DELETE' OR before_data IS DISTINCT FROM after_data THEN
   IF TG_TABLE_NAME='crm_leads' THEN UPDATE public.crm_lead_identity_nodes SET generation=generation+1,review_required=true WHERE lead_id=OLD.id;
   ELSE UPDATE public.crm_lead_identity_nodes n SET generation=generation+1,review_required=true
     WHERE EXISTS(SELECT 1 FROM public.crm_leads l WHERE l.id=n.lead_id AND l.customer_id=OLD.id); END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.crm_lead_identity_changed() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS crm_identity_source_changed ON public.crm_leads;
CREATE TRIGGER crm_identity_source_changed AFTER UPDATE OR DELETE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_lead_identity_changed();
DROP TRIGGER IF EXISTS crm_identity_source_changed ON public.customers;
CREATE TRIGGER crm_identity_source_changed AFTER UPDATE OR DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.crm_lead_identity_changed();

CREATE OR REPLACE FUNCTION public.crm_lead_identity_snapshot(p_actor_id uuid,p_company_id uuid,p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[]; lid uuid; l public.crm_leads%ROWTYPE; customer_json jsonb; node public.crm_lead_identity_nodes%ROWTYPE;
 members jsonb:='[]'::jsonb; edges jsonb; foreign_ids jsonb; result jsonb; rev integer; ctx text;
BEGIN
 IF p_actor_id IS NULL OR p_company_id IS NULL OR p_lead_id IS NULL THEN RAISE EXCEPTION 'invalid context' USING ERRCODE='22023'; END IF;
 -- A separate advisory lock, never company-row-first (650 locks Lead first).
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-identity:'||p_company_id::text,0));
 WITH RECURSIVE reachable(id) AS (
   SELECT p_lead_id UNION SELECT CASE WHEN e.left_lead_id=r.id THEN e.right_lead_id ELSE e.left_lead_id END
   FROM reachable r JOIN public.crm_lead_identity_edges e ON(e.left_lead_id=r.id OR e.right_lead_id=r.id)
   WHERE e.company_id=p_company_id AND e.active
 ) SELECT array_agg(id ORDER BY id) INTO ids FROM reachable;
 IF cardinality(ids)>100 THEN RAISE EXCEPTION 'identity component limit' USING ERRCODE='54000'; END IF;
 -- Lock complete membership before constructing context. Stale edges/missing
 -- nodes remain in closure; they never silently turn into two countable people.
 PERFORM 1 FROM public.crm_leads WHERE id=ANY(ids) AND company_id=p_company_id ORDER BY id FOR UPDATE;
 PERFORM public.crm_lead_quality_context(p_actor_id,p_company_id,p_lead_id);
 INSERT INTO public.crm_lead_identity_scopes(company_id) VALUES(p_company_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO rev FROM public.crm_lead_identity_scopes WHERE company_id=p_company_id;
 FOREACH lid IN ARRAY ids LOOP
   SELECT * INTO l FROM public.crm_leads WHERE id=lid AND company_id=p_company_id;
   IF NOT FOUND THEN
     members:=members||jsonb_build_array(jsonb_build_object('leadId',lid,'companyId',p_company_id,'available',false,'generation',0,'reviewRequired',true));
     CONTINUE;
   END IF;
   -- Current authorization on every accessible member, not only the URL Lead.
   PERFORM public.crm_lead_quality_context(p_actor_id,p_company_id,lid);
   INSERT INTO public.crm_lead_identity_nodes(company_id,lead_id) VALUES(p_company_id,lid) ON CONFLICT DO NOTHING;
   SELECT * INTO node FROM public.crm_lead_identity_nodes WHERE company_id=p_company_id AND lead_id=lid;
   customer_json:='{}'::jsonb;
   IF l.customer_id IS NOT NULL THEN SELECT to_jsonb(c) INTO customer_json FROM public.customers c WHERE c.id=l.customer_id AND c.company_id=p_company_id FOR SHARE; END IF;
   ctx:=md5(jsonb_build_object('lead',l.id,'company',l.company_id,'customer',l.customer_id,
     'phone',to_jsonb(l)->'phone','email',to_jsonb(l)->'email','name',customer_json->'full_name',
     'customerPhone',customer_json->'phone','customerEmail',customer_json->'email','generation',node.generation)::text);
   members:=members||jsonb_build_array(jsonb_build_object('leadId',lid,'companyId',p_company_id,'available',true,'generation',node.generation,'reviewRequired',node.review_required,'contextVersion',ctx));
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('companyId',company_id,'leftLeadId',left_lead_id,'rightLeadId',right_lead_id,'active',active,'revision',revision,
   'leftContext',left_context,'rightContext',right_context,'evidenceId',evidence_id) ORDER BY left_lead_id,right_lead_id),'[]'::jsonb)
 INTO edges FROM public.crm_lead_identity_edges WHERE company_id=p_company_id AND active AND left_lead_id=ANY(ids);
 SELECT coalesce(jsonb_agg(x.id ORDER BY x.id),'[]'::jsonb) INTO foreign_ids FROM unnest(ids) x(id)
   WHERE EXISTS(SELECT 1 FROM public.crm_lead_identity_edges e WHERE e.company_id<>p_company_id AND e.active AND(e.left_lead_id=x.id OR e.right_lead_id=x.id));
 result:=jsonb_build_object('companyId',p_company_id,'rootLeadId',p_lead_id,'graphRevision',rev,'complete',true,'members',members,'edges',edges,'foreignLinkLeadIds',foreign_ids);
 RETURN result||jsonb_build_object('snapshotToken',md5(result::text),'asOf',clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.crm_lead_identity_record(p_actor_id uuid,p_company_id uuid,p_request_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid; b uuid; first_id uuid; second_id uuid; left_snapshot jsonb; right_snapshot jsonb;
 event public.crm_lead_identity_events%ROWTYPE; edge public.crm_lead_identity_edges%ROWTYPE;
 ids uuid[]; rev integer; event_id uuid:=gen_random_uuid(); a_ctx text; b_ctx text;
BEGIN
 IF p_actor_id IS NULL OR p_company_id IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
   OR p_command->>'action' IS NULL OR p_command->>'action' NOT IN ('LINK','UNLINK')
   OR jsonb_typeof(p_command->'evidence') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'evidence')) NOT BETWEEN 20 AND 2000
   OR p_command->>'leftToken' IS NULL OR p_command->>'rightToken' IS NULL
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('action','leftLeadId','rightLeadId','leftToken','rightToken','evidence'))
   THEN RAISE EXCEPTION 'invalid identity command' USING ERRCODE='22023'; END IF;
 a:=(p_command->>'leftLeadId')::uuid;b:=(p_command->>'rightLeadId')::uuid;
 IF a IS NULL OR b IS NULL OR a=b THEN RAISE EXCEPTION 'invalid pair' USING ERRCODE='22023'; END IF;
 first_id:=least(a,b);second_id:=greatest(a,b);
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-identity:'||p_company_id::text,0));
 -- Acquire union of both closures in one global Lead order before either
 -- snapshot locks its own component. Prevents cross-root lock inversion.
 WITH RECURSIVE reachable(id) AS (
   SELECT unnest(ARRAY[a,b]) UNION SELECT CASE WHEN e.left_lead_id=r.id THEN e.right_lead_id ELSE e.left_lead_id END
   FROM reachable r JOIN public.crm_lead_identity_edges e ON(e.left_lead_id=r.id OR e.right_lead_id=r.id)
   WHERE e.company_id=p_company_id AND e.active
 ) SELECT array_agg(id ORDER BY id) INTO ids FROM reachable;
 IF cardinality(ids)>100 THEN RAISE EXCEPTION 'identity component limit' USING ERRCODE='54000'; END IF;
 PERFORM 1 FROM public.crm_leads WHERE id=ANY(ids) AND company_id=p_company_id ORDER BY id FOR UPDATE;
 left_snapshot:=public.crm_lead_identity_snapshot(p_actor_id,p_company_id,a);
 right_snapshot:=public.crm_lead_identity_snapshot(p_actor_id,p_company_id,b);
 SELECT * INTO event FROM public.crm_lead_identity_events WHERE company_id=p_company_id AND request_id=p_request_id;
 IF FOUND THEN
   IF event.actor_id IS DISTINCT FROM p_actor_id OR event.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('replayed',true,'left',left_snapshot,'right',right_snapshot);
 END IF;
 IF left_snapshot->>'snapshotToken' IS DISTINCT FROM p_command->>'leftToken' OR right_snapshot->>'snapshotToken' IS DISTINCT FROM p_command->>'rightToken' THEN RAISE EXCEPTION 'identity changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements((left_snapshot->'members')||(right_snapshot->'members')) m WHERE m->>'available' IS DISTINCT FROM 'true')
   OR jsonb_array_length(left_snapshot->'foreignLinkLeadIds')>0 OR jsonb_array_length(right_snapshot->'foreignLinkLeadIds')>0
   THEN RAISE EXCEPTION 'identity scope unresolved' USING ERRCODE='40001'; END IF;
 SELECT * INTO edge FROM public.crm_lead_identity_edges WHERE company_id=p_company_id AND left_lead_id=first_id AND right_lead_id=second_id;
 IF p_command->>'action'='UNLINK' AND (NOT FOUND OR edge.active IS DISTINCT FROM true) THEN RAISE EXCEPTION 'active link required' USING ERRCODE='22023'; END IF;
 SELECT m->>'contextVersion' INTO a_ctx FROM jsonb_array_elements(left_snapshot->'members') m WHERE m->>'leadId'=first_id::text;
 IF a_ctx IS NULL THEN SELECT m->>'contextVersion' INTO a_ctx FROM jsonb_array_elements(right_snapshot->'members') m WHERE m->>'leadId'=first_id::text; END IF;
 SELECT m->>'contextVersion' INTO b_ctx FROM jsonb_array_elements(right_snapshot->'members') m WHERE m->>'leadId'=second_id::text;
 IF b_ctx IS NULL THEN SELECT m->>'contextVersion' INTO b_ctx FROM jsonb_array_elements(left_snapshot->'members') m WHERE m->>'leadId'=second_id::text; END IF;
 UPDATE public.crm_lead_identity_scopes SET revision=revision+1 WHERE company_id=p_company_id RETURNING revision INTO rev;
 INSERT INTO public.crm_lead_identity_events(id,company_id,actor_id,request_id,command,graph_revision) VALUES(event_id,p_company_id,p_actor_id,p_request_id,p_command,rev);
 INSERT INTO public.crm_lead_identity_edges(company_id,left_lead_id,right_lead_id,active,revision,left_context,right_context,evidence_id)
 VALUES(p_company_id,first_id,second_id,p_command->>'action'='LINK',coalesce(edge.revision,0)+1,a_ctx,b_ctx,event_id)
 ON CONFLICT(company_id,left_lead_id,right_lead_id) DO UPDATE SET active=EXCLUDED.active,revision=EXCLUDED.revision,left_context=EXCLUDED.left_context,right_context=EXCLUDED.right_context,evidence_id=EXCLUDED.evidence_id;
 IF p_command->>'action'='UNLINK' THEN
   UPDATE public.crm_lead_identity_nodes SET review_required=true WHERE company_id=p_company_id AND lead_id=ANY(ids);
 ELSE
   UPDATE public.crm_lead_identity_nodes SET review_required=false WHERE company_id=p_company_id AND lead_id IN(a,b);
 END IF;
 RETURN jsonb_build_object('replayed',false,'left',public.crm_lead_identity_snapshot(p_actor_id,p_company_id,a),'right',public.crm_lead_identity_snapshot(p_actor_id,p_company_id,b));
END $$;
REVOKE ALL ON FUNCTION public.crm_lead_identity_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_lead_identity_record(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_lead_identity_snapshot(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_lead_identity_record(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
