-- 639. Verified, unambiguous daily Messenger attribution.
-- Historical events remain unverified. Only the signed durable ingestion path
-- may mark an exact event as verified; never backfill this from configuration.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.facebook_messenger_phone_exclusions') IS NULL THEN
    RAISE EXCEPTION 'Migration 636 must be applied before migration 639';
  END IF;
END $$;

ALTER TABLE public.facebook_messages
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.facebook_messenger_ad_attributions
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Some deployments retain permissive legacy facebook_messages policies. A
-- client must not forge trust, alter a verified phone/time/contact, or delete
-- verified evidence even if its table grants still permit ordinary chat writes.
CREATE OR REPLACE FUNCTION public.guard_verified_facebook_message_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_trusted_role BOOLEAN;
  v_verified BOOLEAN;
BEGIN
  SELECT r.rolname = 'service_role' OR r.rolsuper OR r.oid = c.relowner
    INTO v_trusted_role
  FROM pg_catalog.pg_roles r
  JOIN pg_catalog.pg_class c ON c.oid = TG_RELID
  WHERE r.rolname = CURRENT_USER;

  IF TG_OP = 'INSERT' THEN
    v_verified := NEW.signature_verified;
  ELSIF TG_OP = 'DELETE' THEN
    v_verified := OLD.signature_verified;
  ELSE
    v_verified := OLD.signature_verified OR NEW.signature_verified;
  END IF;
  IF v_verified AND NOT COALESCE(v_trusted_role, FALSE) THEN
    RAISE EXCEPTION 'verified_messenger_message_write_forbidden' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_verified_facebook_message_write()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_verified_facebook_message_write ON public.facebook_messages;
CREATE TRIGGER guard_verified_facebook_message_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.facebook_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_verified_facebook_message_write();

CREATE OR REPLACE FUNCTION public.fb_campaign_phone_numbers_in_range(
  p_page_ids TEXT[] DEFAULT NULL,
  p_campaign_ids TEXT[] DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (campaign_id TEXT, phone_contacts BIGINT)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH phone_messages AS (
    SELECT m.id, m.contact_id, c.page_id,
      m.facebook_occurred_at AS occurred_at
    FROM public.facebook_messages m
    JOIN public.facebook_contacts c ON c.id = m.contact_id
    WHERE m.direction = 'inbound'
      AND m.signature_verified
      AND NULLIF(btrim(m.detected_phone), '') IS NOT NULL
      AND p_from IS NOT NULL
      AND p_to IS NOT NULL
      AND m.facebook_occurred_at >= p_from
      AND m.facebook_occurred_at < p_to
      AND (p_page_ids IS NULL OR c.page_id = ANY(p_page_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.facebook_messenger_phone_exclusions e
        WHERE e.facebook_message_id = m.id
      )
  ),
  attributed AS (
    SELECT pm.contact_id, latest.campaign_id
    FROM phone_messages pm
    JOIN LATERAL (
      -- Keep all latest-timestamp rows before counting. Choosing an arbitrary
      -- ad on a timestamp tie fabricates which campaign acquired the phone.
      SELECT MIN(COALESCE(a.campaign_id, map.campaign_id)) AS campaign_id
      FROM (
        SELECT ma.*
        FROM public.facebook_messenger_ad_attributions ma
        WHERE ma.contact_id = pm.contact_id
          AND ma.page_id = pm.page_id
          AND ma.signature_verified
          AND ma.attributed_at >= p_from
          AND ma.attributed_at < p_to
          AND ma.attributed_at <= pm.occurred_at
          AND (ma.attributed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
            = (pm.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
        ORDER BY ma.attributed_at DESC
        FETCH FIRST 1 ROW WITH TIES
      ) a
      LEFT JOIN public.facebook_ad_campaign_mappings map
        ON map.fb_ad_id = a.fb_ad_id AND map.page_id = a.page_id
      HAVING COUNT(*) = 1
    ) latest ON true
  )
  SELECT x.campaign_id, COUNT(DISTINCT x.contact_id)::BIGINT
  FROM attributed x
  WHERE x.campaign_id IS NOT NULL
    AND (p_campaign_ids IS NULL OR x.campaign_id = ANY(p_campaign_ids))
  GROUP BY x.campaign_id;
$$;

-- An explicit capability probe prevents a successful call to an older RPC
-- from being mistaken for the verified, fail-closed reporting implementation.
CREATE OR REPLACE FUNCTION public.fb_campaign_phone_attribution_capabilities()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'schema_version', 639,
    'same_vietnam_day', true,
    'verified_events_only', true,
    'ambiguous_latest_referral_excluded', true
  );
$$;

REVOKE ALL ON FUNCTION public.fb_campaign_phone_numbers_in_range(TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fb_campaign_phone_numbers_in_range(TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
REVOKE ALL ON FUNCTION public.fb_campaign_phone_attribution_capabilities()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fb_campaign_phone_attribution_capabilities() TO service_role;

COMMENT ON FUNCTION public.fb_campaign_phone_numbers_in_range(TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Verified events only; same Page and Vietnam date; latest referral at/before phone; tied latest ads excluded; distinct contacts, not CRM lead acceptance.';

COMMIT;
