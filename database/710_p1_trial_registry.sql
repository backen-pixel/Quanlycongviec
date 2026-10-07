-- P1 trial registry only; apply after 702, before later P1 migrations.
-- Verify catalog/ACL/RLS, run twice on a schema copy, then test rollback there.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.p1_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  start_date date,
  end_date date,
  cap_vnd bigint NOT NULL DEFAULT 100000000 CHECK (cap_vnd > 0),
  hcm_share_pct integer NOT NULL DEFAULT 80,
  can_tho_share_pct integer NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','CLOSED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p1_trials_share_check CHECK (hcm_share_pct BETWEEN 0 AND 100 AND can_tho_share_pct BETWEEN 0 AND 100 AND hcm_share_pct + can_tho_share_pct = 100),
  CONSTRAINT p1_trials_dates_check CHECK (status = 'DRAFT' OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date - start_date = 29)),
  CONSTRAINT p1_trials_company_id_id_key UNIQUE (company_id, id)
);
CREATE TABLE IF NOT EXISTS public.p1_trial_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.p1_trials(id),
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('FACEBOOK','GOOGLE')),
  account_id text NOT NULL,
  campaign_id text,
  include_from_date date,
  include_to_date date,
  budget_region text CHECK (budget_region IN ('HCM','CAN_THO')),
  scope_revision integer NOT NULL DEFAULT 1 CHECK (scope_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p1_trial_scopes_dates_check CHECK (include_from_date IS NULL OR include_to_date IS NULL OR include_from_date <= include_to_date),
  CONSTRAINT p1_trial_scopes_company_trial_fk FOREIGN KEY (company_id, trial_id) REFERENCES public.p1_trials(company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS p1_trial_scopes_identity_uidx ON public.p1_trial_scopes
  (trial_id, provider, account_id, campaign_id, include_from_date, include_to_date) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS p1_trial_scopes_company_trial_idx ON public.p1_trial_scopes(company_id, trial_id);
CREATE TABLE IF NOT EXISTS public.p1_trial_config_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  trial_id uuid NOT NULL REFERENCES public.p1_trials(id),
  actor_id uuid NOT NULL,
  request_id text NOT NULL,
  before_revision integer,
  change jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p1_trial_config_events_company_request_key UNIQUE (company_id, request_id),
  CONSTRAINT p1_trial_config_events_company_trial_fk FOREIGN KEY (company_id, trial_id) REFERENCES public.p1_trials(company_id, id)
);
CREATE INDEX IF NOT EXISTS p1_trial_config_events_trial_recorded_idx ON public.p1_trial_config_events(trial_id, recorded_at);

-- CREATE IF NOT EXISTS is insufficient if a prior object has the same name.
DO $$
DECLARE spec record; required_name text;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('p1_trials', 'id:uuid!,company_id:uuid!,name:text!,timezone:text!,start_date:date,end_date:date,cap_vnd:bigint!,hcm_share_pct:integer!,can_tho_share_pct:integer!,status:text!,revision:integer!,approved_by:uuid,approved_at:timestamp with time zone,created_at:timestamp with time zone!,updated_at:timestamp with time zone!', 7, 1),
    ('p1_trial_scopes', 'id:uuid!,trial_id:uuid!,company_id:uuid!,provider:text!,account_id:text!,campaign_id:text,include_from_date:date,include_to_date:date,budget_region:text,scope_revision:integer!,created_at:timestamp with time zone!', 7, 2),
    ('p1_trial_config_events', 'id:uuid!,company_id:uuid!,trial_id:uuid!,actor_id:uuid!,request_id:text!,before_revision:integer,change:jsonb!,recorded_at:timestamp with time zone!', 4, 2)
  ) AS v(table_name, columns, constraints_count, indexes_count) LOOP
    IF (SELECT string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) || CASE WHEN a.attnotnull THEN '!' ELSE '' END, ',' ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid = ('public.' || spec.table_name)::regclass AND a.attnum > 0 AND NOT a.attisdropped) <> spec.columns
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid = ('public.' || spec.table_name)::regclass) <> spec.constraints_count
      OR (SELECT count(*) - 1 FROM pg_index WHERE indrelid = ('public.' || spec.table_name)::regclass) <> spec.indexes_count
    THEN RAISE EXCEPTION 'P1_REGISTRY_SCHEMA_MISMATCH: %', spec.table_name; END IF;
    FOR required_name IN SELECT unnest(CASE spec.table_name
      WHEN 'p1_trials' THEN ARRAY['p1_trials_pkey','p1_trials_company_id_id_key','p1_trials_cap_vnd_check','p1_trials_status_check','p1_trials_revision_check','p1_trials_share_check','p1_trials_dates_check']
      WHEN 'p1_trial_scopes' THEN ARRAY['p1_trial_scopes_pkey','p1_trial_scopes_trial_id_fkey','p1_trial_scopes_company_trial_fk','p1_trial_scopes_provider_check','p1_trial_scopes_budget_region_check','p1_trial_scopes_scope_revision_check','p1_trial_scopes_dates_check']
      ELSE ARRAY['p1_trial_config_events_pkey','p1_trial_config_events_trial_id_fkey','p1_trial_config_events_company_trial_fk','p1_trial_config_events_company_request_key'] END) LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=('public.' || spec.table_name)::regclass AND conname=required_name AND convalidated)
      THEN RAISE EXCEPTION 'P1_REGISTRY_CONSTRAINT_MISMATCH: %', required_name; END IF;
    END LOOP;
    FOR required_name IN SELECT unnest(CASE spec.table_name
      WHEN 'p1_trials' THEN ARRAY['p1_trials_pkey','p1_trials_company_id_id_key']
      WHEN 'p1_trial_scopes' THEN ARRAY['p1_trial_scopes_pkey','p1_trial_scopes_identity_uidx','p1_trial_scopes_company_trial_idx']
      ELSE ARRAY['p1_trial_config_events_pkey','p1_trial_config_events_company_request_key','p1_trial_config_events_trial_recorded_idx'] END) LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
        WHERE i.indrelid=('public.' || spec.table_name)::regclass AND c.relname=required_name AND i.indisvalid
          AND (required_name <> 'p1_trial_scopes_identity_uidx' OR (i.indisunique AND i.indnullsnotdistinct)))
      THEN RAISE EXCEPTION 'P1_REGISTRY_INDEX_MISMATCH: %', required_name; END IF;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.p1_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p1_trial_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p1_trial_config_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.p1_trials, public.p1_trial_scopes, public.p1_trial_config_events FROM PUBLIC, anon, authenticated;
