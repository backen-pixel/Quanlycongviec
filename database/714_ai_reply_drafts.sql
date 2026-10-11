BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.ai_reply_draft_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  revision integer NOT NULL CONSTRAINT ai_reply_draft_revision_check CHECK (revision >= 1),
  kind text NOT NULL CONSTRAINT ai_reply_draft_kind_check CHECK (kind IN ('GENERATED','DISCARDED','EDITED','SENT_BY_HUMAN','REJECTED')),
  draft_text text CONSTRAINT ai_reply_draft_text_check CHECK (
    char_length(draft_text) <= 2000 AND
    (kind NOT IN ('GENERATED','EDITED','SENT_BY_HUMAN') OR nullif(btrim(draft_text),'') IS NOT NULL) AND
    (kind NOT IN ('DISCARDED','REJECTED') OR draft_text IS NULL)),
  policy_reasons jsonb CONSTRAINT ai_reply_draft_reasons_check CHECK (policy_reasons IS NULL OR jsonb_typeof(policy_reasons) = 'array'),
  model text,
  prompt_version text,
  prompt_tokens integer CONSTRAINT ai_reply_draft_prompt_tokens_check CHECK (prompt_tokens >= 0),
  completion_tokens integer CONSTRAINT ai_reply_draft_completion_tokens_check CHECK (completion_tokens >= 0),
  cost_vnd bigint CONSTRAINT ai_reply_draft_cost_check CHECK (cost_vnd >= 0),
  actor_id uuid,
  request_id text NOT NULL,
  input jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_reply_draft_company_request_key UNIQUE (company_id, request_id),
  CONSTRAINT ai_reply_draft_company_revision_key UNIQUE (company_id, draft_id, revision)
);
DO $$
BEGIN
  IF (SELECT string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) || CASE WHEN a.attnotnull THEN '!' ELSE '' END, ',' ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid='public.ai_reply_draft_events'::regclass AND a.attnum > 0 AND NOT a.attisdropped) <>
    'id:uuid!,company_id:uuid!,lead_id:uuid!,draft_id:uuid!,revision:integer!,kind:text!,draft_text:text,policy_reasons:jsonb,model:text,prompt_version:text,prompt_tokens:integer,completion_tokens:integer,cost_vnd:bigint,actor_id:uuid,request_id:text!,input:jsonb!,recorded_at:timestamp with time zone!'
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.ai_reply_draft_events'::regclass) <> 10
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.ai_reply_draft_events'::regclass AND conname IN
      ('ai_reply_draft_events_pkey','ai_reply_draft_revision_check','ai_reply_draft_kind_check','ai_reply_draft_text_check','ai_reply_draft_reasons_check','ai_reply_draft_prompt_tokens_check','ai_reply_draft_completion_tokens_check','ai_reply_draft_cost_check','ai_reply_draft_company_request_key','ai_reply_draft_company_revision_key')) <> 10
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_reply_draft_events'::regclass AND NOT convalidated)
  THEN RAISE EXCEPTION 'AI_DRAFT_SCHEMA_MISMATCH'; END IF;
END $$;
CREATE INDEX IF NOT EXISTS ai_reply_draft_lead_time_idx ON public.ai_reply_draft_events (company_id, lead_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS ai_reply_draft_company_time_idx ON public.ai_reply_draft_events (company_id, recorded_at);
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_index WHERE indrelid='public.ai_reply_draft_events'::regclass) <> 5 OR
    EXISTS (SELECT 1 FROM pg_index WHERE indrelid='public.ai_reply_draft_events'::regclass AND NOT indisvalid)
    OR (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.ai_reply_draft_events'::regclass
      AND c.relname IN ('ai_reply_draft_events_pkey','ai_reply_draft_company_request_key','ai_reply_draft_company_revision_key','ai_reply_draft_lead_time_idx','ai_reply_draft_company_time_idx')) <> 5
  THEN RAISE EXCEPTION 'AI_DRAFT_INDEX_MISMATCH'; END IF;
END $$;
ALTER TABLE public.ai_reply_draft_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_reply_draft_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_reply_draft_events FROM service_role;
GRANT SELECT, INSERT ON public.ai_reply_draft_events TO service_role;

