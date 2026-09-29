-- Opt-in Messenger receipt inbox; no historical webhook backfill.
-- Apply only after review; backend flag FB_DURABLE_MESSENGER_PAGE_IDS remains empty until enabled.
BEGIN;
CREATE TABLE public.facebook_messenger_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  page_id text NOT NULL REFERENCES public.facebook_pages(page_id),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  lock_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX facebook_messenger_receipts_pending ON public.facebook_messenger_receipts(page_id, available_at) WHERE status <> 'done';
ALTER TABLE public.facebook_messenger_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facebook_messenger_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.facebook_messenger_receipts TO service_role;

CREATE FUNCTION public.facebook_claim_receipt_v1(p_page_ids text[], p_token uuid)
RETURNS SETOF public.facebook_messenger_receipts
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH picked AS (
    SELECT id FROM public.facebook_messenger_receipts
    WHERE page_id = ANY(p_page_ids) AND available_at <= now()
      AND (status = 'pending' OR (status = 'processing' AND locked_until < now()))
    ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.facebook_messenger_receipts r
  SET status = 'processing', attempts = attempts + 1,
      lock_token = p_token, locked_until = now() + interval '5 minutes'
  FROM picked WHERE r.id = picked.id RETURNING r.*;
$$;

CREATE FUNCTION public.facebook_finish_receipt_v1(p_id uuid, p_token uuid, p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.facebook_messenger_receipts
  SET status = CASE WHEN p_success THEN 'done' ELSE 'pending' END,
      completed_at = CASE WHEN p_success THEN now() ELSE NULL END,
      available_at = CASE WHEN p_success THEN available_at ELSE now() + make_interval(secs => LEAST(3600, 5 * power(2, LEAST(attempts, 9)))::integer) END,
      locked_until = NULL, lock_token = NULL
  WHERE id = p_id AND lock_token = p_token AND status = 'processing';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.facebook_claim_receipt_v1(text[],uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facebook_finish_receipt_v1(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.facebook_claim_receipt_v1(text[],uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.facebook_finish_receipt_v1(uuid,uuid,boolean) TO service_role;
COMMIT;
