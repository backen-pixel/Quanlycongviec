-- KPI cron: sla_days = 0 = tắt SLA cột — không quét breach lead/deal (khớp UI «Bỏ quá hạn»).

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
         AND s.sla_days > 0
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

COMMENT ON FUNCTION fn_kpi_scan_sla_breaches() IS
  'Cron mỗi giờ: SELECT fn_kpi_scan_sla_breaches(); Cột sla_days=0 không quét breach lead/deal.';
