-- New transitions only. No lead update/backfill, provider event or credential change.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

ALTER TABLE public.p1_qualification_events
  ADD COLUMN qualification_method text NOT NULL DEFAULT 'manual_v1',
  ADD COLUMN stage_history_id uuid,
  ADD COLUMN stage_evidence jsonb;
ALTER TABLE public.p1_qualification_events
  ADD CONSTRAINT p1_qualification_method_check CHECK (qualification_method IN ('manual_v1','stage_based_v1')),
  DROP CONSTRAINT p1_qualification_events_qualified_check;
ALTER TABLE public.p1_qualification_events ADD CONSTRAINT p1_qualification_events_qualified_check CHECK (
  status<>'QUALIFIED' OR
  (qualification_method='manual_v1' AND contact_usable AND need_in_scope AND area_in_service
    AND nullif(btrim(evidence_ref),'') IS NOT NULL AND stage_history_id IS NULL AND stage_evidence IS NULL) OR
  (qualification_method='stage_based_v1' AND NOT contact_usable AND NOT need_in_scope AND NOT area_in_service
    AND evidence_ref IS NULL AND stage_history_id IS NOT NULL AND jsonb_typeof(stage_evidence)='object'));
CREATE UNIQUE INDEX p1_qualification_stage_once_idx ON public.p1_qualification_events(company_id,canonical_lead_id)
  WHERE qualification_method='stage_based_v1';

-- Same versioned identity context as qualificationContext.js; JSON (not JSONB)
-- preserves the compact JSON.stringify array representation before hashing.
CREATE FUNCTION public.crm_qualification_context_v2(p_lead public.crm_leads)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT encode(sha256(convert_to(array_to_json(ARRAY['qualification-context-v2',p_lead.id::text,p_lead.company_id::text,
    p_lead.customer_id::text,p_lead.phone,c.id::text,c.phone])::text,'UTF8')),'hex')
  FROM (SELECT 1) seed LEFT JOIN public.customers c ON c.id=p_lead.customer_id
$$;
REVOKE ALL ON FUNCTION public.crm_qualification_context_v2(public.crm_leads) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_qualification_context_v2(public.crm_leads) TO service_role;

