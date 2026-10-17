-- Keep the first Warm/Hot/Lead->Deal evidence eligible in the two known forward
-- Lead stages. This does not create/revise/backfill qualification or change RPC
-- event-creation rules. Applied stage-policy SQL remains immutable.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $migration$
DECLARE definition text; approved boolean;
  before_predicate text := $predicate$(l.type='deal' OR (l.type='lead' AND s.canonical_slug IN ('warm','hot')))$predicate$;
  after_predicate text := $predicate$(l.type='deal' OR (l.type='lead' AND s.canonical_slug IN ('warm','hot','survey_scheduled','survey_done')))$predicate$;
BEGIN
  SELECT pg_get_functiondef(p.oid),
    NOT p.prosecdef AND p.provolatile='s' AND p.prorettype='boolean'::regtype
    AND p.pronargs=1 AND p.proargtypes[0]='uuid'::regtype
    AND p.proconfig=ARRAY['search_path=""']::text[]
    AND encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')=
      '4d29bb5200a555821ad57d78d28bdf50d3fe5c2ac1407f3bbd5d31532ab03b03'
    INTO definition,approved FROM pg_proc p
    WHERE p.oid='public.crm_qualification_evidence_current_v1(uuid)'::regprocedure;
  IF approved IS DISTINCT FROM true OR
    (length(definition)-length(replace(definition,before_predicate,'')))/length(before_predicate)<>1
    THEN RAISE EXCEPTION 'FORWARD_STAGE_EVIDENCE_BASELINE_MISMATCH'; END IF;
  -- Reuse the exact reviewed function definition, replacing only this predicate.
  -- CREATE OR REPLACE preserves its existing owner and EXECUTE ACL.
  EXECUTE replace(definition,before_predicate,after_predicate);
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
