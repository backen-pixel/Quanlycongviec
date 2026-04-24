-- Migration 87: Backfill sync_role = 'sx_production' cho CRM deal stages tên chứa "Sản xuất"
-- Sau khi chạy, hệ thống không còn phụ thuộc tìm kiếm theo tên.
-- Script an toàn — chạy nhiều lần không có tác dụng phụ.

-- Đảm bảo cột sync_role tồn tại (migration 78 đã tạo, chạy an toàn lần 2)
ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS sync_role TEXT DEFAULT NULL;

-- Backfill: đặt sync_role = 'sx_production' cho các cột deal tên chứa "Sản xuất"
UPDATE crm_pipeline_stages
SET sync_role = 'sx_production'
WHERE pipeline_type = 'deal'
  AND is_won = false
  AND is_lost = false
  AND is_active = true
  AND (
    name ILIKE '%Sản xuất%'
    OR name ILIKE '%San xuat%'
    OR name ILIKE '%sản xuất%'
  )
  AND (sync_role IS NULL OR sync_role = '');

-- Thêm comment cho cột
COMMENT ON COLUMN crm_pipeline_stages.sync_role IS
  'Vai trò đồng bộ:
   sx_production  = CRM deal nhảy sang đây khi project SX đến cột trigger
   vc_delivery    = Nhảy sang đây khi project VC vào giai đoạn vận chuyển
   vc_installation = Nhảy sang đây khi lắp đặt
   vc_customer_care = Nhảy sang đây khi bảo hành / CSKH
   NULL = không tự động đồng bộ';

-- Index để query nhanh
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_sync_role
  ON crm_pipeline_stages(sync_role)
  WHERE sync_role IS NOT NULL;
