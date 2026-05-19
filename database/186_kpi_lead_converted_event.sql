-- 186: KPI khi chuyển Lead → Deal (Sales Admin) — sổ cái + định nghĩa B6
-- Idempotent.

BEGIN;

-- ─── Mở rộng event_type ─────────────────────────────────────────────────────
DO $$
DECLARE
  con_name TEXT;
BEGIN
  FOR con_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'crm_kpi_ledger'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE crm_kpi_ledger DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE crm_kpi_ledger
  ADD CONSTRAINT crm_kpi_ledger_event_type_check
  CHECK (event_type IN (
    'task_completed', 'stage_changed', 'deal_won', 'deal_lost', 'sla_breach', 'manual', 'lead_converted'
  ));

ALTER TABLE crm_kpi_scoring_rules DROP CONSTRAINT IF EXISTS crm_kpi_scoring_rules_event_type_check;
ALTER TABLE crm_kpi_scoring_rules
  ADD CONSTRAINT crm_kpi_scoring_rules_event_type_check
  CHECK (event_type IN (
    'task_completed', 'stage_changed', 'deal_won', 'deal_lost', 'sla_breach', 'manual', 'lead_converted'
  ));

-- Mỗi lead chỉ cộng điểm chuyển Deal một lần
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_ledger_lead_converted
  ON crm_kpi_ledger (lead_id) WHERE event_type = 'lead_converted';

-- ─── Rule mặc định: +3 điểm khi chuyển Deal thành công ─────────────────────
INSERT INTO crm_kpi_scoring_rules
  (company_id, event_type, task_stage_slug, on_time_points, late_points, early_bonus_pct, early_bonus, late_step_hours, late_step_points, notes)
SELECT
  NULL, 'lead_converted', NULL, 3, 0, NULL, 0, NULL, 0,
  'Lead chuyển sang Deal thành công (Sales Admin / owner) — mỗi lead một lần'
WHERE NOT EXISTS (
  SELECT 1 FROM crm_kpi_scoring_rules
  WHERE company_id IS NULL AND event_type = 'lead_converted' AND task_stage_slug IS NULL
);

-- ─── KPI B6 trên dashboard Sales Admin ──────────────────────────────────────
INSERT INTO kpi_definitions
  (code, name, description, group_code, formula_type, unit, weight, target_default, target_max, min_threshold, is_gating, applies_to, data_source_note)
VALUES
  (
    'B6',
    'Tỷ lệ Lead chuyển Deal',
    '% lead được tạo trong kỳ mà bạn là owner và đã chuyển thành Deal (có sự kiện lead_converted trong sổ cái).',
    'B',
    'increasing',
    '%',
    6,
    50,
    NULL,
    NULL,
    false,
    'sales_admin',
    'crm_kpi_ledger event_type=lead_converted / crm_leads created in period'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  target_default = EXCLUDED.target_default,
  applies_to = EXCLUDED.applies_to,
  data_source_note = EXCLUDED.data_source_note;

COMMIT;
