-- P1-10: immutable snapshots; never replace evidence after Meta's window moves.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.p1_trial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  as_of timestamptz NOT NULL,
  summary jsonb NOT NULL CONSTRAINT p1_trial_snapshots_summary_type_check CHECK (jsonb_typeof(summary) = 'object'),
  spend_by_day jsonb NOT NULL CONSTRAINT p1_trial_snapshots_day_type_check CHECK (jsonb_typeof(spend_by_day) = 'array'),
  source_note text CONSTRAINT p1_trial_snapshots_note_check CHECK (char_length(source_note) <= 200),
  CONSTRAINT p1_trial_snapshots_summary_size_check CHECK (pg_column_size(summary) <= 262144),
  CONSTRAINT p1_trial_snapshots_day_size_check CHECK (pg_column_size(spend_by_day) <= 262144),
  CONSTRAINT p1_trial_snapshots_company_trial_fk FOREIGN KEY (company_id, trial_id)
    REFERENCES public.p1_trials(company_id, id)
);
CREATE INDEX IF NOT EXISTS p1_trial_snapshots_trial_taken_idx
  ON public.p1_trial_snapshots(trial_id, taken_at DESC);

-- CREATE IF NOT EXISTS must fail on an incompatible pre-existing object.
DO $$
DECLARE required_name text;
BEGIN
  IF (SELECT string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) ||
       CASE WHEN a.attnotnull THEN '!' ELSE '' END, ',' ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid='public.p1_trial_snapshots'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped) <>
      'id:uuid!,company_id:uuid!,trial_id:uuid!,taken_at:timestamp with time zone!,as_of:timestamp with time zone!,summary:jsonb!,spend_by_day:jsonb!,source_note:text'
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.p1_trial_snapshots'::regclass) <> 7
    OR (SELECT count(*) FROM pg_index WHERE indrelid='public.p1_trial_snapshots'::regclass) <> 2
  THEN RAISE EXCEPTION 'P1_SNAPSHOT_SCHEMA_MISMATCH'; END IF;
  FOREACH required_name IN ARRAY ARRAY[
    'p1_trial_snapshots_pkey','p1_trial_snapshots_company_trial_fk',
    'p1_trial_snapshots_summary_type_check','p1_trial_snapshots_day_type_check',
    'p1_trial_snapshots_note_check','p1_trial_snapshots_summary_size_check',
    'p1_trial_snapshots_day_size_check'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.p1_trial_snapshots'::regclass
      AND conname=required_name AND convalidated)
    THEN RAISE EXCEPTION 'P1_SNAPSHOT_CONSTRAINT_MISMATCH: %', required_name; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid='public.p1_trial_snapshots'::regclass
      AND d.adnum=1 AND pg_get_expr(d.adbin,d.adrelid)='gen_random_uuid()')
    OR NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid='public.p1_trial_snapshots'::regclass
      AND d.adnum=4 AND pg_get_expr(d.adbin,d.adrelid)='now()')
    OR EXISTS (SELECT 1 FROM (VALUES
      ('p1_trial_snapshots_summary_type_check','jsonb_typeof[(]summary[)].*=[[:space:]]*''object'''),
      ('p1_trial_snapshots_day_type_check','jsonb_typeof[(]spend_by_day[)].*=[[:space:]]*''array'''),
      ('p1_trial_snapshots_note_check','char_length[(]source_note[)].*<= 200'),
      ('p1_trial_snapshots_summary_size_check','pg_column_size[(]summary[)].*<= 262144'),
      ('p1_trial_snapshots_day_size_check','pg_column_size[(]spend_by_day[)].*<= 262144')
    ) spec(name, pattern) JOIN pg_constraint c ON c.conname=spec.name
      WHERE c.conrelid='public.p1_trial_snapshots'::regclass
        AND pg_get_constraintdef(c.oid) !~ spec.pattern)
  THEN RAISE EXCEPTION 'P1_SNAPSHOT_DEFINITION_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.p1_trial_snapshots'::regclass
      AND c.conname='p1_trial_snapshots_company_trial_fk' AND c.confrelid='public.p1_trials'::regclass
      AND c.conkey = ARRAY[2,3]::smallint[] AND c.confkey = ARRAY[2,1]::smallint[])
    OR NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      WHERE i.indrelid='public.p1_trial_snapshots'::regclass
        AND c.relname='p1_trial_snapshots_trial_taken_idx' AND i.indisvalid
        AND i.indkey::text='3 4' AND (i.indoption[1] & 1) = 1)
  THEN RAISE EXCEPTION 'P1_SNAPSHOT_INDEX_OR_FK_MISMATCH'; END IF;
END $$;

ALTER TABLE public.p1_trial_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.p1_trial_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.p1_trial_snapshots FROM service_role;
GRANT SELECT, INSERT ON public.p1_trial_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.p1_trial_snapshot_put_v1(
  _company_id uuid, _trial_id uuid, _as_of timestamptz,
  _summary jsonb, _spend_by_day jsonb, _source_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.p1_trials%ROWTYPE; created public.p1_trial_snapshots%ROWTYPE;
BEGIN
  IF _company_id IS NULL OR _trial_id IS NULL OR _as_of IS NULL
    OR _summary IS NULL OR jsonb_typeof(_summary) <> 'object'
    OR _spend_by_day IS NULL OR jsonb_typeof(_spend_by_day) <> 'array'
    OR char_length(_source_note) > 200 OR pg_column_size(_summary) > 262144
    OR pg_column_size(_spend_by_day) > 262144
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_spend_by_day) AS x(value) WHERE
      jsonb_typeof(x.value) IS DISTINCT FROM 'object' OR (x.value - ARRAY['account_id','day','vnd']) <> '{}'::jsonb
      OR jsonb_typeof(x.value->'account_id') IS DISTINCT FROM 'string' OR nullif(x.value->>'account_id','') IS NULL
      OR jsonb_typeof(x.value->'day') IS DISTINCT FROM 'string' OR (x.value->>'day') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR jsonb_typeof(x.value->'vnd') IS DISTINCT FROM 'number' OR (x.value->>'vnd') !~ '^(0|[1-9][0-9]*)$')
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  SELECT * INTO t FROM public.p1_trials WHERE id=_trial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_NOT_FOUND'; END IF;
  IF t.company_id <> _company_id THEN RAISE EXCEPTION 'COMPANY_MISMATCH'; END IF;
  INSERT INTO public.p1_trial_snapshots(company_id,trial_id,as_of,summary,spend_by_day,source_note)
  VALUES (_company_id,_trial_id,_as_of,_summary,_spend_by_day,_source_note) RETURNING * INTO created;
  RETURN jsonb_build_object('snapshot',to_jsonb(created));
END $$;
REVOKE ALL ON FUNCTION public.p1_trial_snapshot_put_v1(uuid,uuid,timestamptz,jsonb,jsonb,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.p1_trial_snapshot_put_v1(uuid,uuid,timestamptz,jsonb,jsonb,text)
  TO service_role;
COMMIT;
