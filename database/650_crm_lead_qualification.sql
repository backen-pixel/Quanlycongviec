-- CRM-owned qualification evidence; additive, default-off application feature.
-- No Lead/customer merge, inferred paid attribution, public write or AI grant.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_lead_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  context_version text NOT NULL,
  decision jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, lead_id, revision),
  UNIQUE (company_id, request_id)
);
-- Identifiers deliberately have no cascading FKs. Legacy CRM deletes must not
-- erase the evidence; deleted/moved Leads are excluded by the read RPC.
ALTER TABLE public.crm_lead_quality_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lead_quality_events FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.crm_lead_quality_events IS 'Append-only CRM human qualification attestations. Not unique paid Leads; no automatic attribution or budget authority.';

-- Monotonic revisions prevent A -> B -> A edits from reviving old evidence.
-- Only rows enrolled by this feature are tracked; no historical backfill.
CREATE TABLE IF NOT EXISTS public.crm_lead_quality_source_versions (
  entity text NOT NULL, entity_id uuid NOT NULL, revision bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(entity,entity_id)
);
ALTER TABLE public.crm_lead_quality_source_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lead_quality_source_versions FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_lead_quality_invalidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE keys text[]; before_data jsonb; after_data jsonb;
BEGIN
  keys:=CASE TG_TABLE_NAME
    WHEN 'crm_leads' THEN ARRAY['company_id','customer_id','region_id','assigned_to','lead_owner_id','title','description','lead_type_id','phone','email','install_address']
    WHEN 'customers' THEN ARRAY['company_id','full_name','phone','email','address','city']
    WHEN 'company_regions' THEN ARRAY['company_id','is_active','name','code']
    WHEN 'users' THEN ARRAY['company_id','is_active'] END;
  SELECT jsonb_object_agg(k,to_jsonb(OLD)->k) INTO before_data FROM unnest(keys) k;
  IF TG_OP='UPDATE' THEN SELECT jsonb_object_agg(k,to_jsonb(NEW)->k) INTO after_data FROM unnest(keys) k; END IF;
  IF TG_OP='DELETE' OR before_data IS DISTINCT FROM after_data THEN
    UPDATE public.crm_lead_quality_source_versions SET revision=revision+1 WHERE entity=TG_TABLE_NAME AND entity_id=OLD.id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.crm_lead_quality_invalidate() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS crm_quality_source_changed ON public.crm_leads;
CREATE TRIGGER crm_quality_source_changed AFTER UPDATE OR DELETE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_lead_quality_invalidate();
DROP TRIGGER IF EXISTS crm_quality_source_changed ON public.customers;
CREATE TRIGGER crm_quality_source_changed AFTER UPDATE OR DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.crm_lead_quality_invalidate();
DROP TRIGGER IF EXISTS crm_quality_source_changed ON public.company_regions;
CREATE TRIGGER crm_quality_source_changed AFTER UPDATE OR DELETE ON public.company_regions FOR EACH ROW EXECUTE FUNCTION public.crm_lead_quality_invalidate();
DROP TRIGGER IF EXISTS crm_quality_source_changed ON public.users;
CREATE TRIGGER crm_quality_source_changed AFTER UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.crm_lead_quality_invalidate();
CREATE OR REPLACE FUNCTION public.crm_lead_quality_membership_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN UPDATE public.crm_lead_quality_source_versions SET revision=revision+1 WHERE entity='users' AND entity_id=OLD.user_id; END IF;
  IF TG_OP IN ('UPDATE','INSERT') THEN UPDATE public.crm_lead_quality_source_versions SET revision=revision+1 WHERE entity='users' AND entity_id=NEW.user_id; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.crm_lead_quality_membership_changed() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS crm_quality_membership_changed ON public.user_company_regions;
CREATE TRIGGER crm_quality_membership_changed AFTER INSERT OR UPDATE OR DELETE ON public.user_company_regions FOR EACH ROW EXECUTE FUNCTION public.crm_lead_quality_membership_changed();

