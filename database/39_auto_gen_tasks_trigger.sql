-- 39_auto_gen_tasks_trigger.sql
-- Trigger tự động tạo CRM tasks khi:
-- 1. INSERT vào crm_leads (tạo lead mới)
-- 2. UPDATE type từ 'lead' → 'deal' (chuyển đổi)

-- Function: tạo tasks từ templates
CREATE OR REPLACE FUNCTION fn_auto_gen_crm_tasks()
RETURNS TRIGGER AS $$
DECLARE
  v_type TEXT;
  v_tpl RECORD;
  v_item RECORD;
  v_count INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_type := NEW.type;

  -- Khi UPDATE: chỉ chạy nếu type thay đổi từ 'lead' → 'deal'
  IF TG_OP = 'UPDATE' THEN
    IF OLD.type = NEW.type THEN
      RETURN NEW; -- type không đổi → bỏ qua
    END IF;
    -- Xóa tasks cũ của lead trước khi gen tasks deal mới
    IF OLD.type = 'lead' AND NEW.type = 'deal' THEN
      DELETE FROM crm_tasks WHERE lead_id = NEW.id;
    END IF;
  END IF;

  -- Kiểm tra đã có tasks chưa (tránh duplicate khi INSERT)
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM crm_tasks WHERE lead_id = NEW.id LIMIT 1;
    IF FOUND THEN
      RETURN NEW; -- đã có tasks → bỏ qua
    END IF;
  END IF;

  -- Loop qua templates phù hợp
  FOR v_tpl IN
    SELECT id, stage_slug
    FROM crm_task_templates
    WHERE is_active = true
      AND (is_default = true OR NOT EXISTS (
        SELECT 1 FROM crm_task_templates WHERE is_default = true AND is_active = true
      ))
      AND (
        (v_type = 'lead' AND (pipeline_type IN ('lead', 'both') OR pipeline_type IS NULL) AND stage_slug NOT LIKE 'deal_%')
        OR
        (v_type = 'deal' AND (pipeline_type IN ('deal', 'both') OR pipeline_type IS NULL))
      )
    ORDER BY order_index
  LOOP
    -- Loop qua items trong template
    FOR v_item IN
      SELECT title, description, priority, deadline_days, order_index, checklist,
             default_allowed_companies, default_allowed_departments
      FROM crm_task_template_items
      WHERE template_id = v_tpl.id
      ORDER BY order_index
    LOOP
      INSERT INTO crm_tasks (
        lead_id, title, description, priority, stage_slug, order_index,
        deadline, checklist, default_allowed_companies, default_allowed_departments,
        created_by
      ) VALUES (
        NEW.id,
        v_item.title,
        v_item.description,
        COALESCE(v_item.priority, 'medium'),
        v_tpl.stage_slug,
        v_item.order_index,
        CASE WHEN v_item.deadline_days > 0 THEN v_now + (v_item.deadline_days || ' days')::INTERVAL ELSE NULL END,
        COALESCE(v_item.checklist, '[]'::jsonb),
        v_item.default_allowed_companies,
        v_item.default_allowed_departments,
        NEW.created_by
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- Fallback: nếu không có templates → tạo tasks mặc định
  IF v_count = 0 THEN
    IF v_type = 'lead' THEN
      INSERT INTO crm_tasks (lead_id, title, priority, stage_slug, order_index, checklist, created_by) VALUES
        (NEW.id, 'Tiếp nhận yêu cầu khách hàng', 'high', 'consulting', 1, '[]', NEW.created_by),
        (NEW.id, 'Tư vấn sản phẩm & vật liệu', 'high', 'consulting', 2, '[]', NEW.created_by),
        (NEW.id, 'Khảo sát thực tế (nếu cần)', 'medium', 'consulting', 3, '[]', NEW.created_by),
        (NEW.id, 'Ghi nhận nhu cầu chi tiết', 'medium', 'consulting', 4, '[]', NEW.created_by);
    ELSE
      INSERT INTO crm_tasks (lead_id, title, priority, stage_slug, order_index, checklist, created_by) VALUES
        (NEW.id, 'Xác nhận yêu cầu từ Lead', 'high', 'consulting', 1, '[]', NEW.created_by),
        (NEW.id, 'Thiết kế bản vẽ sơ bộ', 'high', 'design', 1, '[]', NEW.created_by),
        (NEW.id, 'Lập báo giá chi tiết', 'high', 'quotation', 1, '[]', NEW.created_by),
        (NEW.id, 'Soạn hợp đồng', 'high', 'contract', 1, '[]', NEW.created_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger cũ nếu có
DROP TRIGGER IF EXISTS trg_auto_gen_tasks_on_insert ON crm_leads;
DROP TRIGGER IF EXISTS trg_auto_gen_tasks_on_update ON crm_leads;

-- Trigger khi INSERT (tạo lead mới)
CREATE TRIGGER trg_auto_gen_tasks_on_insert
  AFTER INSERT ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_gen_crm_tasks();

-- Trigger khi UPDATE type (chuyển lead → deal)
CREATE TRIGGER trg_auto_gen_tasks_on_update
  AFTER UPDATE OF type ON crm_leads
  FOR EACH ROW
  WHEN (OLD.type IS DISTINCT FROM NEW.type)
  EXECUTE FUNCTION fn_auto_gen_crm_tasks();
