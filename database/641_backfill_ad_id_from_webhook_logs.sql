-- 641: Vớt ad_id THẬT từ facebook_webhook_logs.
--
-- Phát hiện 29/09/2026: Facebook ĐÃ gửi event.referral.ad_id từ 15/09
-- (messaging_referrals đã được đăng ký sẵn), nhưng handleMessagingInner cũ
-- không đọc nên dữ liệu rơi mất. Payload vẫn còn nguyên trong bảng log.
--
-- Đây là số ĐO ĐƯỢC từ Facebook, không phải suy đoán.
-- Kết quả lần chạy đầu: 287 lead / 39 quảng cáo / 75 deal.
-- Idempotent — chỉ điền vào ô còn trống, không đè quy kết đã có.

BEGIN;

WITH r AS (
  SELECT
    w.page_id AS pg,
    COALESCE(w.payload->>'psid', w.payload->'event'->'sender'->>'id') AS ps,
    w.payload->'event'->'referral'->>'ad_id'  AS ad_id,
    w.payload->'event'->'referral'->>'ref'    AS ref,
    w.payload->'event'->'referral'->>'source' AS src,
    w.payload->'event'->'referral'->'ads_context_data'->>'ad_title' AS ad_title,
    w.payload->'event'->'referral'->'ads_context_data'->>'post_id'  AS post_id,
    w.processed_at
  FROM facebook_webhook_logs w
  WHERE w.payload->'event'->'referral' IS NOT NULL
),
dau_tien AS (
  SELECT DISTINCT ON (fc.lead_id)
    fc.lead_id, fc.id AS contact_id, fc.customer_id, l.company_id,
    r.pg, r.ad_id, r.ref, r.src, r.ad_title, r.post_id, r.processed_at
  FROM r
  JOIN facebook_contacts fc ON fc.psid = r.ps AND fc.page_id = r.pg
  JOIN crm_leads l ON l.id = fc.lead_id
  WHERE fc.lead_id IS NOT NULL
    AND (r.ad_id IS NOT NULL OR r.ref IS NOT NULL)
  ORDER BY fc.lead_id, r.processed_at ASC
)
INSERT INTO lead_attribution (
  lead_id, contact_id, customer_id, company_id,
  kenh, platform, fb_page_id, fb_ad_id, fb_ref, fb_source,
  fb_ad_title, fb_post_id, cham_dau_luc, raw
)
SELECT
  d.lead_id, d.contact_id, d.customer_id, d.company_id,
  'messenger', 'facebook', d.pg, d.ad_id, d.ref, d.src,
  d.ad_title, d.post_id, d.processed_at,
  jsonb_build_object('nguon_backfill', 'facebook_webhook_logs', 'do_duoc', true)
FROM dau_tien d
ON CONFLICT (lead_id) WHERE lead_id IS NOT NULL
DO UPDATE SET
  fb_ad_id     = COALESCE(lead_attribution.fb_ad_id, EXCLUDED.fb_ad_id),
  fb_ref       = COALESCE(lead_attribution.fb_ref, EXCLUDED.fb_ref),
  fb_source    = COALESCE(lead_attribution.fb_source, EXCLUDED.fb_source),
  fb_ad_title  = COALESCE(lead_attribution.fb_ad_title, EXCLUDED.fb_ad_title),
  fb_post_id   = COALESCE(lead_attribution.fb_post_id, EXCLUDED.fb_post_id),
  raw          = COALESCE(lead_attribution.raw, '{}'::jsonb)
                   || jsonb_build_object('bo_sung_tu_log', true),
  updated_at   = now();

COMMIT;
