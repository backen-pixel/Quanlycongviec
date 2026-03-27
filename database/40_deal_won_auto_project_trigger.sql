-- 40_deal_won_auto_project_trigger.sql
-- Deal Thắng → Tự tạo dự án + tasks + checklists + gán luồng mặc định

CREATE OR REPLACE FUNCTION fn_deal_won_auto_project()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_won BOOLEAN;
  v_old_stage_won BOOLEAN;
  v_customer RECORD;
  v_code TEXT;
  v_last_num INT;
  v_yr TEXT;
  v_first_stage_id UUID;
  v_project_id UUID;
  v_flow_id UUID;
  v_tpl_set_id UUID;
  v_task RECORD;
  v_new_task_id UUID;
  v_task_count INT := 0;
  v_is_crm BOOLEAN;
  v_check RECORD;
BEGIN
  IF OLD.stage_id = NEW.stage_id THEN RETURN NEW; END IF;
  IF NEW.type != 'deal' THEN RETURN NEW; END IF;
  IF NEW.project_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT is_won INTO v_stage_won FROM crm_pipeline_stages WHERE id = NEW.stage_id;
  IF v_stage_won IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT is_won INTO v_old_stage_won FROM crm_pipeline_stages WHERE id = OLD.stage_id;
  IF v_old_stage_won IS TRUE THEN RETURN NEW; END IF;

  IF NEW.customer_id IS NOT NULL THEN
    SELECT full_name, phone, address INTO v_customer FROM customers WHERE id = NEW.customer_id;
  END IF;

  -- Gen code
  v_yr := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COALESCE(MAX(NULLIF(SPLIT_PART(code, '-', 3), '')::INT), 0)
    INTO v_last_num FROM projects WHERE code LIKE 'TB-' || v_yr || '-%';
  v_code := 'TB-' || v_yr || '-' || LPAD((v_last_num + 1)::TEXT, 3, '0');

  -- Lấy stage + flow mặc định
  SELECT id INTO v_first_stage_id FROM workflow_stages
    WHERE slug = 'consulting' ORDER BY order_index LIMIT 1;
  SELECT id INTO v_flow_id FROM workflow_flows WHERE is_default = true LIMIT 1;

  -- ============ TẠO DỰ ÁN ============
  INSERT INTO projects (
    code, name, description, customer_id, company_id,
    status, current_stage_id, flow_id,
    install_address, estimated_value,
    priority, sales_person_id, consult_date
  ) VALUES (
    v_code, NEW.title,
    COALESCE(NEW.description, 'Dự án tự động từ Deal ' || NEW.code),
    NEW.customer_id, NEW.company_id, 'consulting', v_first_stage_id, v_flow_id,
    v_customer.address, NEW.estimated_value,
    'medium'::task_priority, NEW.assigned_to, NOW()
  )
  RETURNING id INTO v_project_id;

  NEW.project_id := v_project_id;

  -- ============ TẠO TASKS TỪ TEMPLATE ============
  SELECT id INTO v_tpl_set_id FROM company_template_sets
    WHERE (company_id = NEW.company_id OR company_id IS NULL) AND is_default = true
    ORDER BY
      CASE WHEN company_id = NEW.company_id THEN 0 ELSE 1 END,
      (SELECT COUNT(*) FROM company_template_tasks ct WHERE ct.template_set_id = company_template_sets.id) DESC
    LIMIT 1;

  IF v_tpl_set_id IS NOT NULL THEN
    FOR v_task IN
      SELECT ctt.title, ctt.description, ctt.stage_id, ctt.order_index,
             ctt.priority, ctt.estimated_hours, ws.slug AS stage_slug
      FROM company_template_tasks ctt
      JOIN workflow_stages ws ON ws.id = ctt.stage_id
      WHERE ctt.template_set_id = v_tpl_set_id
      ORDER BY ws.order_index, ctt.order_index
    LOOP
      v_is_crm := v_task.stage_slug IN ('consulting','design','quotation','contract')
                  OR v_task.stage_slug LIKE 'consulting-%'
                  OR v_task.stage_slug LIKE 'design-%'
                  OR v_task.stage_slug LIKE 'quotation-%'
                  OR v_task.stage_slug LIKE 'contract-%';

      INSERT INTO tasks (
        project_id, stage_id, title, description,
        status, priority, order_index, estimated_hours,
        completed_at, created_by_id
      ) VALUES (
        v_project_id, v_task.stage_id, v_task.title, v_task.description,
        CASE WHEN v_is_crm THEN 'done'::task_status ELSE 'pending'::task_status END,
        COALESCE(v_task.priority, 'medium')::task_priority,
        v_task.order_index, v_task.estimated_hours,
        CASE WHEN v_is_crm THEN NOW() ELSE NULL END,
        NEW.created_by
      )
      RETURNING id INTO v_new_task_id;
      v_task_count := v_task_count + 1;
    END LOOP;
  END IF;

  -- Fallback
  IF v_task_count = 0 THEN
    INSERT INTO tasks (project_id, stage_id, title, status, priority, order_index, completed_at, created_by_id)
    SELECT v_project_id, ws.id, 'Công việc ' || ws.name,
      CASE WHEN ws.slug IN ('consulting','design','quotation','contract')
           THEN 'done'::task_status ELSE 'pending'::task_status END,
      'medium'::task_priority, 1,
      CASE WHEN ws.slug IN ('consulting','design','quotation','contract')
           THEN NOW() ELSE NULL END,
      NEW.created_by
    FROM workflow_stages ws
    WHERE ws.slug IN ('consulting','design','quotation','contract','production','shipping','installation','customer-care')
    ORDER BY ws.order_index;
  END IF;

  -- Log
  INSERT INTO crm_activities (lead_id, type, title, description, created_by)
  VALUES (NEW.id, 'note', '🎉 Deal thắng — Tự tạo dự án',
    'Dự án ' || v_code || ' đã được tạo tự động với luồng mặc định', NEW.created_by);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deal_won_auto_project ON crm_leads;

CREATE TRIGGER trg_deal_won_auto_project
  BEFORE UPDATE OF stage_id ON crm_leads
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION fn_deal_won_auto_project();
