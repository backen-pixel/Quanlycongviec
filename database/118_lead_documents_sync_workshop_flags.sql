-- Đồng bộ lại cờ xưởng / project_id cho tài liệu sinh từ nhiệm vụ CRM khi deal đã có dự án
-- (trước đây non-sx task có shared_to_workshop = false → không hiện ở tab Tài liệu SX)

UPDATE lead_documents ld
SET
  shared_to_workshop = true,
  project_id = COALESCE(ld.project_id, l.project_id)
FROM crm_leads l
WHERE l.id = ld.lead_id
  AND l.project_id IS NOT NULL
  AND ld.shared_to_workshop = false
  AND (
    ld.source_crm_task_id IS NOT NULL
    OR ld.source_attachment_id IS NOT NULL
  );