CREATE FUNCTION public.crm_qualification_evidence_current_v1(p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.p1_qualification_events; l public.crm_leads; h public.crm_lead_stage_history;
  s public.crm_pipeline_stages;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'STAGE_POLICY_SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO e FROM public.p1_qualification_events WHERE id=p_id;
  SELECT * INTO l FROM public.crm_leads WHERE id=e.canonical_lead_id AND company_id=e.company_id;
  IF e.id IS NULL OR l.id IS NULL OR l.is_test IS DISTINCT FROM false OR e.status<>'QUALIFIED'
    OR e.actor_id IS NULL OR e.context_hash IS DISTINCT FROM public.crm_qualification_context_v2(l) THEN RETURN false; END IF;
  IF e.qualification_method='manual_v1' THEN
    RETURN e.contact_usable AND e.need_in_scope AND e.area_in_service AND nullif(btrim(e.evidence_ref),'') IS NOT NULL;
  END IF;
  SELECT * INTO h FROM public.crm_lead_stage_history WHERE id=e.stage_history_id AND lead_id=l.id;
  SELECT st.* INTO s FROM public.crm_pipeline_stages st JOIN public.crm_pipelines p ON p.id=st.pipeline_id
    WHERE st.id=l.stage_id AND st.pipeline_id=l.pipeline_id AND p.company_id=l.company_id AND st.is_active IS TRUE;
  IF e.qualification_method<>'stage_based_v1' OR e.contact_usable OR e.need_in_scope OR e.area_in_service
    OR e.evidence_ref IS NOT NULL OR h.id IS NULL OR h.changed_by IS DISTINCT FROM e.actor_id
    OR h.entered_at IS DISTINCT FROM e.recorded_at OR s.id IS NULL OR s.is_lost IS TRUE
    OR (l.type='deal' OR (l.type='lead' AND s.canonical_slug IN ('warm','hot'))) IS NOT TRUE
    OR e.stage_evidence IS DISTINCT FROM jsonb_build_object('policy_version','stage_based_v1',
      'from_type',e.stage_evidence->>'from_type','to_type',h.pipeline_type,
      'from_stage_id',h.from_stage_id,'to_stage_id',h.to_stage_id,'to_canonical_slug',h.to_canonical_slug,
      'history_id',h.id,'qualified_at',h.entered_at,'actor_id',h.changed_by,'context_hash',e.context_hash)
    OR ((h.pipeline_type='lead' AND h.to_canonical_slug IN ('warm','hot'))
      OR (e.stage_evidence->>'from_type'='lead' AND h.pipeline_type='deal')) IS NOT TRUE THEN RETURN false; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.crm_qualification_evidence_current_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_qualification_evidence_current_v1(uuid) TO service_role;

-- Caller is the existing authenticated/tenant-authorized CRM application route.
-- All validated patch fields, history actor and policy ledger commit together.
CREATE FUNCTION public.crm_lead_stage_write_v1(p_lead_id uuid,p_company_id uuid,p_actor_id uuid,
  p_expected_stage_id uuid,p_expected_type text,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='public','pg_temp' SET statement_timeout='10s' AS $$
DECLARE old_lead public.crm_leads; new_lead public.crm_leads; target public.crm_pipeline_stages;
  history public.crm_lead_stage_history; prior public.p1_qualification_events;
  fields text; context text; changed boolean; candidate boolean;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'STAGE_POLICY_SERVICE_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_company_id IS DISTINCT FROM '991dc79d-cbf5-49f9-a364-35227cb47635'::uuid OR p_actor_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id)
    OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}'::jsonb
    OR p_patch ?| ARRAY['id','created_at','created_by','website_intake','intake_attribution']
    OR (p_patch ? 'company_id' AND (p_patch->>'company_id') IS DISTINCT FROM p_company_id::text)
    THEN RAISE EXCEPTION 'STAGE_POLICY_INVALID_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT * INTO old_lead FROM public.crm_leads WHERE id=p_lead_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_POLICY_NOT_FOUND'; END IF;
  IF old_lead.stage_id IS DISTINCT FROM p_expected_stage_id OR old_lead.type IS DISTINCT FROM p_expected_type
    THEN RAISE EXCEPTION 'STAGE_POLICY_STATE_CHANGED' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a
    WHERE a.attrelid='public.crm_leads'::regclass AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped))
    THEN RAISE EXCEPTION 'STAGE_POLICY_INVALID_FIELD' USING ERRCODE='22023'; END IF;
  SELECT * INTO new_lead FROM jsonb_populate_record(old_lead,p_patch);
  SELECT s.* INTO target FROM public.crm_pipeline_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id
    WHERE s.id=new_lead.stage_id AND p.company_id=p_company_id AND s.is_active IS TRUE;
  IF target.id IS NULL OR (target.pipeline_type IN (new_lead.type,'both')) IS NOT TRUE
    OR target.pipeline_id IS DISTINCT FROM new_lead.pipeline_id OR new_lead.type NOT IN ('lead','deal')
    THEN RAISE EXCEPTION 'STAGE_POLICY_INVALID_TARGET' USING ERRCODE='22023'; END IF;
  changed:=old_lead.stage_id IS DISTINCT FROM new_lead.stage_id OR old_lead.type IS DISTINCT FROM new_lead.type;
  IF changed THEN p_patch:=p_patch||jsonb_build_object('stage_entered_at',transaction_timestamp()); END IF;
  -- Lock actual contact while snapshotting context; a simultaneous contact edit cannot
  -- qualify a different phone. A missing customer leaves the Ads identity gate closed.
  PERFORM 1 FROM public.customers WHERE id=new_lead.customer_id FOR SHARE;
  SELECT string_agg(format('%I',k),',' ORDER BY k) INTO fields FROM jsonb_object_keys(p_patch) k;
  EXECUTE format('UPDATE public.crm_leads l SET (%1$s)=(SELECT %1$s FROM jsonb_populate_record(l,$1)) WHERE l.id=$2 RETURNING l.*',fields)
    INTO new_lead USING p_patch,p_lead_id;
  IF changed THEN
    IF old_lead.stage_id IS NOT DISTINCT FROM new_lead.stage_id THEN
      UPDATE public.crm_lead_stage_history SET exited_at=transaction_timestamp(),
        duration_seconds=greatest(0,extract(epoch FROM transaction_timestamp()-entered_at)::bigint)
        WHERE lead_id=p_lead_id AND exited_at IS NULL;
      INSERT INTO public.crm_lead_stage_history(lead_id,pipeline_type,from_stage_id,to_stage_id,
        from_canonical_slug,to_canonical_slug,entered_at,changed_by)
        SELECT p_lead_id,new_lead.type,old_lead.stage_id,new_lead.stage_id,s.canonical_slug,target.canonical_slug,
          transaction_timestamp(),p_actor_id FROM public.crm_pipeline_stages s WHERE s.id=old_lead.stage_id;
    END IF;
    SELECT * INTO history FROM public.crm_lead_stage_history WHERE lead_id=p_lead_id AND exited_at IS NULL
      AND to_stage_id IS NOT DISTINCT FROM new_lead.stage_id AND from_stage_id IS NOT DISTINCT FROM old_lead.stage_id
      AND entered_at=transaction_timestamp() ORDER BY created_at DESC,id LIMIT 1;
    IF history.id IS NULL THEN RAISE EXCEPTION 'STAGE_POLICY_HISTORY_UNAVAILABLE'; END IF;
    UPDATE public.crm_lead_stage_history SET changed_by=p_actor_id WHERE id=history.id RETURNING * INTO history;
    candidate:=new_lead.is_test IS FALSE AND ((new_lead.type='lead' AND target.canonical_slug IN ('warm','hot'))
      OR (old_lead.type='lead' AND new_lead.type='deal'));
    SELECT * INTO prior FROM public.p1_qualification_events WHERE company_id=p_company_id AND canonical_lead_id=p_lead_id
      ORDER BY revision DESC LIMIT 1;
    -- Any manual decision is authoritative. One policy record per canonical lead,
    -- even after regression/re-entry or Warm→Hot→Deal. No historical qualification.
    IF candidate AND prior.id IS NULL THEN
      context:=public.crm_qualification_context_v2(new_lead);
      INSERT INTO public.p1_qualification_events(company_id,canonical_lead_id,revision,status,
        contact_usable,need_in_scope,area_in_service,actor_id,request_id,context_hash,input,recorded_at,
        qualification_method,stage_history_id,stage_evidence)
      VALUES(p_company_id,p_lead_id,1,'QUALIFIED',false,false,false,p_actor_id,
        'stage_based_v1:'||p_lead_id::text,context,
        jsonb_build_object('command','stage_based_v1','stage_history_id',history.id),history.entered_at,
        'stage_based_v1',history.id,jsonb_build_object('policy_version','stage_based_v1',
          'from_type',old_lead.type,'to_type',new_lead.type,'from_stage_id',old_lead.stage_id,
          'to_stage_id',new_lead.stage_id,'to_canonical_slug',target.canonical_slug,'history_id',history.id,
          'qualified_at',history.entered_at,'actor_id',p_actor_id,'context_hash',context));
    END IF;
  END IF;
  RETURN to_jsonb(new_lead);
