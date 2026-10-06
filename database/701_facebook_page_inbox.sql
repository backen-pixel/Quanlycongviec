-- H1: generic signed Page-event inbox. No backfill, Page enrollment or worker activation.
-- Signature/raw-body verification belongs to the trusted ingress before enqueue.
-- This inbox acknowledges persistence, not successful CRM processing. Never delete failures.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.facebook_page_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_key text NOT NULL UNIQUE CHECK (event_key ~ '^[0-9a-f]{64}$'),
  -- No Page FK: signed events for a Page not configured locally must be retained too.
  page_id text NOT NULL CHECK (length(btrim(page_id)) BETWEEN 1 AND 512 AND page_id=btrim(page_id)),
  payload jsonb NOT NULL CHECK (
    (jsonb_typeof(payload)='object' AND jsonb_typeof(payload->'event')='object'
    AND (payload->>'kind') IN ('messaging','change','entry')
    AND payload ? 'kind' AND payload ? 'event') IS TRUE),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  CHECK ((status='processing' AND lease_token IS NOT NULL AND locked_until IS NOT NULL)
      OR (status<>'processing' AND lease_token IS NULL AND locked_until IS NULL)),
  CHECK ((status='done')=(completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS facebook_page_inbox_unfinished_page
  ON public.facebook_page_inbox(page_id,queue_order) WHERE status<>'done';
CREATE INDEX IF NOT EXISTS facebook_page_inbox_available
  ON public.facebook_page_inbox(available_at,queue_order) WHERE status<>'done';
ALTER TABLE public.facebook_page_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facebook_page_inbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.facebook_page_inbox TO service_role;
REVOKE ALL ON SEQUENCE public.facebook_page_inbox_queue_order_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE,SELECT ON SEQUENCE public.facebook_page_inbox_queue_order_seq TO service_role;

CREATE OR REPLACE FUNCTION public.facebook_page_inbox_enqueue_v1(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path='' SET lock_timeout='1s' SET statement_timeout='5s' AS $$
DECLARE item jsonb; existing public.facebook_page_inbox; accepted integer;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'read committed required' USING ERRCODE='25001';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN
    RAISE EXCEPTION 'invalid inbox batch' USING ERRCODE='22023';
  END IF;
  accepted:=jsonb_array_length(p_rows);
  IF accepted<1 OR accepted>100 THEN RAISE EXCEPTION 'invalid inbox batch size' USING ERRCODE='22023'; END IF;
  -- Validate the whole batch before its first insert. No partial ACK of an invalid batch.
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF (jsonb_typeof(item)='object' AND jsonb_typeof(item->'event_key')='string'
        AND item->>'event_key' ~ '^[0-9a-f]{64}$'
        AND jsonb_typeof(item->'page_id')='string'
        AND length(btrim(item->>'page_id')) BETWEEN 1 AND 512
        AND item->>'page_id'=btrim(item->>'page_id')
        AND jsonb_typeof(item->'payload')='object'
        AND item->'payload'->>'kind' IN ('messaging','change','entry')
        AND jsonb_typeof(item->'payload'->'event')='object') IS NOT TRUE THEN
      RAISE EXCEPTION 'invalid inbox event envelope' USING ERRCODE='22023';
    END IF;
  END LOOP;
  -- A short bounded enqueue gate preserves committed input order across batches and
  -- prevents inverse duplicate-key batches from deadlocking. It is not a worker lease.
  PERFORM pg_advisory_xact_lock(hashtextextended('facebook_page_inbox.enqueue.v1',0));
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.facebook_page_inbox(event_key,page_id,payload)
      VALUES(item->>'event_key',item->>'page_id',item->'payload') ON CONFLICT(event_key) DO NOTHING;
    SELECT * INTO STRICT existing FROM public.facebook_page_inbox WHERE event_key=item->>'event_key';
    IF existing.page_id IS DISTINCT FROM item->>'page_id' OR existing.payload IS DISTINCT FROM item->'payload' THEN
      RAISE EXCEPTION 'inbox event key conflict' USING ERRCODE='23505';
    END IF;
  END LOOP;
  RETURN accepted;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_page_inbox_claim_v1(p_token uuid)
RETURNS SETOF public.facebook_page_inbox LANGUAGE plpgsql SECURITY INVOKER
SET search_path='' SET lock_timeout='1s' SET statement_timeout='5s' AS $$
DECLARE candidate record; picked public.facebook_page_inbox; stamp timestamptz;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF p_token IS NULL THEN RAISE EXCEPTION 'lease token required' USING ERRCODE='22023'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'read committed required' USING ERRCODE='25001';
  END IF;
  FOR candidate IN
    SELECT i.id,i.page_id FROM public.facebook_page_inbox i
    WHERE i.status<>'done' AND i.available_at<=clock_timestamp()
      AND (i.status='pending' OR i.locked_until<=clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM public.facebook_page_inbox older
        WHERE older.page_id=i.page_id AND older.status<>'done' AND older.queue_order<i.queue_order)
    ORDER BY i.queue_order LIMIT 1000
  LOOP
    -- SKIP LOCKED alone would let a different row on this Page overtake its head.
    IF NOT pg_try_advisory_xact_lock(hashtextextended('facebook_page_inbox.page:'||candidate.page_id,0)) THEN CONTINUE; END IF;
    -- A fresh READ COMMITTED statement after the Page gate rechecks current state.
    SELECT i.* INTO picked FROM public.facebook_page_inbox i
    WHERE i.id=candidate.id AND i.status<>'done' AND i.available_at<=clock_timestamp()
      AND (i.status='pending' OR i.locked_until<=clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM public.facebook_page_inbox older
        WHERE older.page_id=i.page_id AND older.status<>'done' AND older.queue_order<i.queue_order)
      AND NOT EXISTS (SELECT 1 FROM public.facebook_page_inbox busy
        WHERE busy.page_id=i.page_id AND busy.status='processing' AND busy.locked_until>clock_timestamp())
    FOR UPDATE OF i SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    stamp:=clock_timestamp();
    UPDATE public.facebook_page_inbox SET status='processing',attempts=attempts+1,
      lease_token=p_token,locked_until=stamp+interval '120 seconds'
      WHERE id=picked.id RETURNING * INTO picked;
    RETURN NEXT picked;
    RETURN;
  END LOOP;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_page_inbox_finish_v1(p_id uuid,p_token uuid,p_success boolean,p_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path='' SET lock_timeout='1s' SET statement_timeout='5s' AS $$
DECLARE item public.facebook_page_inbox; stamp timestamptz; safe_error text;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_token IS NULL OR p_success IS NULL THEN RAISE EXCEPTION 'invalid completion' USING ERRCODE='22023'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'read committed required' USING ERRCODE='25001';
  END IF;
  SELECT * INTO item FROM public.facebook_page_inbox WHERE id=p_id FOR UPDATE;
  stamp:=clock_timestamp();
  IF NOT FOUND OR item.status<>'processing' OR item.lease_token IS DISTINCT FROM p_token OR item.locked_until<=stamp THEN RETURN false; END IF;
  -- Never persist provider/raw exception text, URLs or credentials as an error code.
  safe_error:=CASE WHEN p_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$' THEN p_error_code ELSE 'PROCESSING_FAILED' END;
  UPDATE public.facebook_page_inbox SET status=CASE WHEN p_success THEN 'done' ELSE 'pending' END,
    completed_at=CASE WHEN p_success THEN stamp ELSE NULL END,
    available_at=CASE WHEN p_success THEN available_at
      ELSE stamp+make_interval(secs=>least(300,5*power(2,least(greatest(item.attempts-1,0),6)))::integer) END,
    lease_token=NULL,locked_until=NULL,last_error_code=CASE WHEN p_success THEN NULL ELSE safe_error END
    WHERE id=p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_page_inbox_renew_v1(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path='' SET lock_timeout='1s' SET statement_timeout='5s' AS $$
DECLARE item public.facebook_page_inbox; stamp timestamptz;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_token IS NULL THEN RAISE EXCEPTION 'invalid renewal' USING ERRCODE='22023'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'read committed required' USING ERRCODE='25001';
  END IF;
  SELECT * INTO item FROM public.facebook_page_inbox WHERE id=p_id FOR UPDATE;
  stamp:=clock_timestamp();
  IF NOT FOUND OR item.status<>'processing' OR item.lease_token IS DISTINCT FROM p_token OR item.locked_until<=stamp THEN RETURN false; END IF;
  UPDATE public.facebook_page_inbox SET locked_until=stamp+interval '120 seconds' WHERE id=p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_page_inbox_health_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path='' SET lock_timeout='1s' SET statement_timeout='5s' AS $$
DECLARE result jsonb;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'pendingCount',count(*) FILTER (WHERE status='pending' OR (status='processing' AND locked_until<=statement_timestamp())),
    'oldestPendingSeconds',coalesce(greatest(0,floor(extract(epoch FROM statement_timestamp()-min(created_at)
      FILTER (WHERE status='pending' OR (status='processing' AND locked_until<=statement_timestamp()))))),0),
    'processingCount',count(*) FILTER (WHERE status='processing' AND locked_until>statement_timestamp())
  ) INTO result FROM public.facebook_page_inbox;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.facebook_page_inbox_enqueue_v1(jsonb),public.facebook_page_inbox_claim_v1(uuid),
  public.facebook_page_inbox_finish_v1(uuid,uuid,boolean,text),public.facebook_page_inbox_renew_v1(uuid,uuid),
  public.facebook_page_inbox_health_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.facebook_page_inbox_enqueue_v1(jsonb),public.facebook_page_inbox_claim_v1(uuid),
  public.facebook_page_inbox_finish_v1(uuid,uuid,boolean,text),public.facebook_page_inbox_renew_v1(uuid,uuid),
  public.facebook_page_inbox_health_v1() TO service_role;
COMMENT ON TABLE public.facebook_page_inbox IS 'Signed Page event envelopes, durable before ACK. Unknown events retained; done does not assert CRM/AI acceptance. Service backend only; rollout default off.';
COMMIT;
