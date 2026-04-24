-- Migration 89: Backfill sync_role cho CRM deal stages liên quan đến Vận chuyển & Lắp đặt
-- Để CRM deal tự động nhảy cột khi VC module tiến trình.
-- Chạy sau migration 87.

-- Đảm bảo cột sync_role tồn tại
ALTER TABLE crm_pipeline_stages ADD COLUMN IF NOT EXISTS sync_role TEXT;

-- Backfill vc_delivery: CRM stage tên chứa "vận chuyển" (loại trừ "sản xuất")
UPDATE crm_pipeline_stages
SET sync_role = 'vc_delivery'
WHERE pipeline_type = 'deal'
  AND is_active = true
  AND sync_role IS NULL
  AND (
    LOWER(name) LIKE '%vận chuyển%'
    OR LOWER(name) LIKE '%van chuyen%'
    OR LOWER(name) LIKE '%delivery%'
  )
  AND LOWER(name) NOT LIKE '%sản xuất%';

-- Backfill vc_installation: CRM stage tên chứa "lắp đặt"
UPDATE crm_pipeline_stages
SET sync_role = 'vc_installation'
WHERE pipeline_type = 'deal'
  AND is_active = true
  AND sync_role IS NULL
  AND (
    LOWER(name) LIKE '%lắp đặt%'
    OR LOWER(name) LIKE '%lap dat%'
    OR LOWER(name) LIKE '%install%'
  );

-- Backfill vc_customer_care: CRM stage tên chứa "chăm sóc" hoặc "bảo hành" hoặc "cskh"
UPDATE crm_pipeline_stages
SET sync_role = 'vc_customer_care'
WHERE pipeline_type = 'deal'
  AND is_active = true
  AND sync_role IS NULL
  AND (
    LOWER(name) LIKE '%chăm sóc%'
    OR LOWER(name) LIKE '%cham soc%'
    OR LOWER(name) LIKE '%bảo hành%'
    OR LOWER(name) LIKE '%bao hanh%'
    OR LOWER(name) LIKE '%cskh%'
    OR LOWER(name) LIKE '%customer%'
  );

-- Index cho tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_sync_role
  ON crm_pipeline_stages(sync_role)
  WHERE sync_role IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- Backfill crm_sync_type cho logistics_pipeline_stages hiện có
-- ══════════════════════════════════════════════════════════════

-- Đảm bảo column tồn tại
ALTER TABLE logistics_pipeline_stages ADD COLUMN IF NOT EXISTS crm_sync_type TEXT;

-- Fix sai values từ các migration cũ
UPDATE logistics_pipeline_stages SET crm_sync_type = 'delivery'     WHERE crm_sync_type IN ('vc_delivery');
UPDATE logistics_pipeline_stages SET crm_sync_type = 'installation'  WHERE crm_sync_type IN ('vc_installation');
UPDATE logistics_pipeline_stages SET crm_sync_type = 'customer_care' WHERE crm_sync_type IN ('vc_warranty','vc_customer_care');

-- Backfill stages chưa có crm_sync_type dựa theo tên
UPDATE logistics_pipeline_stages
SET crm_sync_type = 'delivery'
WHERE crm_sync_type IS NULL
  AND bucket_slug IS DISTINCT FROM 'delivery_pending'
  AND (
    LOWER(name) LIKE '%đang vận chuyển%'
    OR LOWER(name) LIKE '%vận chuyển thành công%'
    OR (LOWER(name) LIKE '%vận chuyển%' AND LOWER(name) NOT LIKE '%chờ%')
  );

UPDATE logistics_pipeline_stages
SET crm_sync_type = 'installation'
WHERE crm_sync_type IS NULL
  AND (
    LOWER(name) LIKE '%đang lắp đặt%'
    OR LOWER(name) LIKE '%lắp đặt%'
    OR LOWER(name) LIKE '%lap dat%'
  );

UPDATE logistics_pipeline_stages
SET crm_sync_type = 'customer_care'
WHERE crm_sync_type IS NULL
  AND (
    LOWER(name) LIKE '%bảo hành%'
    OR LOWER(name) LIKE '%chăm sóc%'
    OR LOWER(name) LIKE '%cskh%'
    OR LOWER(name) LIKE '%bao hanh%'
  );

-- Kiểm tra kết quả
SELECT 'CRM stages:' as type, name, sync_role as value
FROM crm_pipeline_stages
WHERE pipeline_type = 'deal' AND sync_role IS NOT NULL
UNION ALL
SELECT 'VC stages:', name, crm_sync_type
FROM logistics_pipeline_stages
WHERE crm_sync_type IS NOT NULL
ORDER BY type, name;
