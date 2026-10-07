-- P1-5: canonical_lead_id is crm_leads.id until P1-3 supplies an identity map.
-- P1-3 must resolve duplicate counting there; this migration neither merges nor infers duplicates.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.p1_qualification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  canonical_lead_id uuid NOT NULL,
  revision integer NOT NULL CONSTRAINT p1_qualification_events_revision_check CHECK (revision >= 1),
  status text NOT NULL CONSTRAINT p1_qualification_events_status_check CHECK (status IN ('PENDING','QUALIFIED','REJECTED')),
  contact_usable boolean NOT NULL,
  need_in_scope boolean NOT NULL,
  area_in_service boolean NOT NULL,
  evidence_ref text CONSTRAINT p1_qualification_events_evidence_length_check CHECK (char_length(evidence_ref) <= 200),
  reason text CONSTRAINT p1_qualification_events_reason_length_check CHECK (char_length(reason) <= 500),
  actor_id uuid NOT NULL,
  request_id text NOT NULL,
  context_hash text CONSTRAINT p1_qualification_events_context_length_check CHECK (char_length(context_hash) <= 128),
  input jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p1_qualification_events_qualified_check CHECK
    (status <> 'QUALIFIED' OR (contact_usable AND need_in_scope AND area_in_service AND nullif(btrim(evidence_ref),'') IS NOT NULL)),
  CONSTRAINT p1_qualification_events_rejected_check CHECK
    (status <> 'REJECTED' OR nullif(btrim(reason),'') IS NOT NULL),
  CONSTRAINT p1_qualification_events_company_lead_revision_key UNIQUE (company_id, canonical_lead_id, revision),
  CONSTRAINT p1_qualification_events_company_request_key UNIQUE (company_id, request_id)
);

-- CREATE IF NOT EXISTS must not silently accept an incompatible pre-existing table.
DO $$
DECLARE required_name text;
BEGIN
  IF (SELECT string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) ||
       CASE WHEN a.attnotnull THEN '!' ELSE '' END, ',' ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid='public.p1_qualification_events'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped) <>
      'id:uuid!,company_id:uuid!,canonical_lead_id:uuid!,revision:integer!,status:text!,contact_usable:boolean!,need_in_scope:boolean!,area_in_service:boolean!,evidence_ref:text,reason:text,actor_id:uuid!,request_id:text!,context_hash:text,input:jsonb!,recorded_at:timestamp with time zone!'
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.p1_qualification_events'::regclass) <> 10
  THEN RAISE EXCEPTION 'P1_QUALIFICATION_SCHEMA_MISMATCH'; END IF;
  FOREACH required_name IN ARRAY ARRAY[
    'p1_qualification_events_pkey','p1_qualification_events_revision_check',
    'p1_qualification_events_status_check','p1_qualification_events_evidence_length_check',
    'p1_qualification_events_reason_length_check','p1_qualification_events_context_length_check',
    'p1_qualification_events_qualified_check','p1_qualification_events_rejected_check',
    'p1_qualification_events_company_lead_revision_key','p1_qualification_events_company_request_key'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.p1_qualification_events'::regclass
      AND conname=required_name AND convalidated)
    THEN RAISE EXCEPTION 'P1_QUALIFICATION_CONSTRAINT_MISMATCH: %', required_name; END IF;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS p1_qualification_events_latest_idx ON public.p1_qualification_events
  (company_id, canonical_lead_id, revision DESC);
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_index WHERE indrelid='public.p1_qualification_events'::regclass) <> 4
    OR NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      WHERE i.indrelid='public.p1_qualification_events'::regclass
        AND c.relname='p1_qualification_events_latest_idx' AND i.indisvalid)
  THEN RAISE EXCEPTION 'P1_QUALIFICATION_INDEX_MISMATCH'; END IF;
END $$;
ALTER TABLE public.p1_qualification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.p1_qualification_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.p1_qualification_events FROM service_role;
GRANT SELECT, INSERT ON public.p1_qualification_events TO service_role;

