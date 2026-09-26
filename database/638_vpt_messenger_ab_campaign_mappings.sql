-- Maps the three paused A/B/control ads created on 2026-09-24.
-- This is attribution metadata only: it never enables Ads or automatic pause rules.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.facebook_ad_campaign_mappings
    WHERE fb_ad_id IN ('120251591884610435','120251591919430435','120251592173560435')
      AND (ad_account_id <> '835757498658305' OR page_id <> '409741855550833')
  ) THEN
    RAISE EXCEPTION 'VPT A/B ad mapping conflicts with another Page or account';
  END IF;
END;
$$;
INSERT INTO public.facebook_ad_campaign_mappings
  (fb_ad_id, ad_account_id, page_id, campaign_id, campaign_name)
VALUES
  ('120251592173560435','835757498658305','409741855550833','120251591865910435',
   'VPT01_AB_CongTrinhThat_Messenger_HCM30-64_24092026'),
  ('120251591884610435','835757498658305','409741855550833','120251591865910435',
   'VPT01_AB_CongTrinhThat_Messenger_HCM30-64_24092026'),
  ('120251591919430435','835757498658305','409741855550833','120251591865910435',
   'VPT01_AB_CongTrinhThat_Messenger_HCM30-64_24092026')
ON CONFLICT (fb_ad_id) DO UPDATE SET
  ad_account_id = EXCLUDED.ad_account_id,
  page_id = EXCLUDED.page_id,
  campaign_id = EXCLUDED.campaign_id,
  campaign_name = EXCLUDED.campaign_name,
  updated_at = now()
WHERE facebook_ad_campaign_mappings.ad_account_id = EXCLUDED.ad_account_id
  AND facebook_ad_campaign_mappings.page_id = EXCLUDED.page_id;
COMMIT;