CREATE OR REPLACE FUNCTION public.crm_lead_quality_context(p_actor_id uuid, p_company_id uuid, p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  l public.crm_leads%ROWTYPE; u public.users%ROWTYPE; c public.companies%ROWTYPE;
  customer_json jsonb := '{}'::jsonb; region_json jsonb := '{}'::jsonb;
  assignee_json jsonb := '{}'::jsonb; lj jsonb; uj jsonb; cj jsonb;
  allowed boolean := false; ready boolean := false; assigned_region boolean; fingerprint jsonb; contact text; versions jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_company_id IS NULL OR p_lead_id IS NULL THEN RAISE EXCEPTION 'invalid context' USING ERRCODE='22023'; END IF;
  -- Serialize read/record against the existing CRM writer; fresh authorization
  -- rows stay locked until the record and its audit evidence commit together.
  SELECT * INTO l FROM public.crm_leads WHERE id=p_lead_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead missing' USING ERRCODE='P0002'; END IF;
  SELECT * INTO u FROM public.users WHERE id=p_actor_id FOR SHARE;
  IF NOT FOUND OR u.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'actor inactive' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.companies WHERE id=p_company_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'company missing' USING ERRCODE='42501'; END IF;
  lj:=to_jsonb(l); uj:=to_jsonb(u); cj:=to_jsonb(c);
  IF cj->>'is_active'='false' OR lj->>'type' NOT IN ('lead','deal') THEN RAISE EXCEPTION 'unsupported context' USING ERRCODE='42501'; END IF;
  -- Same-company responsible staff; company admin. Ecosystem access requires
  -- a current matching tenant, not a tenant list cached inside a JWT.
  IF u.company_id=p_company_id THEN
    allowed:=u.role::text IN ('admin','sales_admin','crm_production_admin') OR u.id=l.assigned_to OR u.id=l.lead_owner_id;
    IF u.role::text='region_admin' THEN
      PERFORM 1 FROM public.user_company_regions WHERE user_id=u.id AND region_id=l.region_id FOR SHARE;
      allowed:=FOUND;
    END IF;
    IF uj->>'tenant_id' IS NOT NULL AND cj->>'tenant_id' IS NOT NULL AND uj->>'tenant_id' IS DISTINCT FROM cj->>'tenant_id' THEN allowed:=false; END IF;
  ELSIF u.role::text='platform_admin' THEN allowed:=true;
  ELSIF u.role::text='ecosystem_admin' OR (u.role::text='admin' AND u.company_id IS NULL) THEN
    allowed:=uj->>'tenant_id' IS NOT NULL AND uj->>'tenant_id'=cj->>'tenant_id';
  END IF;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'qualification forbidden' USING ERRCODE='42501'; END IF;
  IF l.customer_id IS NOT NULL THEN
    SELECT to_jsonb(x) INTO customer_json FROM public.customers x WHERE x.id=l.customer_id FOR SHARE;
    IF NOT FOUND OR customer_json->>'company_id' IS DISTINCT FROM p_company_id::text THEN RAISE EXCEPTION 'customer scope mismatch' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT to_jsonb(x) INTO region_json FROM public.company_regions x WHERE x.id=l.region_id AND x.company_id=p_company_id FOR SHARE;
  SELECT to_jsonb(x) INTO assignee_json FROM public.users x WHERE x.id=l.assigned_to AND x.company_id=p_company_id FOR SHARE;
  PERFORM 1 FROM public.user_company_regions WHERE user_id=l.assigned_to AND region_id=l.region_id FOR SHARE;
  assigned_region:=FOUND;
  contact:=coalesce(nullif(btrim(customer_json->>'phone'),''),nullif(btrim(lj->>'phone'),''),'');
  ready:=assigned_region AND coalesce(region_json->>'is_active'='true',false) AND coalesce(assignee_json->>'is_active'='true',false)
    AND (length(regexp_replace(contact,'[^0-9]','','g')) BETWEEN 8 AND 15
      OR coalesce(nullif(customer_json->>'email',''),lj->>'email','') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
  fingerprint:=jsonb_build_object(
    'lead',jsonb_build_object('id',l.id,'company',l.company_id,'customer',l.customer_id,'region',l.region_id,
      'assigned',l.assigned_to,'owner',l.lead_owner_id,'title',lj->'title','description',lj->'description',
      'product',lj->'lead_type_id','phone',lj->'phone','email',lj->'email','address',lj->'install_address'),
    'customer',jsonb_build_object('company',customer_json->'company_id','name',customer_json->'full_name','phone',customer_json->'phone','email',customer_json->'email','address',customer_json->'address','city',customer_json->'city'),
    'regionActive',region_json->'is_active','assigneeActive',assignee_json->'is_active','assigneeCompany',assignee_json->'company_id','assignedRegion',assigned_region);
  INSERT INTO public.crm_lead_quality_source_versions(entity,entity_id)
    SELECT entity,entity_id FROM (VALUES ('crm_leads',l.id),('customers',l.customer_id),('company_regions',l.region_id),('users',l.assigned_to)) x(entity,entity_id)
    WHERE entity_id IS NOT NULL ON CONFLICT DO NOTHING;
  SELECT jsonb_object_agg(v.entity || ':' || v.entity_id::text,v.revision) INTO versions
    FROM public.crm_lead_quality_source_versions v
    WHERE (v.entity,v.entity_id) IN (('crm_leads',l.id),('customers',l.customer_id),('company_regions',l.region_id),('users',l.assigned_to));
  RETURN jsonb_build_object('contextVersion',md5((fingerprint || jsonb_build_object('sourceVersions',versions))::text),'readyToQualify',ready,'leadId',l.id,'companyId',l.company_id,'regionId',l.region_id,'assignedTo',l.assigned_to);
END $$;

CREATE OR REPLACE FUNCTION public.crm_lead_quality_read(p_actor_id uuid, p_company_id uuid, p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ctx jsonb; e public.crm_lead_quality_events%ROWTYPE; stale boolean;
BEGIN
  ctx:=public.crm_lead_quality_context(p_actor_id,p_company_id,p_lead_id);
  SELECT * INTO e FROM public.crm_lead_quality_events WHERE company_id=p_company_id AND lead_id=p_lead_id ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN RETURN ctx || jsonb_build_object('revision',0,'status','PENDING','needsRecheck',false,'evidenceKind','HUMAN_ATTESTATION_V1','qualifiedUniquePaidLead',false); END IF;
  stale:=e.context_version IS DISTINCT FROM ctx->>'contextVersion';
  RETURN ctx || jsonb_build_object('revision',e.revision,'status',CASE WHEN stale THEN 'PENDING' ELSE e.decision->>'status' END,
    'storedStatus',e.decision->>'status','needsRecheck',stale,'evidenceId',e.id,'evidenceKind','HUMAN_ATTESTATION_V1',
    'decision',e.decision,'recordedAt',e.recorded_at,'recordedBy',e.actor_id,'qualifiedUniquePaidLead',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_lead_quality_record(p_actor_id uuid, p_company_id uuid, p_lead_id uuid,
  p_request_id uuid, p_expected_revision integer, p_context_version text, p_decision jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ctx jsonb; e public.crm_lead_quality_events%ROWTYPE; rev integer;
BEGIN
  ctx:=public.crm_lead_quality_context(p_actor_id,p_company_id,p_lead_id);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_context_version IS NULL
    OR p_context_version !~ '^[a-f0-9]{32}$' OR jsonb_typeof(p_decision) IS DISTINCT FROM 'object'
    OR p_decision->>'status' IS NULL OR p_decision->>'status' NOT IN ('PENDING','QUALIFIED','REJECTED')
    OR jsonb_typeof(p_decision->'evidence') IS DISTINCT FROM 'string'
    OR length(btrim(p_decision->>'evidence')) NOT BETWEEN 20 AND 2000
    OR jsonb_typeof(p_decision->'contactVerified') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_decision->'demandMatches') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_decision->'serviceAreaVerified') IS DISTINCT FROM 'boolean'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_decision) k WHERE k NOT IN ('status','contactVerified','demandMatches','serviceAreaVerified','evidence'))
    THEN RAISE EXCEPTION 'invalid qualification' USING ERRCODE='22023'; END IF;
  SELECT * INTO e FROM public.crm_lead_quality_events WHERE company_id=p_company_id AND request_id=p_request_id;
  IF FOUND THEN
    IF e.actor_id IS DISTINCT FROM p_actor_id OR e.lead_id IS DISTINCT FROM p_lead_id OR e.expected_revision IS DISTINCT FROM p_expected_revision OR e.context_version IS DISTINCT FROM p_context_version OR e.decision IS DISTINCT FROM p_decision THEN RAISE EXCEPTION 'request reused' USING ERRCODE='23505'; END IF;
    -- Retrying an old accepted request returns CURRENT state, never replays an
    -- old qualification over a newer rejection or changed customer context.
    RETURN public.crm_lead_quality_read(p_actor_id,p_company_id,p_lead_id) || jsonb_build_object('replayed',true);
  END IF;
  SELECT coalesce(max(revision),0) INTO rev FROM public.crm_lead_quality_events WHERE company_id=p_company_id AND lead_id=p_lead_id;
  IF rev<>p_expected_revision OR ctx->>'contextVersion' IS DISTINCT FROM p_context_version THEN RAISE EXCEPTION 'context changed' USING ERRCODE='40001'; END IF;
  IF p_decision->>'status'='QUALIFIED' AND (ctx->>'readyToQualify' IS DISTINCT FROM 'true'
    OR p_decision->'contactVerified' IS DISTINCT FROM 'true'::jsonb OR p_decision->'demandMatches' IS DISTINCT FROM 'true'::jsonb
    OR p_decision->'serviceAreaVerified' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'facts not verified' USING ERRCODE='22023'; END IF;
  INSERT INTO public.crm_lead_quality_events(company_id,lead_id,revision,actor_id,request_id,expected_revision,context_version,decision)
    VALUES(p_company_id,p_lead_id,rev+1,p_actor_id,p_request_id,p_expected_revision,p_context_version,p_decision);
  RETURN public.crm_lead_quality_read(p_actor_id,p_company_id,p_lead_id) || jsonb_build_object('replayed',false);
END $$;

REVOKE ALL ON FUNCTION public.crm_lead_quality_context(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_lead_quality_read(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_lead_quality_record(uuid,uuid,uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_lead_quality_read(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_lead_quality_record(uuid,uuid,uuid,uuid,integer,text,jsonb) TO service_role;
COMMIT;
