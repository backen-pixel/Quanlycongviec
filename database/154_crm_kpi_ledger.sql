-- ═══════════════════════════════════════════════════════════════════════════
-- 154: crm_kpi_ledger — sổ cái cộng/trừ KPI cho từng lead/deal/task của owner.
--   * Mỗi sự kiện (task hoàn thành, đổi stage, won/lost, breach, manual) = 1 dòng.
--   * SUM(points) GROUP BY user_id, period_start = "Tổng KPI CRM" của người phụ trách.
--   * Trigger tự động ghi từ crm_tasks, crm_lead_stage_history, crm_leads.
--   * Cần đã chạy: 28 (crm_tasks), 145 (stage_history), 146 (canonical_slug),
--                  148 (kpi_definitions), 150 (sla_days), 153 (scoring_rules).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Bảng sổ cái ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_kpi_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  task_id         UUID REFERENCES crm_tasks(id) ON DELETE SET NULL,
  stage_id        UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
  rule_id         UUID REFERENCES crm_kpi_scoring_rules(id) ON DELETE SET NULL,

  event_type      TEXT NOT NULL CHECK (event_type IN
                    ('task_completed','stage_changed','deal_won','deal_lost','sla_breach','manual')),
  source_kpi_code TEXT REFERENCES kpi_definitions(code) ON DELETE SET NULL,

  deadline_at     TIMESTAMPTZ,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delta_seconds   BIGINT,                 -- âm = sớm; dương = trễ
  on_time         BOOLEAN,

  points          NUMERIC(10,2) NOT NULL,
  reason          TEXT,
  metadata        JSONB,

  period_type     TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (period_type IN ('monthly','quarterly','yearly')),
  period_start    DATE NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE crm_kpi_ledger IS 'Sổ cái KPI: mỗi sự kiện cộng/trừ điểm cho owner lead/deal. SUM(points) theo user → tổng KPI CRM.';