-- Supabase default privileges grant service_role ALL on new public tables; remove it so the
-- grants below are the only ones (events stay append-only, nothing can DELETE/TRUNCATE).
REVOKE ALL ON public.p1_trials, public.p1_trial_scopes, public.p1_trial_config_events FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.p1_trials, public.p1_trial_scopes TO service_role;
GRANT SELECT, INSERT ON public.p1_trial_config_events TO service_role;

-- One PostgREST RPC is one transaction: state and its immutable event commit together.
CREATE OR REPLACE FUNCTION public.p1_trial_command_v1(
  _command text, _company_id uuid, _actor_id uuid, _request_id text,
  _trial_id uuid DEFAULT NULL, _expected_revision integer DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.p1_trials%ROWTYPE; s public.p1_trial_scopes%ROWTYPE;
  old_event public.p1_trial_config_events%ROWTYPE; input jsonb; result jsonb; before_rev integer;
BEGIN
  IF _company_id IS NULL OR _actor_id IS NULL OR nullif(btrim(_request_id),'') IS NULL
    OR _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  input := jsonb_build_object('command',_command,'trialId',_trial_id,'expectedRevision',_expected_revision,'payload',_payload,'actorId',_actor_id);
  SELECT * INTO old_event FROM public.p1_trial_config_events WHERE company_id=_company_id AND request_id=_request_id;
  IF FOUND THEN
    IF old_event.change->'input' <> input THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
    RETURN old_event.change->'result';
  END IF;
  IF _command = 'create' THEN
    IF _trial_id IS NOT NULL OR _expected_revision IS NOT NULL OR
      (_payload - ARRAY['name','timezone','start_date','end_date','cap_vnd','hcm_share_pct','can_tho_share_pct']) <> '{}'::jsonb
      OR nullif(btrim(_payload->>'name'),'') IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    INSERT INTO public.p1_trials(company_id,name,timezone,start_date,end_date,cap_vnd,hcm_share_pct,can_tho_share_pct)
    VALUES (_company_id,_payload->>'name',coalesce(_payload->>'timezone','Asia/Ho_Chi_Minh'),
      (_payload->>'start_date')::date,(_payload->>'end_date')::date,
      coalesce((_payload->>'cap_vnd')::bigint,100000000),
      coalesce((_payload->>'hcm_share_pct')::integer,80),coalesce((_payload->>'can_tho_share_pct')::integer,20)) RETURNING * INTO t;
  ELSE
    SELECT * INTO t FROM public.p1_trials WHERE id=_trial_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_NOT_FOUND'; END IF;
    IF t.company_id <> _company_id THEN RAISE EXCEPTION 'COMPANY_MISMATCH'; END IF;
    IF _expected_revision IS NULL OR t.revision <> _expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
    IF t.status = 'CLOSED' THEN RAISE EXCEPTION 'TRIAL_CLOSED'; END IF;
    before_rev := t.revision;
    IF _command = 'update' THEN
      IF (_payload - ARRAY['name','timezone','start_date','end_date','cap_vnd','hcm_share_pct','can_tho_share_pct','reason']) <> '{}'::jsonb
        OR (t.status = 'APPROVED' AND nullif(btrim(_payload->>'reason'),'') IS NULL) THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
      UPDATE public.p1_trials SET
        name=CASE WHEN _payload ? 'name' THEN _payload->>'name' ELSE name END,
        timezone=CASE WHEN _payload ? 'timezone' THEN _payload->>'timezone' ELSE timezone END,
        start_date=CASE WHEN _payload ? 'start_date' THEN (_payload->>'start_date')::date ELSE start_date END,
        end_date=CASE WHEN _payload ? 'end_date' THEN (_payload->>'end_date')::date ELSE end_date END,
        cap_vnd=CASE WHEN _payload ? 'cap_vnd' THEN (_payload->>'cap_vnd')::bigint ELSE cap_vnd END,
        hcm_share_pct=CASE WHEN _payload ? 'hcm_share_pct' THEN (_payload->>'hcm_share_pct')::integer ELSE hcm_share_pct END,
        can_tho_share_pct=CASE WHEN _payload ? 'can_tho_share_pct' THEN (_payload->>'can_tho_share_pct')::integer ELSE can_tho_share_pct END,
        status=CASE WHEN status='APPROVED' THEN 'DRAFT' ELSE status END,
        approved_by=NULL, approved_at=NULL, revision=revision+1, updated_at=now()
      WHERE id=_trial_id AND company_id=_company_id AND revision=_expected_revision RETURNING * INTO t;
    ELSIF _command = 'scope' THEN
      IF (_payload - ARRAY['provider','account_id','campaign_id','include_from_date','include_to_date','budget_region','reason']) <> '{}'::jsonb
        OR nullif(btrim(_payload->>'account_id'),'') IS NULL
        OR (t.status='APPROVED' AND nullif(btrim(_payload->>'reason'),'') IS NULL) THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
      UPDATE public.p1_trials SET status=CASE WHEN status='APPROVED' THEN 'DRAFT' ELSE status END,
        approved_by=NULL, approved_at=NULL, revision=revision+1, updated_at=now()
      WHERE id=_trial_id AND company_id=_company_id AND revision=_expected_revision RETURNING * INTO t;
      INSERT INTO public.p1_trial_scopes(trial_id,company_id,provider,account_id,campaign_id,include_from_date,include_to_date,budget_region)
      VALUES (_trial_id,_company_id,_payload->>'provider',_payload->>'account_id',_payload->>'campaign_id',
        (_payload->>'include_from_date')::date,(_payload->>'include_to_date')::date,_payload->>'budget_region') RETURNING * INTO s;
    ELSIF _command = 'approve' THEN
      IF _payload <> '{}'::jsonb OR t.status <> 'DRAFT' OR t.start_date IS NULL OR t.end_date IS NULL OR t.end_date - t.start_date <> 29
        OR t.hcm_share_pct + t.can_tho_share_pct <> 100
        OR NOT EXISTS (SELECT 1 FROM public.p1_trial_scopes WHERE trial_id=_trial_id AND company_id=_company_id)
      THEN RAISE EXCEPTION 'TRIAL_NOT_READY'; END IF;
      UPDATE public.p1_trials SET status='APPROVED',approved_by=_actor_id,approved_at=now(),revision=revision+1,updated_at=now()
      WHERE id=_trial_id AND company_id=_company_id AND revision=_expected_revision RETURNING * INTO t;
    ELSIF _command = 'close' THEN
      IF _payload <> '{}'::jsonb OR t.status <> 'APPROVED' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
      UPDATE public.p1_trials SET status='CLOSED',revision=revision+1,updated_at=now()
      WHERE id=_trial_id AND company_id=_company_id AND revision=_expected_revision RETURNING * INTO t;
    ELSE RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    IF t.id IS NULL THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  END IF;
  result := jsonb_build_object('trial',to_jsonb(t),'scope',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END);
  INSERT INTO public.p1_trial_config_events(company_id,trial_id,actor_id,request_id,before_revision,change)
  VALUES (_company_id,t.id,_actor_id,_request_id,before_rev,jsonb_build_object('input',input,'result',result));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.p1_trial_command_v1(text,uuid,uuid,text,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p1_trial_command_v1(text,uuid,uuid,text,uuid,integer,jsonb) TO service_role;
COMMIT;
