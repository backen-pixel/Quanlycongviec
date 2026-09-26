-- 637. Durable, service-role-only Messenger webhook receipt queue.
-- Deploy with FB_MESSENGER_DURABLE_DELIVERY=0 (default) until verified.
-- The application must persist signed events BEFORE acknowledging delivery.
-- This migration does not enable a worker or any advertising automation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.facebook_messenger_webhook_receipts (
  receipt_key TEXT PRIMARY KEY CHECK (receipt_key ~ '^[0-9a-f]{64}$'),
  page_id TEXT NOT NULL CHECK (btrim(page_id) <> ''),
  partner_psid TEXT NOT NULL CHECK (btrim(partner_psid) <> ''),
  event JSONB NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  event_timestamp_ms BIGINT CHECK (event_timestamp_ms > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 8),
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_error TEXT,
  CONSTRAINT fb_messenger_receipt_lease_state CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_until IS NULL)
  ),
  CONSTRAINT fb_messenger_receipt_completed_state CHECK (
    (status = 'done' AND completed_at IS NOT NULL)
    OR (status <> 'done' AND completed_at IS NULL)
  )
);

-- Even a caller outside the claim RPC cannot give one conversation two leases.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_messenger_receipt_one_processing
  ON public.facebook_messenger_webhook_receipts (page_id, partner_psid)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_fb_messenger_receipt_unfinished_conversation
  ON public.facebook_messenger_webhook_receipts
    (page_id, partner_psid, event_timestamp_ms, received_at, receipt_key)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_fb_messenger_receipt_available
  ON public.facebook_messenger_webhook_receipts (available_at, received_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_fb_messenger_receipt_health
  ON public.facebook_messenger_webhook_receipts (page_id, status, received_at)
  WHERE status <> 'done';

ALTER TABLE public.facebook_messenger_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.facebook_messenger_webhook_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.facebook_messenger_webhook_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.facebook_messenger_receipts_claim(
  p_limit INTEGER DEFAULT 10,
  p_lease_seconds INTEGER DEFAULT 180,
  p_page_ids TEXT[] DEFAULT NULL
)
RETURNS SETOF public.facebook_messenger_webhook_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_receipt public.facebook_messenger_webhook_receipts%ROWTYPE;
  v_claimed INTEGER := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'Invalid receipt claim limits' USING ERRCODE = '22023';
  END IF;

  -- Serialize only the short claiming transactions, not event processing.
  -- A contender returns immediately. The statements AFTER this lock see leases
  -- committed by the preceding claimant under the normal READ COMMITTED level.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(637, 1) THEN
    RETURN;
  END IF;

  -- A crash on attempt eight must not silently produce unlimited retries.
  UPDATE public.facebook_messenger_webhook_receipts
  SET status = 'dead', lease_token = NULL, lease_until = NULL,
      updated_at = clock_timestamp(), last_error = 'lease_expired_after_max_attempts'
  WHERE status = 'processing' AND lease_until <= clock_timestamp()
    AND attempts >= 8
    AND (p_page_ids IS NULL OR page_id = ANY(p_page_ids));

  WHILE v_claimed < p_limit LOOP
    SELECT r.* INTO v_receipt
    FROM public.facebook_messenger_webhook_receipts r
    WHERE (p_page_ids IS NULL OR r.page_id = ANY(p_page_ids))
      AND r.attempts < 8
      AND (
        (r.status = 'pending' AND r.available_at <= clock_timestamp())
        OR (r.status = 'processing' AND r.lease_until <= clock_timestamp())
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.facebook_messenger_webhook_receipts active_receipt
        WHERE active_receipt.page_id = r.page_id
          AND active_receipt.partner_psid = r.partner_psid
          AND active_receipt.status = 'processing'
          AND active_receipt.receipt_key <> r.receipt_key
      )
      -- An earlier event awaiting backoff must finish before a later phone is
      -- processed. Done/dead receipts no longer block their conversation;
      -- health still exposes dead receipts so reporting remains fail-closed.
      AND (r.status = 'processing' OR NOT EXISTS (
        SELECT 1 FROM public.facebook_messenger_webhook_receipts earlier
        WHERE earlier.page_id = r.page_id
          AND earlier.partner_psid = r.partner_psid
          AND earlier.status IN ('pending', 'processing')
          AND (
            COALESCE(earlier.event_timestamp_ms,
              floor(extract(epoch FROM earlier.received_at) * 1000)::BIGINT),
            earlier.received_at, earlier.receipt_key
          ) < (
            COALESCE(r.event_timestamp_ms,
              floor(extract(epoch FROM r.received_at) * 1000)::BIGINT),
            r.received_at, r.receipt_key
          )
      ))
    ORDER BY COALESCE(r.event_timestamp_ms,
      floor(extract(epoch FROM r.received_at) * 1000)::BIGINT),
      r.received_at, r.receipt_key
    LIMIT 1
    FOR UPDATE OF r SKIP LOCKED;

    EXIT WHEN NOT FOUND;

    UPDATE public.facebook_messenger_webhook_receipts r
    SET status = 'processing', attempts = r.attempts + 1,
        lease_token = pg_catalog.gen_random_uuid(),
        lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        updated_at = clock_timestamp()
    WHERE r.receipt_key = v_receipt.receipt_key
    RETURNING r.* INTO v_receipt;

    v_claimed := v_claimed + 1;
    RETURN NEXT v_receipt;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_messenger_receipts_renew(
  p_receipt_key TEXT,
  p_lease_token UUID,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'Invalid receipt lease duration' USING ERRCODE = '22023';
  END IF;
  UPDATE public.facebook_messenger_webhook_receipts
  SET lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  WHERE receipt_key = p_receipt_key AND status = 'processing'
    AND lease_token = p_lease_token AND lease_until > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_messenger_receipts_finish(
  p_receipt_key TEXT,
  p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.facebook_messenger_webhook_receipts
  SET status = 'done', event = '{}'::JSONB, lease_token = NULL, lease_until = NULL,
      completed_at = clock_timestamp(), updated_at = clock_timestamp(), last_error = NULL
  WHERE receipt_key = p_receipt_key AND status = 'processing'
    AND lease_token = p_lease_token AND lease_until > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_messenger_receipts_fail(
  p_receipt_key TEXT,
  p_lease_token UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.facebook_messenger_webhook_receipts
  SET status = CASE WHEN attempts >= 8 THEN 'dead' ELSE 'pending' END,
      available_at = clock_timestamp() + make_interval(
        secs => LEAST(300, 5 * power(2, GREATEST(attempts - 1, 0))::INTEGER)),
      lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp(),
      -- The caller supplies an error code only, never tokens/message content.
      last_error = left(COALESCE(NULLIF(p_error, ''), 'receipt_processing_failed'), 500)
  WHERE receipt_key = p_receipt_key AND status = 'processing'
    AND lease_token = p_lease_token AND lease_until > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_messenger_receipts_health(
  p_page_ids TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  pending_count BIGINT,
  processing_count BIGINT,
  dead_count BIGINT,
  oldest_pending_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COUNT(*) FILTER (WHERE r.status = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE r.status = 'processing')::BIGINT,
    COUNT(*) FILTER (WHERE r.status = 'dead')::BIGINT,
    MIN(r.received_at) FILTER (WHERE r.status IN ('pending', 'processing'))
  FROM public.facebook_messenger_webhook_receipts r
  WHERE r.status <> 'done'
    AND (p_page_ids IS NULL OR r.page_id = ANY(p_page_ids));
$$;

REVOKE ALL ON FUNCTION public.facebook_messenger_receipts_claim(INTEGER, INTEGER, TEXT[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facebook_messenger_receipts_renew(TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facebook_messenger_receipts_finish(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facebook_messenger_receipts_fail(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facebook_messenger_receipts_health(TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.facebook_messenger_receipts_claim(INTEGER, INTEGER, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.facebook_messenger_receipts_renew(TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.facebook_messenger_receipts_finish(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.facebook_messenger_receipts_fail(TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.facebook_messenger_receipts_health(TEXT[]) TO service_role;

COMMENT ON TABLE public.facebook_messenger_webhook_receipts IS
  'Signed Messenger events persisted before ACK; receipt_key is SHA256(Page + canonical event). Completed payloads are scrubbed; deduplication keys retained. Dead payloads require service-role investigation and retention cleanup.';
COMMENT ON FUNCTION public.facebook_messenger_receipts_claim(INTEGER, INTEGER, TEXT[]) IS
  'Short atomic claim; one lease per Page/contact; expired leases retry up to 8 attempts. Worker must pass its configured authorized Page IDs.';
COMMENT ON FUNCTION public.facebook_messenger_receipts_health(TEXT[]) IS
  'Aggregate queue health only, no message content. Any unfinished/dead receipt blocks zero-phone automation decisions.';

COMMIT;
