-- Migration 78: Thêm cờ đồng bộ giữa SX → VC → CRM
-- Chạy trong Supabase Dashboard > SQL Editor

-- 1. production_pipeline_stages: cờ bàn giao sang module Vận chuyển
ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_handover_to_logistics BOOLEAN DEFAULT false;

-- 2. logistics_pipeline_stages: loại đồng bộ sang CRM khi cột VC đạt "thắng"
--    Giá trị: NULL | 'delivery' | 'installation' | 'customer_care'
ALTER TABLE logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS crm_sync_type TEXT DEFAULT NULL;

-- 3. crm_pipeline_stages: vai trò đồng bộ từ VC
--    Giá trị: NULL | 'vc_delivery' | 'vc_installation' | 'vc_customer_care'
ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS sync_role TEXT DEFAULT NULL;

-- Tự động gán sync_role cho các cột CRM hiện có dựa trên tên (best-effort)
UPDATE crm_pipeline_stages SET sync_role = 'vc_delivery'
WHERE pipeline_type = 'deal' AND sync_role IS NULL
  AND (name ILIKE '%vận chuyển%' OR name ILIKE '%van chuyen%' OR name ILIKE '%giao hàng%');

UPDATE crm_pipeline_stages SET sync_role = 'vc_installation'
WHERE pipeline_type = 'deal' AND sync_role IS NULL
  AND (name ILIKE '%lắp đặt%' OR name ILIKE '%lap dat%' OR name ILIKE '%lắp%');

UPDATE crm_pipeline_stages SET sync_role = 'vc_customer_care'
WHERE pipeline_type = 'deal' AND sync_role IS NULL
  AND (name ILIKE '%chăm sóc%' OR name ILIKE '%cskh%' OR name ILIKE '%bảo hành%');

SELECT 'Migration 78 done' AS result;
