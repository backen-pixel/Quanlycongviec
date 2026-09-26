-- 636. Harden VPT Messenger campaign phone attribution (additive after 591).
-- Daily automation policy: credit a phone only when the same contact has a
-- mapped Messenger referral from the same Asia/Ho_Chi_Minh calendar day,
-- on the same Page, at or before the inbound phone message. This deliberately
-- does not credit overnight or organic return visits to a previous campaign.

DO $$
BEGIN
  IF to_regclass('public.facebook_ad_campaign_mappings') IS NULL
     OR to_regclass('public.facebook_messenger_ad_attributions') IS NULL THEN
    RAISE EXCEPTION 'Migration 591 must be applied before migration 636';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.facebook_messenger_phone_exclusions (
  facebook_message_id UUID PRIMARY KEY REFERENCES public.facebook_messages(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.facebook_contacts(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason = 'e2e_test'),
  excluded_by TEXT NOT NULL,
  excluded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_msg_phone_exclusions_page_time
  ON public.facebook_messenger_phone_exclusions (page_id, excluded_at DESC);

ALTER TABLE public.facebook_ad_campaign_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_messenger_ad_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_messenger_phone_exclusions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.facebook_ad_campaign_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.facebook_messenger_ad_attributions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.facebook_messenger_phone_exclusions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.facebook_ad_campaign_mappings TO service_role;
GRANT ALL ON TABLE public.facebook_messenger_ad_attributions TO service_role;
GRANT ALL ON TABLE public.facebook_messenger_phone_exclusions TO service_role;
CREATE OR REPLACE FUNCTION public.fb_campaign_phone_numbers_in_range(
  p_page_ids TEXT[] DEFAULT NULL,
  p_campaign_ids TEXT[] DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (campaign_id TEXT, phone_contacts BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH phone_messages AS (
    SELECT m.id, m.contact_id, c.page_id,
      COALESCE(m.facebook_occurred_at, m.created_at) AS occurred_at
    FROM public.facebook_messages m
    JOIN public.facebook_contacts c ON c.id = m.contact_id
    WHERE m.direction = 'inbound'
      AND NULLIF(btrim(m.detected_phone), '') IS NOT NULL
      AND p_from IS NOT NULL
      AND p_to IS NOT NULL
      AND COALESCE(m.facebook_occurred_at, m.created_at) >= p_from
      AND COALESCE(m.facebook_occurred_at, m.created_at) < p_to
      AND (p_page_ids IS NULL OR c.page_id = ANY(p_page_ids))
      AND NOT EXISTS (
        SELECT 1
        FROM public.facebook_messenger_phone_exclusions e
        WHERE e.facebook_message_id = m.id
      )
  ),
  attributed AS (
    SELECT pm.contact_id,
      COALESCE(a.campaign_id, map.campaign_id) AS campaign_id
    FROM phone_messages pm
    JOIN LATERAL (
      SELECT ma.*
      FROM public.facebook_messenger_ad_attributions ma
      WHERE ma.contact_id = pm.contact_id
        AND ma.page_id = pm.page_id
        AND ma.attributed_at >= p_from
        AND ma.attributed_at < p_to
        AND ma.attributed_at <= pm.occurred_at
      ORDER BY ma.attributed_at DESC
      LIMIT 1
    ) a ON true
    LEFT JOIN public.facebook_ad_campaign_mappings map
      ON map.fb_ad_id = a.fb_ad_id
      AND map.page_id = a.page_id
  )
  SELECT x.campaign_id, COUNT(DISTINCT x.contact_id)::BIGINT
  FROM attributed x
  WHERE x.campaign_id IS NOT NULL
    AND (p_campaign_ids IS NULL OR x.campaign_id = ANY(p_campaign_ids))
  GROUP BY x.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.fb_campaign_phone_numbers_in_range(TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fb_campaign_phone_numbers_in_range(TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;

COMMENT ON TABLE public.facebook_messenger_phone_exclusions IS
  'Only explicit E2E test messages are excluded from daily VPT Messenger campaign-phone reporting.';
COMMENT ON FUNCTION public.fb_campaign_phone_numbers_in_range(TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Daily VPT policy: same Page, same Asia/Ho_Chi_Minh date, referral at or before phone; excludes explicit E2E tests.';
