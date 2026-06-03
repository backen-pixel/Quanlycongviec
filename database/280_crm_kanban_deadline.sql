-- 280_crm_kanban_deadline.sql
-- Deadline thủ công cho thẻ lead/deal CRM (tách biệt với expected_close_date / SLA cột).
--   * crm_leads.kanban_deadline_at        : hạn do người dùng đặt cho thẻ
--   * crm_leads.kanban_deadline_reason    : lý do của lần đặt/sửa gần nhất (snapshot nhanh)
--   * crm_pipeline_stages.requires_deadline: cột bắt buộc chọn deadline khi kéo thẻ tới
--   * crm_lead_deadline_history           : ledger mọi lần đặt/sửa deadline (kèm lý do)
-- Idempotent: an toàn để chạy lại.

BEGIN;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS kanban_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kanban_deadline_reason TEXT;

COMMENT ON COLUMN crm_leads.kanban_deadline_at IS
  'Hạn (deadline) do người dùng đặt cho thẻ CRM. Khác expected_close_date (ngày chốt dự kiến) và SLA cột.';
COMMENT ON COLUMN crm_leads.kanban_deadline_reason IS
  'Lý do của lần đặt/sửa deadline gần nhất (snapshot — lịch sử đầy đủ ở crm_lead_deadline_history).';

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS requires_deadline BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_pipeline_stages.requires_deadline IS
  'Khi true: kéo thẻ tới cột này bắt buộc hiện modal và chọn deadline mới.';

CREATE TABLE IF NOT EXISTS crm_lead_deadline_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
  old_deadline_at TIMESTAMPTZ,
  new_deadline_at TIMESTAMPTZ,
  reason TEXT,
  source TEXT,                  -- 'stage_move' | 'manual_edit'
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crm_lead_deadline_history IS 'Lịch sử đặt/sửa deadline thẻ CRM — kèm lý do và người thay đổi.';

CREATE INDEX IF NOT EXISTS idx_crm_lead_deadline_history_lead
  ON crm_lead_deadline_history (lead_id, created_at DESC);

COMMIT;
