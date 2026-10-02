-- New evidence only. Does not alter historical spend or enable any worker.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_spend_sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  ad_account_id text NOT NULL,
  since date NOT NULL,
  until date NOT NULL,
  state text NOT NULL DEFAULT 'RUNNING' CHECK (state IN ('RUNNING','COMPLETE','FAILED')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  snapshot jsonb,
  failure_code text,
  CHECK (until >= since AND until - since <= 92),
  CHECK ((state = 'RUNNING' AND finished_at IS NULL AND snapshot IS NULL AND failure_code IS NULL)
    OR (state = 'COMPLETE' AND finished_at IS NOT NULL AND snapshot IS NOT NULL AND failure_code IS NULL)
    OR (state = 'FAILED' AND finished_at IS NOT NULL AND snapshot IS NULL AND failure_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS marketing_spend_sync_latest ON public.marketing_spend_sync_runs(company_id, ad_account_id, id DESC);
ALTER TABLE public.marketing_spend_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_spend_sync_runs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.marketing_spend_sync_runs_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marketing_spend_begin(p_account text, p_company uuid, p_since date, p_until date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.marketing_spend_sync_runs;
BEGIN
  IF p_account IS NULL OR p_account !~ '^act_[0-9]+$' OR p_company IS NULL
    OR p_since IS NULL OR p_until IS NULL OR p_until < p_since OR p_until - p_since > 92
    OR p_until > (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Invalid spend scope' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.fb_ad_accounts WHERE ad_account_id=p_account AND company_id=p_company AND bat IS TRUE
    AND (token_het_han IS NULL OR token_het_han > clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account scope denied' USING ERRCODE='42501'; END IF;
  INSERT INTO public.marketing_spend_sync_runs(company_id,ad_account_id,since,until)
    VALUES(p_company,p_account,p_since,p_until) RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_spend_finish(p_id bigint, p_company uuid, p_snapshot jsonb, p_failure text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.marketing_spend_sync_runs; d jsonb; day date; amount numeric;
  total numeric := 0; seen date[] := '{}'; expected integer;
BEGIN
  SELECT * INTO r FROM public.marketing_spend_sync_runs WHERE id=p_id AND company_id=p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Spend run denied' USING ERRCODE='42501'; END IF;
  IF r.state <> 'RUNNING' THEN
    IF (r.state='COMPLETE' AND r.snapshot IS NOT DISTINCT FROM p_snapshot AND p_failure IS NULL)
      OR (r.state='FAILED' AND r.failure_code IS NOT DISTINCT FROM p_failure AND p_snapshot IS NULL) THEN RETURN to_jsonb(r); END IF;
    RAISE EXCEPTION 'Spend run is terminal' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.fb_ad_accounts WHERE ad_account_id=r.ad_account_id AND company_id=p_company AND bat IS TRUE
    AND (token_het_han IS NULL OR token_het_han > clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account scope revoked' USING ERRCODE='42501'; END IF;
  IF p_failure IS NOT NULL THEN
    IF p_snapshot IS NOT NULL OR p_failure !~ '^[A-Z_]{1,64}$' THEN RAISE EXCEPTION 'Invalid failure code' USING ERRCODE='22023'; END IF;
    UPDATE public.marketing_spend_sync_runs SET state='FAILED',failure_code=p_failure,finished_at=clock_timestamp() WHERE id=p_id RETURNING * INTO r;
    RETURN to_jsonb(r);
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
    OR p_snapshot->>'accountId' IS DISTINCT FROM r.ad_account_id OR p_snapshot->>'currency' IS DISTINCT FROM 'VND'
    OR (p_snapshot->>'timezone' = ANY(ARRAY['Asia/Ho_Chi_Minh','Asia/Saigon','Asia/Bangkok'])) IS NOT TRUE
    OR p_snapshot->>'source' IS DISTINCT FROM 'META_ACCOUNT_INSIGHTS_V1'
    OR p_snapshot->>'since' IS DISTINCT FROM r.since::text OR p_snapshot->>'until' IS DISTINCT FROM r.until::text
    OR jsonb_typeof(p_snapshot->'days') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'totalVnd') IS DISTINCT FROM 'number'
    OR (p_snapshot->>'totalVnd' ~ '^(0|[1-9][0-9]*)$') IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid spend snapshot' USING ERRCODE='22023';
  END IF;
  expected := r.until-r.since+1;
  IF jsonb_array_length(p_snapshot->'days') <> expected THEN RAISE EXCEPTION 'Missing spend days' USING ERRCODE='22023'; END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(p_snapshot->'days') LOOP
    IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR (d->>'date' ~ '^\d{4}-\d{2}-\d{2}$') IS NOT TRUE
      OR jsonb_typeof(d->'amountVnd') IS DISTINCT FROM 'number'
      OR (d->>'amountVnd' ~ '^(0|[1-9][0-9]*)$') IS NOT TRUE THEN RAISE EXCEPTION 'Invalid daily spend' USING ERRCODE='22023'; END IF;
    day := (d->>'date')::date; amount := (d->>'amountVnd')::numeric;
    IF day<r.since OR day>r.until OR day=ANY(seen) OR amount>9007199254740991 THEN RAISE EXCEPTION 'Invalid daily spend' USING ERRCODE='22023'; END IF;
    seen := array_append(seen,day); total := total+amount;
  END LOOP;
  IF total<>(p_snapshot->>'totalVnd')::numeric OR total>9007199254740991 THEN RAISE EXCEPTION 'Spend total mismatch' USING ERRCODE='22023'; END IF;
  -- Store only the validated fields, never arbitrary upstream data or tokens.
  UPDATE public.marketing_spend_sync_runs SET state='COMPLETE',finished_at=clock_timestamp(),snapshot=jsonb_build_object(
    'accountId',r.ad_account_id,'currency','VND','timezone',p_snapshot->>'timezone','source','META_ACCOUNT_INSIGHTS_V1',
    'since',r.since::text,'until',r.until::text,'totalVnd',total,'days',
    (SELECT jsonb_agg(jsonb_build_object('date',x->>'date','amountVnd',(x->>'amountVnd')::numeric) ORDER BY x->>'date') FROM jsonb_array_elements(p_snapshot->'days') x)
  ) WHERE id=p_id RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_spend_latest(p_company uuid)
RETURNS SETOF public.marketing_spend_sync_runs LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT DISTINCT ON (r.ad_account_id) r.* FROM public.marketing_spend_sync_runs r
  JOIN public.fb_ad_accounts a ON a.ad_account_id=r.ad_account_id AND a.company_id=r.company_id AND a.bat IS TRUE
  WHERE r.company_id=p_company ORDER BY r.ad_account_id,r.id DESC;
$$;
REVOKE ALL ON FUNCTION public.marketing_spend_begin(text,uuid,date,date), public.marketing_spend_finish(bigint,uuid,jsonb,text), public.marketing_spend_latest(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_spend_begin(text,uuid,date,date), public.marketing_spend_finish(bigint,uuid,jsonb,text), public.marketing_spend_latest(uuid) TO service_role;
COMMIT;
