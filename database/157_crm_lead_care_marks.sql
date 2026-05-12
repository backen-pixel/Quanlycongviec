-- ═══════════════════════════════════════════════════════════════
-- 157. CRM Lead Care Marks
-- Đánh dấu từng lead/deal đã chăm sóc trên trang CSKH.
-- Mặc định 30 ngày sau (expires_at) thì dấu tích bỏ tự động — lead lại
-- cần chăm sóc tiếp.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_lead_care_marks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  note TEXT,
  CONSTRAINT crm_lead_care_marks_unique UNIQUE (lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_care_marks_lead ON crm_lead_care_marks(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_lead_care_marks_user ON crm_lead_care_marks(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_lead_care_marks_expires ON crm_lead_care_marks(expires_at);

ALTER TABLE crm_lead_care_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_lead_care_marks_all" ON crm_lead_care_marks;
CREATE POLICY "crm_lead_care_marks_all" ON crm_lead_care_marks FOR ALL USING (true) WITH CHECK (true);
