-- Đồng bộ company_id trên crm_events theo lead/deal liên kết (sự kiện luôn gắn đúng công ty)
UPDATE crm_events e
SET company_id = l.company_id
FROM crm_leads l
WHERE e.lead_id = l.id
  AND l.company_id IS NOT NULL
  AND (e.company_id IS DISTINCT FROM l.company_id);
