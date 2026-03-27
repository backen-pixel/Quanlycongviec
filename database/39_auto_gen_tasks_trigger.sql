-- 39_auto_gen_tasks_trigger.sql
-- Trigger tự động tạo CRM tasks khi:
-- 1. INSERT vào crm_leads (tạo lead mới) → gen tasks Lead
-- 2. UPDATE type từ 'lead' → 'deal' (chuyển đổi) → xóa tasks Lead + gen tasks Deal

-- ============================================================
-- FUNCTION
-- ============================================================
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

  -- === UPDATE: chỉ xử lý khi type thay đổi ===
  IF TG_OP = 'UPDATE' THEN
    IF OLD.type = NEW.type THEN
      RETURN NEW;
    END IF;
    -- Chuyển lead → deal: xóa tasks cũ
    IF OLD.type = 'lead' AND NEW.type = 'deal' THEN
      DELETE FROM crm_tasks WHERE lead_id = NEW.id;
    END IF;
  END IF;

  -- === INSERT: skip nếu đã có tasks (backend tạo trước) ===
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM crm_tasks WHERE lead_id = NEW.id LIMIT 1;
    IF FOUND THEN
      RETURN NEW;
    END IF;
  END IF;

  -- === Lấy templates phù hợp → items → insert tasks ===
  FOR v_tpl IN
    SELECT t.id, t.stage_slug
    FROM crm_task_templates t
    WHERE t.is_active = true
      AND t.is_default = true
      AND (
        CASE WHEN v_type = 'lead' THEN
          (t.pipeline_type IN ('lead','both') OR t.pipeline_type IS NULL)
          AND t.stage_slug NOT LIKE 'deal_%'
        ELSE
          (t.pipeline_type IN ('deal','both') OR t.pipeline_type IS NULL)
        END
      )
    ORDER BY t.order_index
  LOOP
    FOR v_item IN
      SELECT i.title, i.description, i.priority, i.deadline_days,
             i.order_index, i.checklist
      FROM crm_task_template_items i
      WHERE i.template_id = v_tpl.id
      ORDER BY i.order_index
    LOOP
      INSERT INTO crm_tasks (
        lead_id, title, description, priority, stage_slug,
        order_index, deadline, checklist, created_by, status
      ) VALUES (
        NEW.id,
        v_item.title,
        v_item.description,
        COALESCE(v_item.priority, 'medium'),
        v_tpl.stage_slug,
        v_item.order_index,
        CASE WHEN v_item.deadline_days IS NOT NULL AND v_item.deadline_days > 0
          THEN v_now + (v_item.deadline_days || ' days')::INTERVAL
          ELSE NULL
        END,
        COALESCE(v_item.checklist, '[]'::jsonb),
        NEW.created_by,
        'pending'
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- === Fallback nếu không tìm thấy template items nào ===
  IF v_count = 0 THEN
    IF v_type = 'lead' THEN
      INSERT INTO crm_tasks (lead_id, title, priority, stage_slug, order_index, checklist, created_by, status) VALUES
        (NEW.id, 'Tiếp nhận yêu cầu khách hàng',     'high',   'consulting', 1, '[]', NEW.created_by, 'pending'),
        (NEW.id, 'Tư vấn sản phẩm & vật liệu',       'high',   'consulting', 2, '[]', NEW.created_by, 'pending'),
        (NEW.id, 'Khảo sát thực tế (nếu cần)',        'medium', 'consulting', 3, '[]', NEW.created_by, 'pending'),
        (NEW.id, 'Ghi nhận nhu cầu chi tiết',         'medium', 'consulting', 4, '[]', NEW.created_by, 'pending');
    ELSE
      INSERT INTO crm_tasks (lead_id, title, priority, stage_slug, order_index, checklist, created_by, status) VALUES
        (NEW.id, 'Xác nhận yêu cầu từ Lead',  'high', 'deal_new',            1, '[]', NEW.created_by, 'pending'),
        (NEW.id, 'Lập báo giá chi tiết',       'high', 'deal_quote_contract', 1, '[]', NEW.created_by, 'pending'),
        (NEW.id, 'Soạn hợp đồng',              'high', 'deal_quote_contract', 2, '[]', NEW.created_by, 'pending'),
        (NEW.id, 'Chốt sản xuất & đặt hàng',  'high', 'deal_ordering',       1, '[]', NEW.created_by, 'pending');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_auto_gen_tasks_on_insert ON crm_leads;
DROP TRIGGER IF EXISTS trg_auto_gen_tasks_on_update ON crm_leads;

-- Khi tạo Lead mới
CREATE TRIGGER trg_auto_gen_tasks_on_insert
  AFTER INSERT ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_gen_crm_tasks();

-- Khi chuyển Lead → Deal
CREATE TRIGGER trg_auto_gen_tasks_on_update
  AFTER UPDATE OF type ON crm_leads
  FOR EACH ROW
  WHEN (OLD.type IS DISTINCT FROM NEW.type)
  EXECUTE FUNCTION fn_auto_gen_crm_tasks();