CREATE OR REPLACE FUNCTION public.ai_reply_draft_command_v1(
  _command text, _company_id uuid, _actor_id uuid, _request_id text,
  _lead_id uuid, _draft_id uuid, _expected_revision integer, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.ai_reply_draft_events%ROWTYPE; latest public.ai_reply_draft_events%ROWTYPE;
  created public.ai_reply_draft_events%ROWTYPE; command_input jsonb; next_kind text;
BEGIN
  IF _company_id IS NULL OR _lead_id IS NULL OR _draft_id IS NULL
    OR nullif(btrim(_request_id),'') IS NULL OR _expected_revision IS NULL OR _expected_revision < 0
    OR _payload IS NULL OR jsonb_typeof(_payload) <> 'object'
    OR _command IS NULL OR _command NOT IN ('generated','discarded','edited','sent_by_human','rejected')
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  IF (_command IN ('generated','discarded') AND _expected_revision <> 0)
    OR (_command NOT IN ('generated','discarded') AND (_expected_revision < 1 OR _actor_id IS NULL))
    OR (_payload - ARRAY['draft_text','policy_reasons','model','prompt_version',
      'prompt_tokens','completion_tokens','cost_vnd']) <> '{}'::jsonb
    OR jsonb_typeof(_payload->'policy_reasons') NOT IN ('array','null') OR jsonb_typeof(_payload->'draft_text') NOT IN ('string','null')
    OR jsonb_typeof(_payload->'model') NOT IN ('string','null') OR jsonb_typeof(_payload->'prompt_version') NOT IN ('string','null')
    OR jsonb_typeof(_payload->'prompt_tokens') NOT IN ('number','null') OR jsonb_typeof(_payload->'completion_tokens') NOT IN ('number','null')
    OR jsonb_typeof(_payload->'cost_vnd') NOT IN ('number','null')
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  next_kind := upper(_command);
  IF (_command = 'discarded' AND _payload->>'draft_text' IS NOT NULL)
    OR (_command IN ('generated','edited','sent_by_human') AND
      (nullif(btrim(_payload->>'draft_text'),'') IS NULL OR char_length(_payload->>'draft_text') > 2000))
    OR (_command = 'rejected' AND _payload->>'draft_text' IS NOT NULL)
    OR (jsonb_typeof(_payload->'policy_reasons') = 'array' AND EXISTS
      (SELECT 1 FROM jsonb_array_elements_text(_payload->'policy_reasons') r
       WHERE r IS NULL OR r !~ '^[A-Z][A-Z0-9_]{0,63}$'))
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  command_input := jsonb_build_object('command',_command,'actorId',_actor_id,'leadId',_lead_id,'draftId',_draft_id,'expectedRevision',_expected_revision,'payload',_payload);
  SELECT * INTO previous FROM public.ai_reply_draft_events WHERE company_id=_company_id AND request_id=_request_id;
  IF FOUND THEN
    IF previous.input <> command_input THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('event',to_jsonb(previous));
  END IF;
  SELECT * INTO latest FROM public.ai_reply_draft_events WHERE company_id=_company_id AND draft_id=_draft_id ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND AND EXISTS (SELECT 1 FROM public.ai_reply_draft_events WHERE draft_id=_draft_id AND company_id <> _company_id)
  THEN RAISE EXCEPTION 'COMPANY_MISMATCH'; END IF;
  IF FOUND AND latest.lead_id <> _lead_id THEN RAISE EXCEPTION 'COMPANY_MISMATCH'; END IF;
  IF latest.kind IN ('SENT_BY_HUMAN','REJECTED') THEN RAISE EXCEPTION 'DRAFT_CLOSED'; END IF;
  IF coalesce(latest.revision,0) <> _expected_revision THEN
    SELECT * INTO previous FROM public.ai_reply_draft_events WHERE company_id=_company_id AND request_id=_request_id;
    IF FOUND THEN
      IF previous.input <> command_input THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
      RETURN jsonb_build_object('event',to_jsonb(previous));
    END IF;
    RAISE EXCEPTION 'REVISION_CONFLICT';
  END IF;
  BEGIN
    INSERT INTO public.ai_reply_draft_events(company_id,lead_id,draft_id,revision,kind,draft_text,
      policy_reasons,model,prompt_version,prompt_tokens,completion_tokens,cost_vnd,actor_id,request_id,input)
    VALUES (_company_id,_lead_id,_draft_id,_expected_revision+1,next_kind,_payload->>'draft_text',
      _payload->'policy_reasons',_payload->>'model',_payload->>'prompt_version',
      (_payload->>'prompt_tokens')::integer,(_payload->>'completion_tokens')::integer,
      (_payload->>'cost_vnd')::bigint,_actor_id,_request_id,command_input) RETURNING * INTO created;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO previous FROM public.ai_reply_draft_events WHERE company_id=_company_id AND request_id=_request_id;
    IF FOUND THEN
      IF previous.input <> command_input THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
      RETURN jsonb_build_object('event',to_jsonb(previous));
    END IF;
    RAISE EXCEPTION 'REVISION_CONFLICT';
  END;
  RETURN jsonb_build_object('event',to_jsonb(created));
END $$;
REVOKE ALL ON FUNCTION public.ai_reply_draft_command_v1(text,uuid,uuid,text,uuid,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_reply_draft_command_v1(text,uuid,uuid,text,uuid,uuid,integer,jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.ai_reply_draft_command_v1(text,uuid,uuid,text,uuid,uuid,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.ai_reply_draft_usage_v1(_company_id uuid, _lead_id uuid, _day date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('drafts',count(*)::integer,
    'tokens',coalesce(sum(coalesce(e.prompt_tokens,0)+coalesce(e.completion_tokens,0)),0)::integer,
    'vnd',coalesce(sum(e.cost_vnd),0)::bigint,'drafts_for_lead',count(*) FILTER (WHERE e.lead_id=_lead_id)::integer)
  FROM public.ai_reply_draft_events e WHERE e.company_id=_company_id AND e.kind IN ('GENERATED','DISCARDED')
    AND (e.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = _day
$$;
REVOKE ALL ON FUNCTION public.ai_reply_draft_usage_v1(uuid,uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_reply_draft_usage_v1(uuid,uuid,date) FROM service_role;
GRANT EXECUTE ON FUNCTION public.ai_reply_draft_usage_v1(uuid,uuid,date) TO service_role;
COMMIT;