END $$;
REVOKE ALL ON FUNCTION public.crm_lead_stage_write_v1(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_lead_stage_write_v1(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT SELECT ON public.users,public.crm_pipelines,public.crm_pipeline_stages TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.crm_lead_stage_history TO service_role;

-- The existing sender still rechecks the exact latest qualification, source,
-- receipt, consent and payload. Replace only its evidence predicate.
DO $$
DECLARE definition text;
BEGIN
  SELECT replace(pg_get_functiondef('public.web_feedback_source_current_v1(uuid)'::regprocedure),E'\r\n',E'\n') INTO definition;
  IF position('OR prior.contact_usable IS NOT TRUE OR prior.need_in_scope IS NOT TRUE OR prior.area_in_service IS NOT TRUE' IN definition)=0
    THEN RAISE EXCEPTION 'STAGE_POLICY_OUTBOX_BASELINE_MISMATCH'; END IF;
  definition:=replace(definition,
    E'OR prior.contact_usable IS NOT TRUE OR prior.need_in_scope IS NOT TRUE OR prior.area_in_service IS NOT TRUE\n    OR nullif(btrim(prior.evidence_ref),'''') IS NULL',
    'OR public.crm_qualification_evidence_current_v1(prior.id) IS NOT TRUE');
  IF position('OR public.crm_qualification_evidence_current_v1(prior.id) IS NOT TRUE' IN definition)=0
    THEN RAISE EXCEPTION 'STAGE_POLICY_OUTBOX_REPLACEMENT_FAILED'; END IF;
  EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
