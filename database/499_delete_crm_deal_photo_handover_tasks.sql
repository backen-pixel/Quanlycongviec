-- =====================================================================
-- 499. Xóa nhiệm vụ chụp hình / nghiệm thu trên mọi deal CRM
-- ---------------------------------------------------------------------
-- Titles:
--   - Chụp hình nhận hàng tại xưởng
--   - Chụp hình nhận hàng tại công trình
--   - Nghiệm thu công trình
--   - Chụp hình bàn giao công trình
--
-- Đồng thời gỡ khỏi crm_task_template_items để không regenerate
-- khi deal chuyển stage.
-- =====================================================================

-- 1) Gỡ FK nullable (kpi ledger, lead documents)
WITH target AS (
  SELECT t.id
  FROM crm_tasks t
  JOIN crm_leads cl ON cl.id = t.lead_id
  WHERE cl.type = 'deal'
    AND lower(trim(t.title)) IN (
      'chụp hình nhận hàng tại xưởng',
      'chụp hình nhận hàng tại công trình',
      'nghiệm thu công trình',
      'chụp hình bàn giao công trình'
    )
)
UPDATE crm_kpi_ledger k
SET task_id = NULL
FROM target tg
WHERE k.task_id = tg.id;

WITH target AS (
  SELECT t.id
  FROM crm_tasks t
  JOIN crm_leads cl ON cl.id = t.lead_id
  WHERE cl.type = 'deal'
    AND lower(trim(t.title)) IN (
      'chụp hình nhận hàng tại xưởng',
      'chụp hình nhận hàng tại công trình',
      'nghiệm thu công trình',
      'chụp hình bàn giao công trình'
    )
)
UPDATE lead_documents d
SET source_crm_task_id = NULL
FROM target tg
WHERE d.source_crm_task_id = tg.id;

-- 2) Xóa nhiệm vụ trên mọi deal
DELETE FROM crm_tasks t
USING crm_leads cl
WHERE t.lead_id = cl.id
  AND cl.type = 'deal'
  AND lower(trim(t.title)) IN (
    'chụp hình nhận hàng tại xưởng',
    'chụp hình nhận hàng tại công trình',
    'nghiệm thu công trình',
    'chụp hình bàn giao công trình'
  );

-- 3) Gỡ khỏi mẫu task (tránh tạo lại khi chuyển stage)
DELETE FROM crm_task_template_items
WHERE lower(trim(title)) IN (
  'chụp hình nhận hàng tại xưởng',
  'chụp hình nhận hàng tại công trình',
  'nghiệm thu công trình',
  'chụp hình bàn giao công trình'
);
