-- 640: Quy kết cấp PAGE cho lead Facebook cũ.
--
-- Biết chắc page nào ra lead (facebook_contacts.page_id). Còn ad_id thì KHÔNG —
-- lịch sử không lưu referral nên fb_ad_id để NULL, không đoán.
-- Quảng cáo nào ra khách chỉ biết được từ lead mới, sau khi webhook đã vá.
-- Additive, idempotent (bỏ qua lead đã có dòng quy kết).

BEGIN;

INSERT INTO lead_attribution (
  lead_id, contact_id, customer_id, company_id,
  kenh, platform, fb_page_id, cham_dau_luc, raw
)
SELECT DISTINCT ON (fc.lead_id)
  fc.lead_id,
  fc.id,
  fc.customer_id,
  l.company_id,
  'messenger',
  'facebook',
  fc.page_id,
  COALESCE(fc.created_at, l.created_at, now()),
  jsonb_build_object('nguon_backfill', 'facebook_contacts', 'ghi_chu', 'ad_id khong co trong lich su')
FROM facebook_contacts fc
JOIN crm_leads l ON l.id = fc.lead_id
WHERE fc.lead_id IS NOT NULL
  AND fc.page_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM lead_attribution a WHERE a.lead_id = fc.lead_id)
ORDER BY fc.lead_id, fc.created_at NULLS LAST
ON CONFLICT DO NOTHING;

COMMIT;
