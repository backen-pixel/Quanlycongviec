-- Disabled-by-default application command queue. No source Finance ledger,
-- provider credentials, policy grants or live campaigns are seeded here.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_automation_grants (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  actor_id uuid NOT NULL,
  policy_version text NOT NULL,
  actions text[] NOT NULL CHECK (cardinality(actions) > 0 AND array_position(actions,NULL) IS NULL
    AND actions <@ ARRAY['content.publish','sales.reply','survey.reserve','ads.pause','ads.budget_move']::text[]),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (company_id, actor_id)
);
CREATE TABLE IF NOT EXISTS public.marketing_automation_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  actor_id uuid NOT NULL,
  policy_version text NOT NULL,
  action text NOT NULL CHECK (action IN ('content.publish','sales.reply','survey.reserve','ads.pause','ads.budget_move')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','DENIED','UNKNOWN','MANUAL_REQUIRED')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (company_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.marketing_automation_command_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  command_id uuid NOT NULL REFERENCES public.marketing_automation_commands(id),
  company_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  state text NOT NULL,
  happened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.marketing_automation_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_command_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_automation_grants, public.marketing_automation_commands, public.marketing_automation_command_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.marketing_automation_enqueue(
  p_company uuid, p_actor uuid, p_version text, p_action text,
  p_key text, p_digest text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE g public.marketing_automation_grants%ROWTYPE;
  c public.marketing_automation_commands%ROWTYPE;
BEGIN
  -- Serialize grant/revocation, then duplicate admission in the same transaction.
  SELECT * INTO g FROM public.marketing_automation_grants
    WHERE company_id=p_company AND actor_id=p_actor FOR UPDATE;
  IF NOT FOUND OR g.revoked_at IS NOT NULL OR g.expires_at <= clock_timestamp()
    OR g.policy_version IS DISTINCT FROM p_version OR (p_action = ANY(g.actions)) IS NOT TRUE THEN
    RAISE EXCEPTION 'AUTOMATION_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO c FROM public.marketing_automation_commands
    WHERE company_id=p_company AND idempotency_key=p_key;
  IF FOUND THEN
    IF c.actor_id IS DISTINCT FROM p_actor OR c.policy_version IS DISTINCT FROM p_version OR c.action IS DISTINCT FROM p_action
       OR c.request_digest IS DISTINCT FROM p_digest OR c.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';
    END IF;
    RETURN to_jsonb(c);
  END IF;
  INSERT INTO public.marketing_automation_commands(company_id,actor_id,policy_version,action,idempotency_key,request_digest,payload)
    VALUES(p_company,p_actor,p_version,p_action,p_key,p_digest,p_payload) RETURNING * INTO c;
  INSERT INTO public.marketing_automation_command_audit(command_id,company_id,actor_id,state)
    VALUES(c.id,c.company_id,c.actor_id,c.state);
  RETURN to_jsonb(c);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_automation_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE c public.marketing_automation_commands%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.marketing_automation_commands WHERE state='QUEUED'
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Execution also rechecks approval/source freshness immediately before send.
  UPDATE public.marketing_automation_commands SET state='RUNNING',started_at=clock_timestamp()
    WHERE id=c.id RETURNING * INTO c;
  INSERT INTO public.marketing_automation_command_audit(command_id,company_id,actor_id,state)
    VALUES(c.id,c.company_id,c.actor_id,c.state);
  RETURN to_jsonb(c);
END $$;

CREATE OR REPLACE FUNCTION public.marketing_automation_finish(p_id uuid,p_company uuid,p_state text,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE c public.marketing_automation_commands%ROWTYPE;
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('SUCCEEDED','DENIED','UNKNOWN','MANUAL_REQUIRED') THEN RAISE EXCEPTION 'INVALID_RESULT'; END IF;
  SELECT * INTO c FROM public.marketing_automation_commands WHERE id=p_id AND company_id=p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMAND_NOT_FOUND'; END IF;
  IF c.state=p_state AND c.result=p_result THEN RETURN to_jsonb(c); END IF;
  IF c.state <> 'RUNNING' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
  UPDATE public.marketing_automation_commands SET state=p_state,result=p_result,completed_at=clock_timestamp()
    WHERE id=c.id RETURNING * INTO c;
  INSERT INTO public.marketing_automation_command_audit(command_id,company_id,actor_id,state)
    VALUES(c.id,c.company_id,c.actor_id,c.state);
  RETURN to_jsonb(c);
END $$;

-- A crash after provider send is not evidence of failure. Never requeue RUNNING.
CREATE OR REPLACE FUNCTION public.marketing_automation_recover(p_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE n integer;
BEGIN
  WITH moved AS (
    UPDATE public.marketing_automation_commands SET state='UNKNOWN',completed_at=clock_timestamp(),
      result=jsonb_build_object('reason','WORKER_INTERRUPTED_RECONCILE_PROVIDER')
    WHERE state='RUNNING' AND started_at < p_before RETURNING *
  ), logged AS (
    INSERT INTO public.marketing_automation_command_audit(command_id,company_id,actor_id,state)
      SELECT id,company_id,actor_id,state FROM moved RETURNING id
  ) SELECT count(*) INTO n FROM logged;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.marketing_automation_enqueue(uuid,uuid,text,text,text,text,jsonb),
  public.marketing_automation_claim(), public.marketing_automation_finish(uuid,uuid,text,jsonb),
  public.marketing_automation_recover(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_automation_enqueue(uuid,uuid,text,text,text,text,jsonb),
  public.marketing_automation_claim(), public.marketing_automation_finish(uuid,uuid,text,jsonb),
  public.marketing_automation_recover(timestamptz) TO service_role;
COMMIT;
