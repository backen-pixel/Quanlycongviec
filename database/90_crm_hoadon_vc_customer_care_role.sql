-- Migration 90: Gán sync_role='vc_customer_care' cho CRM stage "Hóa đơn"
-- Khi deal vận chuyển/lắp đặt đến "Bảo hành & CSKH", CRM deal tự chuyển sang cột này.

UPDATE crm_pipeline_stages
SET sync_role = 'vc_customer_care'
WHERE pipeline_type = 'deal'
  AND is_active = TRUE
  AND LOWER(name) LIKE '%hóa đơn%'
  AND (sync_role IS NULL OR sync_role = '');

-- Fallback theo id cụ thể (nếu tên khác)
UPDATE crm_pipeline_stages
SET sync_role = 'vc_customer_care'
WHERE id = '834b2bd4-7c19-46f8-8243-94bab4dbbf2b'
  AND (sync_role IS NULL OR sync_role = '');