CREATE INDEX IF NOT EXISTS idx_kpi_ledger_user_period ON crm_kpi_ledger (user_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_kpi_ledger_company     ON crm_kpi_ledger (company_id, period_start);
CREATE INDEX IF NOT EXISTS idx_kpi_ledger_lead        ON crm_kpi_ledger (lead_id);
CREATE INDEX IF NOT EXISTS idx_kpi_ledger_task        ON crm_kpi_ledger (task_id);
CREATE INDEX IF NOT EXISTS idx_kpi_ledger_event       ON crm_kpi_ledger (event_type, occurred_at);

-- Tránh ghi trùng task_completed / deal_won / deal_lost cho cùng 1 entity
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_ledger_task_completed
  ON crm_kpi_ledger (task_id) WHERE event_type = 'task_completed';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_ledger_deal_won
  ON crm_kpi_ledger (lead_id) WHERE event_type = 'deal_won';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_ledger_deal_lost
  ON crm_kpi_ledger (lead_id) WHERE event_type = 'deal_lost';

-- ─── 2. View tổng hợp ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_crm_kpi_user_period AS
SELECT
  user_id,
  company_id,
  period_type,
  period_start,
  COALESCE(SUM(points) FILTER (WHERE points > 0), 0) AS plus_points,
  COALESCE(SUM(points) FILTER (WHERE points < 0), 0) AS minus_points,
  COALESCE(SUM(points), 0)                            AS total_crm_kpi,
  COUNT(*)                                            AS event_count,
  COUNT(*) FILTER (WHERE on_time = true)              AS on_time_count,
  COUNT(*) FILTER (WHERE on_time = false)             AS late_count
FROM crm_kpi_ledger
GROUP BY user_id, company_id, period_type, period_start;

COMMENT ON VIEW v_crm_kpi_user_period IS '"Tổng KPI CRM" của từng user theo kỳ — tổng cộng/trừ trong sổ cái.';

-- ─── 3. Helper: lấy rule áp dụng + tính điểm ───────────────────────────────
CREATE OR REPLACE FUNCTION fn_kpi_resolve_rule(
  p_company_id UUID,
  p_event_type TEXT,
  p_task_stage_slug TEXT
) RETURNS crm_kpi_scoring_rules AS $$
DECLARE
  v_rule crm_kpi_scoring_rules;
BEGIN
  -- Ưu tiên: company + stage > company > global + stage > global
  SELECT * INTO v_rule FROM crm_kpi_scoring_rules
   WHERE is_active AND event_type = p_event_type
     AND company_id = p_company_id AND task_stage_slug = p_task_stage_slug
   LIMIT 1;
  IF FOUND THEN RETURN v_rule; END IF;

  SELECT * INTO v_rule FROM crm_kpi_scoring_rules
   WHERE is_active AND event_type = p_event_type
     AND company_id = p_company_id AND task_stage_slug IS NULL
   LIMIT 1;
  IF FOUND THEN RETURN v_rule; END IF;

  SELECT * INTO v_rule FROM crm_kpi_scoring_rules
   WHERE is_active AND event_type = p_event_type
     AND company_id IS NULL AND task_stage_slug = p_task_stage_slug
   LIMIT 1;
  IF FOUND THEN RETURN v_rule; END IF;

  SELECT * INTO v_rule FROM crm_kpi_scoring_rules
   WHERE is_active AND event_type = p_event_type
     AND company_id IS NULL AND task_stage_slug IS NULL
   LIMIT 1;
  RETURN v_rule;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_kpi_compute_points(
  p_rule crm_kpi_scoring_rules,
  p_deadline TIMESTAMPTZ,
  p_occurred TIMESTAMPTZ,
  p_reference TIMESTAMPTZ                  -- mốc tính "sớm bao nhiêu %" (vd: created_at của task)
) RETURNS TABLE (points NUMERIC, on_time BOOLEAN, delta_seconds BIGINT) AS $$
DECLARE
  v_delta BIGINT;
  v_total BIGINT;
  v_pts NUMERIC := 0;
  v_on_time BOOLEAN := NULL;
  v_late_steps INT;
BEGIN
  IF p_rule IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::BOOLEAN, NULL::BIGINT; RETURN;
  END IF;

  IF p_deadline IS NULL THEN
    -- Không có deadline → coi như đúng hạn, dùng on_time_points
    v_pts := p_rule.on_time_points;
    RETURN QUERY SELECT v_pts, NULL::BOOLEAN, NULL::BIGINT; RETURN;
  END IF;

  v_delta := EXTRACT(EPOCH FROM (p_occurred - p_deadline))::BIGINT;
  v_on_time := (v_delta <= 0);

  IF v_on_time THEN
    v_pts := p_rule.on_time_points;
    -- Bonus sớm
    IF p_rule.early_bonus_pct IS NOT NULL AND p_reference IS NOT NULL THEN
      v_total := EXTRACT(EPOCH FROM (p_deadline - p_reference))::BIGINT;
      IF v_total > 0 AND ((-v_delta)::NUMERIC / v_total) * 100 >= p_rule.early_bonus_pct THEN
        v_pts := v_pts + COALESCE(p_rule.early_bonus, 0);
      END IF;
    END IF;
  ELSE
    v_pts := p_rule.late_points;
    -- Trừ thêm theo bậc thời gian trễ
    IF p_rule.late_step_hours IS NOT NULL AND p_rule.late_step_hours > 0 THEN
      v_late_steps := (v_delta / (p_rule.late_step_hours * 3600))::INT;
      v_pts := v_pts + (v_late_steps * COALESCE(p_rule.late_step_points, 0));
    END IF;
  END IF;

  RETURN QUERY SELECT v_pts, v_on_time, v_delta;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: chuẩn hoá period_start theo monthly cho occurred_at
CREATE OR REPLACE FUNCTION fn_kpi_period_start(p_ts TIMESTAMPTZ)
RETURNS DATE AS $$
  SELECT DATE_TRUNC('month', COALESCE(p_ts, NOW()))::DATE;
$$ LANGUAGE SQL IMMUTABLE;

-- ─── 4. Trigger 1: Task hoàn thành ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_kpi_ledger_on_task_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_owner UUID;
  v_company UUID;
  v_rule crm_kpi_scoring_rules;
  v_calc RECORD;
BEGIN
  IF NEW.completed_at IS NULL OR (TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  v_owner := COALESCE(NEW.assignee_id, NEW.created_by);
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  SELECT company_id INTO v_company FROM crm_leads WHERE id = NEW.lead_id;

  v_rule := fn_kpi_resolve_rule(v_company, 'task_completed', NEW.stage_slug);
  IF v_rule.id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_calc FROM fn_kpi_compute_points(v_rule, NEW.deadline, NEW.completed_at, NEW.created_at);

  INSERT INTO crm_kpi_ledger
    (user_id, company_id, lead_id, task_id, rule_id, event_type, source_kpi_code,
     deadline_at, occurred_at, delta_seconds, on_time, points, reason, period_start)
  VALUES
    (v_owner, v_company, NEW.lead_id, NEW.id, v_rule.id, 'task_completed', 'A4',
     NEW.deadline, NEW.completed_at, v_calc.delta_seconds, v_calc.on_time,
     v_calc.points,
     CASE WHEN v_calc.on_time IS NULL THEN 'Task không có deadline'
          WHEN v_calc.on_time THEN 'Task hoàn thành đúng/trước hạn'
          ELSE 'Task hoàn thành trễ'
     END,
     fn_kpi_period_start(NEW.completed_at))
  ON CONFLICT (task_id) WHERE event_type = 'task_completed' DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kpi_ledger_task_complete ON crm_tasks;
CREATE TRIGGER trg_kpi_ledger_task_complete
  AFTER INSERT OR UPDATE OF completed_at ON crm_tasks
  FOR EACH ROW EXECUTE FUNCTION fn_kpi_ledger_on_task_completed();

-- ─── 5. Trigger 2: Đổi stage lead/deal (dựa trên crm_lead_stage_history) ────
CREATE OR REPLACE FUNCTION fn_kpi_ledger_on_stage_history()
RETURNS TRIGGER AS $$
DECLARE
  v_owner UUID;
  v_company UUID;
  v_sla_days INT;
  v_deadline TIMESTAMPTZ;
  v_rule crm_kpi_scoring_rules;
  v_calc RECORD;
  v_to_slug TEXT;
BEGIN
  -- Trigger chạy AFTER UPDATE khi exited_at được set (đóng record cũ)
  IF NEW.exited_at IS NULL OR (TG_OP = 'UPDATE' AND OLD.exited_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT lead_owner_id, company_id INTO v_owner, v_company
    FROM crm_leads WHERE id = NEW.lead_id;
  IF v_owner IS NULL THEN
    v_owner := NEW.changed_by;
  END IF;
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  -- SLA của stage cũ (from_stage)
  SELECT sla_days INTO v_sla_days
    FROM crm_pipeline_stages WHERE id = NEW.from_stage_id;
  IF v_sla_days IS NOT NULL AND v_sla_days > 0 THEN
    v_deadline := NEW.entered_at + (v_sla_days || ' days')::INTERVAL;
  END IF;

  -- Ghi event 'stage_changed' (đo SLA từng stage)
  v_rule := fn_kpi_resolve_rule(v_company, 'stage_changed', NULL);
  IF v_rule.id IS NOT NULL AND v_deadline IS NOT NULL THEN
    SELECT * INTO v_calc FROM fn_kpi_compute_points(v_rule, v_deadline, NEW.exited_at, NEW.entered_at);

    INSERT INTO crm_kpi_ledger
      (user_id, company_id, lead_id, stage_id, rule_id, event_type, source_kpi_code,
       deadline_at, occurred_at, delta_seconds, on_time, points, reason, period_start, metadata)
    VALUES
      (v_owner, v_company, NEW.lead_id, NEW.from_stage_id, v_rule.id, 'stage_changed', 'A5',
       v_deadline, NEW.exited_at, v_calc.delta_seconds, v_calc.on_time, v_calc.points,
       CASE WHEN v_calc.on_time THEN 'Qua stage trong SLA' ELSE 'Vượt SLA stage' END,
       fn_kpi_period_start(NEW.exited_at),
       jsonb_build_object('from_slug', NEW.from_canonical_slug, 'to_slug', NEW.to_canonical_slug, 'sla_days', v_sla_days));
  END IF;

  -- Won / Lost theo to_canonical_slug
  v_to_slug := NEW.to_canonical_slug;
  IF v_to_slug = 'contract_signed' THEN
    v_rule := fn_kpi_resolve_rule(v_company, 'deal_won', NULL);
    IF v_rule.id IS NOT NULL THEN
      INSERT INTO crm_kpi_ledger
        (user_id, company_id, lead_id, stage_id, rule_id, event_type, source_kpi_code,
         occurred_at, on_time, points, reason, period_start)
      VALUES
        (v_owner, v_company, NEW.lead_id, NEW.to_stage_id, v_rule.id, 'deal_won', 'B4',
         NEW.exited_at, true, v_rule.on_time_points, 'Deal Won (ký hợp đồng)',
         fn_kpi_period_start(NEW.exited_at))
      ON CONFLICT (lead_id) WHERE event_type = 'deal_won' DO NOTHING;
    END IF;
  ELSIF v_to_slug = 'lost' THEN
    v_rule := fn_kpi_resolve_rule(v_company, 'deal_lost', NULL);
    IF v_rule.id IS NOT NULL THEN
      INSERT INTO crm_kpi_ledger
        (user_id, company_id, lead_id, stage_id, rule_id, event_type, source_kpi_code,
         occurred_at, on_time, points, reason, period_start)
      VALUES
        (v_owner, v_company, NEW.lead_id, NEW.to_stage_id, v_rule.id, 'deal_lost', 'C4',
         NEW.exited_at, false, v_rule.late_points, 'Deal Lost',
         fn_kpi_period_start(NEW.exited_at))
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

-- ─── 6. Function quét SLA breach (chạy cron mỗi giờ) ────────────────────────
-- Gọi: SELECT fn_kpi_scan_sla_breaches();
CREATE OR REPLACE FUNCTION fn_kpi_scan_sla_breaches()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_rule_lead crm_kpi_scoring_rules;
  v_rule_task crm_kpi_scoring_rules;
  rec RECORD;
BEGIN
  v_rule_lead := fn_kpi_resolve_rule(NULL, 'sla_breach', NULL);
  v_rule_task := fn_kpi_resolve_rule(NULL, 'sla_breach', NULL);

  -- Lead/Deal đang treo quá SLA, chưa có dòng breach trong 24h gần nhất
  IF v_rule_lead.id IS NOT NULL THEN
    FOR rec IN
      SELECT l.id AS lead_id, l.lead_owner_id, l.company_id, l.stage_id,
             l.stage_entered_at, s.sla_days,
             l.stage_entered_at + (s.sla_days || ' days')::INTERVAL AS deadline
        FROM crm_leads l
        JOIN crm_pipeline_stages s ON s.id = l.stage_id
       WHERE s.sla_days IS NOT NULL
         AND l.stage_entered_at + (s.sla_days || ' days')::INTERVAL < NOW()
         AND COALESCE(s.canonical_slug, '') NOT IN ('contract_signed','lost')
         AND l.lead_owner_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM crm_kpi_ledger k
            WHERE k.lead_id = l.id AND k.event_type = 'sla_breach'
              AND k.created_at > NOW() - INTERVAL '24 hours'
         )
    LOOP
      INSERT INTO crm_kpi_ledger
        (user_id, company_id, lead_id, stage_id, rule_id, event_type, source_kpi_code,
         deadline_at, occurred_at, delta_seconds, on_time, points, reason, period_start)
      VALUES
        (rec.lead_owner_id, rec.company_id, rec.lead_id, rec.stage_id, v_rule_lead.id,
         'sla_breach', 'A6', rec.deadline, NOW(),
         EXTRACT(EPOCH FROM (NOW() - rec.deadline))::BIGINT, false,
         v_rule_lead.late_points, 'Lead/Deal vượt SLA stage chưa đóng',
         fn_kpi_period_start(NOW()));
      v_count := v_count + 1;
    END LOOP;
  END IF;

  -- Task quá deadline mà chưa completed
  IF v_rule_task.id IS NOT NULL THEN
    FOR rec IN
      SELECT t.id AS task_id, t.lead_id, t.assignee_id, t.deadline,
             l.company_id
        FROM crm_tasks t
        LEFT JOIN crm_leads l ON l.id = t.lead_id
       WHERE t.deadline IS NOT NULL
         AND t.deadline < NOW()
         AND t.completed_at IS NULL
         AND COALESCE(t.status, '') NOT IN ('completed','cancelled')
         AND t.assignee_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM crm_kpi_ledger k
            WHERE k.task_id = t.id AND k.event_type = 'sla_breach'
              AND k.created_at > NOW() - INTERVAL '24 hours'
         )
    LOOP
      INSERT INTO crm_kpi_ledger
        (user_id, company_id, lead_id, task_id, rule_id, event_type, source_kpi_code,
         deadline_at, occurred_at, delta_seconds, on_time, points, reason, period_start)
      VALUES
        (rec.assignee_id, rec.company_id, rec.lead_id, rec.task_id, v_rule_task.id,
         'sla_breach', 'A4', rec.deadline, NOW(),
         EXTRACT(EPOCH FROM (NOW() - rec.deadline))::BIGINT, false,
         v_rule_task.late_points, 'Task quá deadline chưa hoàn thành',
         fn_kpi_period_start(NOW()));
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_kpi_scan_sla_breaches() IS 'Cron mỗi giờ: SELECT fn_kpi_scan_sla_breaches();';

-- ─── 7. Backfill: ghi lại điểm cho các task đã hoàn thành & lead Won/Lost ──
DO $$
DECLARE
  v_rule crm_kpi_scoring_rules;
  v_calc RECORD;
  rec RECORD;
BEGIN
  -- Backfill task_completed
  v_rule := fn_kpi_resolve_rule(NULL, 'task_completed', NULL);
  IF v_rule.id IS NOT NULL THEN
    FOR rec IN
      SELECT t.id, t.lead_id, t.assignee_id, t.created_by, t.deadline, t.completed_at,
             t.created_at, t.stage_slug, l.company_id
        FROM crm_tasks t
        LEFT JOIN crm_leads l ON l.id = t.lead_id
       WHERE t.completed_at IS NOT NULL
         AND COALESCE(t.assignee_id, t.created_by) IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM crm_kpi_ledger k WHERE k.task_id = t.id AND k.event_type = 'task_completed')
    LOOP
      SELECT * INTO v_calc FROM fn_kpi_compute_points(v_rule, rec.deadline, rec.completed_at, rec.created_at);
      INSERT INTO crm_kpi_ledger
        (user_id, company_id, lead_id, task_id, rule_id, event_type, source_kpi_code,
         deadline_at, occurred_at, delta_seconds, on_time, points, reason, period_start)
      VALUES
        (COALESCE(rec.assignee_id, rec.created_by), rec.company_id, rec.lead_id, rec.id, v_rule.id,
         'task_completed', 'A4', rec.deadline, rec.completed_at,
         v_calc.delta_seconds, v_calc.on_time, v_calc.points,
         '[backfill] Task hoàn thành', fn_kpi_period_start(rec.completed_at))
      ON CONFLICT (task_id) WHERE event_type = 'task_completed' DO NOTHING;
    END LOOP;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- SMOKE TEST (chạy thủ công sau migration):
--   SELECT * FROM crm_kpi_scoring_rules;
--   SELECT * FROM v_crm_kpi_user_period ORDER BY total_crm_kpi DESC LIMIT 20;
--   SELECT fn_kpi_scan_sla_breaches();    -- ghi breach lần đầu
-- ═══════════════════════════════════════════════════════════════════════════
