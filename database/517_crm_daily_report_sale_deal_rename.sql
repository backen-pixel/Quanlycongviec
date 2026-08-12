-- 517: Đổi mẫu Admin-Deal → Sale-Deal
BEGIN;

UPDATE crm_daily_report_templates
SET
  role_key = 'sale_deal',
  name = 'Sale - Deal',
  description = 'Báo cáo ngày theo luồng Deal: khảo sát, báo giá, hợp đồng, sản xuất, VC/LĐ, hoàn thành',
  updated_at = NOW()
WHERE id = 'a1000000-0000-4000-8000-000000000003'
   OR role_key = 'deal_admin';

COMMIT;
