-- 448: Lead/deal chưa có SĐT — xóa deadline thẻ + hạn nhiệm vụ CRM đang mở
-- Khớp rule UI: chưa có số thì không tính/hiển thị quá hạn & deadline.

DO $$
DECLARE
  v_leads INT := 0;
  v_tasks INT := 0;
BEGIN
  WITH no_phone AS (
    SELECT l.id
    FROM crm_leads l
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE (l.phone IS NULL OR btrim(l.phone) = '')
      AND (c.phone IS NULL OR btrim(c.phone) = '')
  )
  UPDATE crm_leads l
  SET
    kanban_deadline_at = NULL,
    kanban_deadline_reason = NULL,
    updated_at = now()
  FROM no_phone n
  WHERE l.id = n.id
    AND (
      l.kanban_deadline_at IS NOT NULL
      OR COALESCE(l.kanban_deadline_reason, '') <> ''
    );

  GET DIAGNOSTICS v_leads = ROW_COUNT;

  WITH no_phone AS (
    SELECT l.id
    FROM crm_leads l
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE (l.phone IS NULL OR btrim(l.phone) = '')
      AND (c.phone IS NULL OR btrim(c.phone) = '')
  )
  UPDATE crm_tasks t
  SET
    deadline = NULL,
    updated_at = now()
  FROM no_phone n
  WHERE t.lead_id = n.id
    AND t.deadline IS NOT NULL
    AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled');

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '448: cleared kanban_deadline on % leads; cleared deadline on % open crm_tasks', v_leads, v_tasks;
END $$;
