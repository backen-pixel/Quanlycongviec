-- 638: Nền cho cổng dữ liệu lead Facebook
--   lead_attribution      — quy kết lần chạm đầu tiên (ad_id / campaign / utm)
--   lead_quality_scores   — điểm chất lượng 0..100 + nhãn
--   external_api_keys     — thêm cột phân quyền đối tác (pii_level, ip_allowlist, expires_at)
--   partner_api_audit     — nhật ký truy cập cổng /api/partner
-- Toàn bộ additive. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS lead_attribution (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES facebook_contacts(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
  company_id    uuid REFERENCES companies(id),

  kenh          text NOT NULL,          -- messenger | lead_ads | comment | website | zalo | khac
  platform      text,                   -- facebook | instagram | google | direct

  fb_page_id       text,
  fb_ad_id         text,
  fb_adset_id      text,
  fb_campaign_id   text,
  fb_campaign_name text,
  fb_ref           text,
  fb_source        text,                -- ADS | SHORTLINK | CUSTOMER_CHAT_PLUGIN
  fb_ad_title      text,
  fb_post_id       text,
  fb_form_id       text,
  fb_leadgen_id    text,

  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  gclid         text,
  fbclid        text,
  landing_url   text,
  referrer_url  text,

  fbp           text,
  fbc           text,
  client_ip     text,
  user_agent    text,

  cham_dau_luc  timestamptz NOT NULL DEFAULT now(),
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_attr_lead     ON lead_attribution(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_attr_contact  ON lead_attribution(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_attr_campaign ON lead_attribution(fb_campaign_id, cham_dau_luc DESC);
CREATE INDEX IF NOT EXISTS idx_lead_attr_ad       ON lead_attribution(fb_ad_id, cham_dau_luc DESC);
CREATE INDEX IF NOT EXISTS idx_lead_attr_kenh     ON lead_attribution(kenh, cham_dau_luc DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_attr_lead    ON lead_attribution(lead_id)    WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_attr_contact ON lead_attribution(contact_id) WHERE contact_id IS NOT NULL AND lead_id IS NULL;

CREATE TABLE IF NOT EXISTS lead_quality_scores (
  lead_id     uuid PRIMARY KEY REFERENCES crm_leads(id) ON DELETE CASCADE,
  diem        smallint NOT NULL CHECK (diem >= 0 AND diem <= 100),
  nhan        text NOT NULL CHECK (nhan IN ('rac', 'lanh', 'am', 'nong', 'da_chot')),
  thanh_phan  jsonb NOT NULL DEFAULT '{}'::jsonb,
  tinh_luc    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lqs_nhan ON lead_quality_scores(nhan, tinh_luc DESC);
CREATE INDEX IF NOT EXISTS idx_lqs_tinh ON lead_quality_scores(tinh_luc);

ALTER TABLE external_api_keys
  ADD COLUMN IF NOT EXISTS pii_level      text NOT NULL DEFAULT 'hashed',
  ADD COLUMN IF NOT EXISTS partner_scopes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ip_allowlist   text[],
  ADD COLUMN IF NOT EXISTS expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at   timestamptz,
  ADD COLUMN IF NOT EXISTS pii_reason     text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_api_keys_pii_level_check'
  ) THEN
    ALTER TABLE external_api_keys
      ADD CONSTRAINT external_api_keys_pii_level_check
      CHECK (pii_level IN ('hashed', 'masked', 'full'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS partner_api_audit (
  id         bigserial PRIMARY KEY,
  api_key_id uuid,
  key_name   text,
  endpoint   text NOT NULL,
  method     text NOT NULL,
  ip         text,
  user_agent text,
  params     jsonb,
  so_ban_ghi integer,
  pii_level  text,
  status     integer,
  ms         integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_audit_key  ON partner_api_audit(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_audit_time ON partner_api_audit(created_at DESC);

COMMIT;
