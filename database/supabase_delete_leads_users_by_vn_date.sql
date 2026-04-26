-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase SQL Editor — xóa CRM lead + public.users theo một ngày lịch Việt Nam
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Đổi ngày: thay mọi DATE '2026-04-25' bằng ngày bạn cần (ví dụ 25/04/2026).
--
-- Cách chạy:
--   1) Chạy khối PREVIEW (hai SELECT) để kiểm tra.
--   2) Bỏ comment /* ... */ quanh khối DELETE (hoặc copy khối DELETE ra tab mới), rồi chạy.
--
-- Lưu ý:
--   - Lọc theo (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
--   - User: không xóa role admin, manager (public.users).
--   - Không xóa auth.users — nếu dùng Supabase Auth, xử lý riêng trong Dashboard.
--   - Nếu báo lỗi thiếu bảng, comment dòng DELETE tương ứng (schema khác bản migration).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PREVIEW (an toàn — chỉ đọc)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT id, code, type, title, project_id, created_at
FROM crm_leads
WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = DATE '2026-04-25'
ORDER BY created_at;

SELECT id, email, full_name, role, created_at
FROM public.users
WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = DATE '2026-04-25'
ORDER BY created_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- DELETE — bỏ /* và */ hai dòng dưới để thực thi
-- ═══════════════════════════════════════════════════════════════════════════

/*
BEGIN;

CREATE TEMP TABLE _lead_day ON COMMIT DROP AS
WITH RECURSIVE seed AS (
  SELECT id, parent_lead_id, project_id
  FROM crm_leads
  WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = DATE '2026-04-25'
),
descendants AS (
  SELECT id, parent_lead_id, project_id FROM seed
  UNION ALL
  SELECT l.id, l.parent_lead_id, l.project_id
  FROM crm_leads l
  INNER JOIN descendants d ON l.parent_lead_id = d.id
)
SELECT DISTINCT id, parent_lead_id, project_id FROM descendants;

CREATE INDEX ON _lead_day (id);

-- Hóa đơn / đơn / báo giá gắn lead (cả lead con trong cây)
DELETE FROM invoices i
WHERE i.lead_id IN (SELECT id FROM _lead_day);

DELETE FROM order_items oi
WHERE oi.order_id IN (
  SELECT o.id FROM orders o
  WHERE o.lead_id IN (SELECT id FROM _lead_day)
     OR o.fulfillment_lead_id IN (SELECT id FROM _lead_day)
);

DELETE FROM orders o
WHERE o.lead_id IN (SELECT id FROM _lead_day)
   OR o.fulfillment_lead_id IN (SELECT id FROM _lead_day);

DELETE FROM quotations q
WHERE q.lead_id IN (SELECT id FROM _lead_day);

DELETE FROM crm_tasks WHERE lead_id IN (SELECT id FROM _lead_day);
DELETE FROM crm_activities WHERE lead_id IN (SELECT id FROM _lead_day);
DELETE FROM lead_documents WHERE lead_id IN (SELECT id FROM _lead_day);
DELETE FROM lead_members WHERE lead_id IN (SELECT id FROM _lead_day);
DELETE FROM lead_messages WHERE lead_id IN (SELECT id FROM _lead_day);

-- Dự án gắn các lead trong tập (tránh project mồ côi)
CREATE TEMP TABLE _proj_ids ON COMMIT DROP AS
SELECT DISTINCT project_id AS id FROM _lead_day WHERE project_id IS NOT NULL;

DELETE FROM task_checklists
WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM _proj_ids));

DELETE FROM task_comments
WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM _proj_ids));

DELETE FROM task_participants
WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM _proj_ids));

DELETE FROM task_time_logs
WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM _proj_ids));

DELETE FROM file_attachments
WHERE entity_type = 'task'
  AND entity_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM _proj_ids));

DELETE FROM tasks WHERE project_id IN (SELECT id FROM _proj_ids);

DELETE FROM project_comments WHERE project_id IN (SELECT id FROM _proj_ids);
DELETE FROM stage_transitions WHERE project_id IN (SELECT id FROM _proj_ids);
DELETE FROM project_workflow_lines WHERE project_id IN (SELECT id FROM _proj_ids);
DELETE FROM project_products WHERE project_id IN (SELECT id FROM _proj_ids);
DELETE FROM project_company_assignments WHERE project_id IN (SELECT id FROM _proj_ids);
DELETE FROM project_approvals WHERE project_id IN (SELECT id FROM _proj_ids);

DELETE FROM project_phase_handoffs WHERE project_id IN (SELECT id FROM _proj_ids);

DELETE FROM activity_logs
WHERE entity_type = 'project'
  AND entity_id IN (SELECT id FROM _proj_ids);

DELETE FROM notifications
WHERE entity_type = 'project'
  AND entity_id IN (SELECT id FROM _proj_ids);

DELETE FROM projects WHERE id IN (SELECT id FROM _proj_ids);

-- Xóa lead lá → trong tập _lead_day, lặp đến hết
DO $$
DECLARE
  n int;
BEGIN
  LOOP
    DELETE FROM crm_leads l
    WHERE l.id IN (SELECT id FROM _lead_day)
      AND NOT EXISTS (
        SELECT 1 FROM crm_leads c
        WHERE c.parent_lead_id = l.id
          AND c.id IN (SELECT id FROM _lead_day)
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
  END LOOP;
END $$;

DELETE FROM public.users u
WHERE (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = DATE '2026-04-25'
  AND lower(u.role::text) NOT IN ('admin', 'manager');

COMMIT;
*/
