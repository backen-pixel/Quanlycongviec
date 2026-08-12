-- 508_crm_events_module_custom.sql
-- Ghi chú: crm_events.module nhận thêm app_modules.module_key (không chỉ crm/production/logistics/general).

COMMENT ON COLUMN crm_events.module IS
  'Khối sự kiện: crm | production | logistics | general | <app_modules.module_key>';
