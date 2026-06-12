-- 337: Người giới thiệu trên Lead/Deal — danh mục theo công ty + lưu trên thẻ CRM

CREATE TABLE IF NOT EXISTS crm_referrers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_referrers_company_name_uq
  ON crm_referrers (company_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_crm_referrers_company_active
  ON crm_referrers (company_id)
  WHERE is_active = true;

COMMENT ON TABLE crm_referrers IS
  'Danh sách người giới thiệu theo công ty — chọn lại khi tạo Lead/Deal.';

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS referrer_name TEXT;

COMMENT ON COLUMN crm_leads.referrer_name IS
  'Tên người giới thiệu khách hàng (snapshot từ crm_referrers hoặc nhập mới).';

ALTER TABLE crm_referrers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_referrers_all" ON crm_referrers;
CREATE POLICY "crm_referrers_all" ON crm_referrers
  FOR ALL USING (true) WITH CHECK (true);
