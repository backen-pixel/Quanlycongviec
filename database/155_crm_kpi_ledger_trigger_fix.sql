-- 155: Sửa trigger KPI ledger (đã chạy 154 bản cũ trên Supabase)
--   * SLA stage: lấy theo to_stage_id (stage đang đo thời gian), không phải from_stage_id.
--   * Won/Lost: ghi khi INSERT dòng transition vào contract_signed / lost (không ghi khi đóng segment cũ).
-- Idempotent — chỉ CREATE OR REPLACE function + trigger.
BEGIN;

CREATE OR REPLACE FUNCTION fn_kpi_ledger_on_stage_history()
RETURNS TRIGGER AS $$
DECLARE
  v_owner UUID;
  v_company UUID;
  v_sla_days INT;
  v_deadline TIMESTAMPTZ;
  v_rule crm_kpi_scoring_rules;
  v_calc RECORD;
BEGIN
  IF NEW.exited_at IS NULL OR (TG_OP = 'UPDATE' AND OLD.exited_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT lead_owner_id, company_id INTO v_owner, v_company
    FROM crm_leads WHERE id = NEW.lead_id;
  IF v_owner IS NULL THEN
    v_owner := NEW.changed_by;
  END IF;
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  IF NEW.to_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sla_days INTO v_sla_days
    FROM crm_pipeline_stages WHERE id = NEW.to_stage_id;
  IF v_sla_days IS NOT NULL AND v_sla_days > 0 THEN
    v_deadline := NEW.entered_at + (v_sla_days || ' days')::INTERVAL;
  END IF;

  v_rule := fn_kpi_resolve_rule(v_company, 'stage_changed', NULL);
  IF v_rule.id IS NOT NULL AND v_deadline IS NOT NULL THEN
    SELECT * INTO v_calc FROM fn_kpi_compute_points(v_rule, v_deadline, NEW.exited_at, NEW.entered_at);

    INSERT INTO crm_kpi_ledger
      (user_id, company_id, lead_id, stage_id, rule_id, event_type, source_kpi_code,
       deadline_at, occurred_at, delta_seconds, on_time, points, reason, period_start, metadata)
    VALUES
      (v_owner, v_company, NEW.lead_id, NEW.to_stage_id, v_rule.id, 'stage_changed', 'A5',
       v_deadline, NEW.exited_at, v_calc.delta_seconds, v_calc.on_time, v_calc.points,
       CASE WHEN v_calc.on_time THEN 'Qua stage trong SLA' ELSE 'Vượt SLA stage' END,
       fn_kpi_period_start(NEW.exited_at),
       jsonb_build_object('from_slug', NEW.from_canonical_slug, 'to_slug', NEW.to_canonical_slug, 'sla_days', v_sla_days));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_kpi_ledger_on_stage_history_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_owner UUID;
  v_company UUID;
  v_rule crm_kpi_scoring_rules;
  v_slug TEXT;
BEGIN
  IF NEW.to_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_slug := NEW.to_canonical_slug;
  IF v_slug IS NULL THEN
    SELECT canonical_slug INTO v_slug FROM crm_pipeline_stages WHERE id = NEW.to_stage_id;
  END IF;

  SELECT lead_owner_id, company_id INTO v_owner, v_company
    FROM crm_leads WHERE id = NEW.lead_id;
  IF v_owner IS NULL THEN
    v_owner := NEW.changed_by;
  END IF;
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  IF v_slug = 'contract_signed' THEN
    v_rule := fn_kpi_resolve_rule(v_company, 'deal_won', NULL);
    IF v_rule.id IS NOT NULL THEN
      INSERT INTO crm_kpi_ledger
        (user_id, company_id, lead_id, stage_id, rule_id, event_type, source_kpi_code,
         occurred_at, on_time, points, reason, period_start)
      VALUES
        (v_owner, v_company, NEW.lead_id, NEW.to_stage_id, v_rule.id, 'deal_won', 'B4',
         NEW.entered_at, true, v_rule.on_time_points, 'Deal Won (ký hợp đồng)',
         fn_kpi_period_start(NEW.entered_at))
      ON CONFLICT (lead_id) WHERE event_type = 'deal_won' DO NOTHING;
    END IF;
  ELSIF v_slug = 'lost' THEN
    v_rule := fn_kpi_resolve_rule(v_company, 'deal_lost', NULL);
    IF v_rule.id IS NOT NULL THEN
      INSERT INTO crm_kpi_ledger
        (user_id, company_id, lead_id, stage_id, rule_id, event_type, source_kpi_code,
         occurred_at, on_time, points, reason, period_start)
      VALUES
        (v_owner, v_company, NEW.lead_id, NEW.to_stage_id, v_rule.id, 'deal_lost', 'C4',
         NEW.entered_at, false, v_rule.late_points, 'Deal Lost',
         fn_kpi_period_start(NEW.entered_at))
      ON CONFLICT (lead_id) WHERE event_type = 'deal_lost' DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kpi_ledger_stage_history ON crm_lead_stage_history;
CREATE TRIGGER trg_kpi_ledger_stage_history
  AFTER UPDATE OF exited_at ON crm_lead_stage_history
  FOR EACH ROW EXECUTE FUNCTION fn_kpi_ledger_on_stage_history();

DROP TRIGGER IF EXISTS trg_kpi_ledger_stage_history_ins ON crm_lead_stage_history;
CREATE TRIGGER trg_kpi_ledger_stage_history_ins
  AFTER INSERT ON crm_lead_stage_history
  FOR EACH ROW EXECUTE FUNCTION fn_kpi_ledger_on_stage_history_insert();

COMMIT;
