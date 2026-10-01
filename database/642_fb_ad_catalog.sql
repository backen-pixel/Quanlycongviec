-- 642: Danh mục quảng cáo Facebook — ad_id → tên chiến dịch
--
-- Facebook chỉ gửi ad_id và ad_title qua webhook referral, KHÔNG gửi tên
-- chiến dịch. Bảng này cho phép đặt tên tay ngay hôm nay; khi có token
-- Marketing API thì job đồng bộ ghi vào các dòng nguon='marketing_api'
-- và giữ nguyên dòng người dùng tự đặt.
-- Additive. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS fb_ad_catalog (
  ad_id         text PRIMARY KEY,
  ad_name       text,
  adset_id      text,
  adset_name    text,
  campaign_id   text,
  campaign_name text,
  page_id       text,
  company_id    uuid REFERENCES companies(id),
  nguon         text NOT NULL DEFAULT 'thu_cong' CHECK (nguon IN ('thu_cong', 'marketing_api')),
  ghi_chu       text,
  cap_nhat_boi  uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_ad_catalog_campaign ON fb_ad_catalog(campaign_id);
CREATE INDEX IF NOT EXISTS idx_fb_ad_catalog_page     ON fb_ad_catalog(page_id);

-- Nạp sẵn mọi ad_id đã bắt được, kèm tên quảng cáo Facebook đã gửi
INSERT INTO fb_ad_catalog (ad_id, ad_name, page_id, company_id, nguon)
SELECT DISTINCT ON (a.fb_ad_id)
  a.fb_ad_id,
  a.fb_ad_title,
  a.fb_page_id,
  p.default_company_id,
  'thu_cong'
FROM lead_attribution a
LEFT JOIN facebook_pages p ON p.page_id = a.fb_page_id
WHERE a.fb_ad_id IS NOT NULL
ORDER BY a.fb_ad_id, a.cham_dau_luc DESC
ON CONFLICT (ad_id) DO NOTHING;

COMMIT;
