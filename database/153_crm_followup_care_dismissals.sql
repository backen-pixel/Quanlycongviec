-- ═══════════════════════════════════════════════════════════════
-- 153. CRM Follow-Up Care Dismissals
-- Bảng ghi nhận đã tương tác CSKH nhắc lại — không thông báo lại trong 1 tháng.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_followup_care_dismissals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES crm_pipeline_stages(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  time_bucket TEXT NOT NULL DEFAULT 'w1',
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_crm_followup_dismissals_user ON crm_followup_care_dismissals(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_followup_dismissals_expires ON crm_followup_care_dismissals(expires_at);

ALTER TABLE crm_followup_care_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_followup_care_dismissals_all" ON crm_followup_care_dismissals;
CREATE POLICY "crm_followup_care_dismissals_all" ON crm_followup_care_dismissals FOR ALL USING (true) WITH CHECK (true);
