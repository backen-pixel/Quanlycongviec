-- Bắt buộc cho KPI/SLA Kanban — đồng bộ với backend/migrations/37_crm_lead_stage_sla_timing.sql
-- Chạy trên Supabase SQL Editor nếu gặp: Could not find the 'stage_entered_at' column of 'crm_leads'

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN crm_leads.stage_entered_at IS 'Reset khi lead/deal chuyển stage — dùng tính thời gian tại cột hiện tại';

UPDATE crm_leads SET stage_entered_at = COALESCE(stage_entered_at, created_at);

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS sla_days INT CHECK (sla_days IS NULL OR sla_days >= 1);

COMMENT ON COLUMN crm_pipeline_stages.sla_days IS 'Số ngày SLA kể từ stage_entered_at; NULL = dùng mặc định 7 trên UI';
