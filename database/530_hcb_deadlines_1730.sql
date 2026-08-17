-- 530: HCB — mọi deadline timestamptz về 17:30 giờ VN (giữ ngày lịch).
-- Idempotent. DATE (production_deadline / delivery_date) không chứa giờ — so sánh UI/BE dùng 17:30.

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  n_proj_kanban INT := 0;
  n_proj_design INT := 0;
  n_tasks INT := 0;
  n_lead_kanban INT := 0;
  n_crm_hcb INT := 0;
  n_crm_exec INT := 0;
  n_crm_sx INT := 0;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE id = v_hcb
     OR short_name ILIKE 'HCB'
     OR name ILIKE '%Hucabi%'
  ORDER BY CASE
    WHEN id = '18c2563f-3495-498d-8199-23200c9f420e' THEN 0
    WHEN short_name ILIKE 'HCB' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE NOTICE '530: Không tìm thấy công ty HCB — bỏ qua.';
    RETURN;
  END IF;

  BEGIN
    IF to_regclass('public.sx_company_schedule_config') IS NOT NULL THEN
      INSERT INTO sx_company_schedule_config (
        company_id, default_deadline_time, glass_cutoff_time, tempered_glass_days, updated_at
      ) VALUES (v_hcb, TIME '17:30:00', TIME '12:00:00', 3, now())
      ON CONFLICT (company_id) DO UPDATE SET
        default_deadline_time = TIME '17:30:00',
        updated_at = now();
    END IF;
  EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
    NULL;
  END;

  UPDATE projects p
  SET sx_kanban_deadline_at = (
    ((p.sx_kanban_deadline_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + TIME '17:30')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  WHERE p.company_id = v_hcb
    AND p.sx_kanban_deadline_at IS NOT NULL
    AND to_char(p.sx_kanban_deadline_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') IS DISTINCT FROM '17:30';
  GET DIAGNOSTICS n_proj_kanban = ROW_COUNT;

  UPDATE projects p
  SET design_deadline = (
    ((p.design_deadline AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + TIME '17:30')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  WHERE p.company_id = v_hcb
    AND p.design_deadline IS NOT NULL
    AND to_char(p.design_deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') IS DISTINCT FROM '17:30';
  GET DIAGNOSTICS n_proj_design = ROW_COUNT;

  UPDATE tasks t
  SET deadline = (
    ((t.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + TIME '17:30')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  FROM projects p
  WHERE p.id = t.project_id
    AND p.company_id = v_hcb
    AND t.deadline IS NOT NULL
    AND to_char(t.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') IS DISTINCT FROM '17:30';
  GET DIAGNOSTICS n_tasks = ROW_COUNT;

  UPDATE crm_leads l
  SET kanban_deadline_at = (
    ((l.kanban_deadline_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + TIME '17:30')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  WHERE l.kanban_deadline_at IS NOT NULL
    AND to_char(l.kanban_deadline_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') IS DISTINCT FROM '17:30'
    AND (
      l.company_id = v_hcb
      OR EXISTS (
        SELECT 1 FROM projects p WHERE p.id = l.project_id AND p.company_id = v_hcb
      )
    );
  GET DIAGNOSTICS n_lead_kanban = ROW_COUNT;

  UPDATE crm_tasks ct
  SET deadline = (
    ((ct.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + TIME '17:30')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  FROM crm_leads l
  WHERE l.id = ct.lead_id
    AND l.company_id = v_hcb
    AND ct.deadline IS NOT NULL
    AND to_char(ct.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') IS DISTINCT FROM '17:30';
  GET DIAGNOSTICS n_crm_hcb = ROW_COUNT;

  UPDATE crm_tasks ct
  SET deadline = (
    ((ct.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + TIME '17:30')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  WHERE ct.executor_company_id = v_hcb
    AND ct.deadline IS NOT NULL
    AND to_char(ct.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') IS DISTINCT FROM '17:30';
  GET DIAGNOSTICS n_crm_exec = ROW_COUNT;

  UPDATE crm_tasks ct
  SET deadline = (
    ((ct.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + TIME '17:30')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  FROM crm_leads l
  JOIN projects p ON p.id = l.project_id
  WHERE l.id = ct.lead_id
    AND p.company_id = v_hcb
    AND ct.stage_slug ILIKE 'sx_%'
    AND ct.deadline IS NOT NULL
    AND to_char(ct.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') IS DISTINCT FROM '17:30';
  GET DIAGNOSTICS n_crm_sx = ROW_COUNT;

  RAISE NOTICE '530 HCB 17:30: kanban=% design=% tasks=% lead_kanban=% crm_hcb=% crm_exec=% crm_sx=%',
    n_proj_kanban, n_proj_design, n_tasks, n_lead_kanban, n_crm_hcb, n_crm_exec, n_crm_sx;
END $$;