CREATE OR REPLACE FUNCTION public.p1_qualification_command_v1(
  _command text, _company_id uuid, _actor_id uuid, _request_id text,
  _canonical_lead_id uuid, _expected_revision integer, _payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.p1_qualification_events%ROWTYPE;
  latest public.p1_qualification_events%ROWTYPE;
  created public.p1_qualification_events%ROWTYPE;
  command_input jsonb; next_status text;
BEGIN
  IF _company_id IS NULL OR _actor_id IS NULL OR _canonical_lead_id IS NULL
    OR nullif(btrim(_request_id),'') IS NULL OR _expected_revision IS NULL
    OR _expected_revision < 0 OR _payload IS NULL OR jsonb_typeof(_payload) <> 'object'
    OR _command NOT IN ('set','revoke') OR _command IS NULL
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  command_input := jsonb_build_object('command',_command,'canonicalLeadId',_canonical_lead_id,
    'expectedRevision',_expected_revision,'payload',_payload,'actorId',_actor_id);
  SELECT * INTO previous FROM public.p1_qualification_events
    WHERE company_id=_company_id AND request_id=_request_id;
  IF FOUND THEN
    IF previous.input <> command_input THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('event',to_jsonb(previous));
  END IF;
  IF _command = 'set' THEN
    IF (_payload - ARRAY['status','contact_usable','need_in_scope','area_in_service',
         'evidence_ref','reason','context_hash']) <> '{}'::jsonb
      OR coalesce(_payload->>'status','') NOT IN ('PENDING','QUALIFIED','REJECTED')
      OR jsonb_typeof(_payload->'contact_usable') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(_payload->'need_in_scope') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(_payload->'area_in_service') IS DISTINCT FROM 'boolean'
    THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    next_status := _payload->>'status';
  ELSE
    IF (_payload - ARRAY['reason','context_hash']) <> '{}'::jsonb
    THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    next_status := 'PENDING';
  END IF;
  IF next_status='QUALIFIED' AND NOT ((_payload->>'contact_usable')::boolean
      AND (_payload->>'need_in_scope')::boolean AND (_payload->>'area_in_service')::boolean)
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  IF (next_status='REJECTED' OR _command='revoke')
    AND nullif(btrim(_payload->>'reason'),'') IS NULL
  THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF next_status='QUALIFIED' AND nullif(btrim(_payload->>'evidence_ref'),'') IS NULL
  THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED'; END IF;
  IF jsonb_typeof(_payload->'evidence_ref') NOT IN ('string','null')
    OR jsonb_typeof(_payload->'reason') NOT IN ('string','null')
    OR jsonb_typeof(_payload->'context_hash') NOT IN ('string','null')
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  SELECT * INTO latest FROM public.p1_qualification_events
    WHERE company_id=_company_id AND canonical_lead_id=_canonical_lead_id
    ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND AND EXISTS (SELECT 1 FROM public.p1_qualification_events
      WHERE canonical_lead_id=_canonical_lead_id AND company_id<>_company_id)
  THEN RAISE EXCEPTION 'COMPANY_MISMATCH'; END IF;
  IF coalesce(latest.revision,0) <> _expected_revision THEN
    -- A replay can commit between the first request lookup and this revision read.
    SELECT * INTO previous FROM public.p1_qualification_events
      WHERE company_id=_company_id AND request_id=_request_id;
    IF FOUND THEN
      IF previous.input <> command_input THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
      RETURN jsonb_build_object('event',to_jsonb(previous));
    END IF;
    RAISE EXCEPTION 'REVISION_CONFLICT';
  END IF;
  BEGIN
    INSERT INTO public.p1_qualification_events(company_id,canonical_lead_id,revision,status,
      contact_usable,need_in_scope,area_in_service,evidence_ref,reason,actor_id,request_id,context_hash,input)
    VALUES (_company_id,_canonical_lead_id,_expected_revision+1,next_status,
      CASE WHEN _command='revoke' THEN false ELSE (_payload->>'contact_usable')::boolean END,
      CASE WHEN _command='revoke' THEN false ELSE (_payload->>'need_in_scope')::boolean END,
      CASE WHEN _command='revoke' THEN false ELSE (_payload->>'area_in_service')::boolean END,
      _payload->>'evidence_ref',_payload->>'reason',_actor_id,_request_id,
      _payload->>'context_hash',command_input) RETURNING * INTO created;
  EXCEPTION WHEN unique_violation THEN
    -- At READ COMMITTED, this new statement sees the winner of a concurrent insert.
    SELECT * INTO previous FROM public.p1_qualification_events
      WHERE company_id=_company_id AND request_id=_request_id;
    IF FOUND THEN
      IF previous.input <> command_input THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
      RETURN jsonb_build_object('event',to_jsonb(previous));
    END IF;
    RAISE EXCEPTION 'REVISION_CONFLICT';
  END;
  RETURN jsonb_build_object('event',to_jsonb(created));
END $$;
REVOKE ALL ON FUNCTION public.p1_qualification_command_v1(text,uuid,uuid,text,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p1_qualification_command_v1(text,uuid,uuid,text,uuid,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.p1_qualification_state_v1(_company_id uuid, _canonical_lead_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT to_jsonb(e) FROM public.p1_qualification_events e
  WHERE e.company_id=_company_id AND e.canonical_lead_id=_canonical_lead_id
  ORDER BY e.revision DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.p1_qualification_state_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p1_qualification_state_v1(uuid,uuid) TO service_role;
COMMIT;
