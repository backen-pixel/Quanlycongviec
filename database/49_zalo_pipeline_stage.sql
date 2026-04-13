-- Zalo OA: gửi tin khi deal vào cột pipeline được đánh dấu
ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS send_zalo_on_enter BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_pipeline_stages.send_zalo_on_enter IS 'Deal: khi kéo vào giai đoạn này, gửi tin Zalo OA (nếu bật cấu hình)';

CREATE TABLE IF NOT EXISTS crm_zalo_stage_sends (
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE CASCADE,
  tracking_id TEXT NOT NULL,
  msg_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_zalo_stage_sends_lead ON crm_zalo_stage_sends(lead_id);

ALTER TABLE crm_zalo_stage_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_zalo_stage_sends_all" ON crm_zalo_stage_sends;
CREATE POLICY "crm_zalo_stage_sends_all" ON crm_zalo_stage_sends FOR ALL USING (true) WITH CHECK (true);
