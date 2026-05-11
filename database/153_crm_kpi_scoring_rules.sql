-- ═══════════════════════════════════════════════════════════════════════════
-- 153: crm_kpi_scoring_rules — cấu hình điểm cộng/trừ cho từng loại sự kiện KPI
--   Cho phép admin chỉnh điểm + ngưỡng thời gian trong UI mà không cần đụng code.
--   Áp dụng cho company cụ thể (company_id) hoặc toàn hệ thống (company_id NULL).
-- Idempotent: an toàn chạy lại kể cả khi bảng cũ đã tồn tại thiếu cột.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS crm_kpi_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- ─── Đảm bảo đầy đủ cột (nếu bảng đã tồn tại từ lần chạy trước thì ADD thêm)
ALTER TABLE crm_kpi_scoring_rules
  ADD COLUMN IF NOT EXISTS company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS event_type       TEXT,
  ADD COLUMN IF NOT EXISTS task_stage_slug  TEXT,
  ADD COLUMN IF NOT EXISTS on_time_points   NUMERIC(8,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS late_points      NUMERIC(8,2) NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS early_bonus_pct  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS early_bonus      NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_step_hours  INT,
  ADD COLUMN IF NOT EXISTS late_step_points NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- NOT NULL + CHECK cho event_type (sau khi cột đã tồn tại)
ALTER TABLE crm_kpi_scoring_rules ALTER COLUMN event_type SET NOT NULL;
ALTER TABLE crm_kpi_scoring_rules DROP CONSTRAINT IF EXISTS crm_kpi_scoring_rules_event_type_check;
ALTER TABLE crm_kpi_scoring_rules
  ADD CONSTRAINT crm_kpi_scoring_rules_event_type_check
  CHECK (event_type IN ('task_completed','stage_changed','deal_won','deal_lost','sla_breach','manual'));

COMMENT ON TABLE  crm_kpi_scoring_rules IS 'Cấu hình điểm KPI cho từng loại sự kiện (cộng/trừ theo deadline).';
COMMENT ON COLUMN crm_kpi_scoring_rules.task_stage_slug IS 'NULL = áp dụng mọi task; có giá trị = chỉ áp dụng cho task của stage này.';

-- ─── UNIQUE: 1 rule / (company, event_type, task_stage_slug); partial vì NULL khác nhau
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_rules_company_event_stage
  ON crm_kpi_scoring_rules (company_id, event_type, task_stage_slug)
  WHERE company_id IS NOT NULL AND task_stage_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_rules_company_event
  ON crm_kpi_scoring_rules (company_id, event_type)
  WHERE company_id IS NOT NULL AND task_stage_slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_rules_global_event_stage
  ON crm_kpi_scoring_rules (event_type, task_stage_slug)
  WHERE company_id IS NULL AND task_stage_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_rules_global_event
  ON crm_kpi_scoring_rules (event_type)
  WHERE company_id IS NULL AND task_stage_slug IS NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_rules_active
  ON crm_kpi_scoring_rules (is_active, event_type) WHERE is_active = true;

-- ─── Seed default rules (toàn hệ thống) ────────────────────────────────────
INSERT INTO crm_kpi_scoring_rules
  (company_id, event_type, task_stage_slug, on_time_points, late_points, early_bonus_pct, early_bonus, late_step_hours, late_step_points, notes)
VALUES
  (NULL, 'task_completed',  NULL, 1,   -1,  50,   1,   24,  -1, 'Task có deadline: đúng hạn +1, trễ -1, sớm >50% +1 bonus, mỗi 24h trễ thêm -1'),
  (NULL, 'stage_changed',   NULL, 1,   -1,  NULL, 0,   NULL, 0, 'Lead/Deal qua stage trong SLA: +1; vượt SLA: -1'),
  (NULL, 'deal_won',        NULL, 10,  0,   NULL, 0,   NULL, 0, 'Vào canonical contract_signed: +10'),
  (NULL, 'deal_lost',       NULL, 0,   -1,  NULL, 0,   NULL, 0, 'Vào canonical lost: -1'),
  (NULL, 'sla_breach',      NULL, 0,   -1,  NULL, 0,   24,  -1, 'Lead/Deal/Task quá SLA chưa đóng: -1, mỗi 24h thêm -1'),
  (NULL, 'manual',          NULL, 0,   0,   NULL, 0,   NULL, 0, 'Cộng/trừ tay; điểm do manager nhập trực tiếp')
ON CONFLICT DO NOTHING;

COMMIT;
