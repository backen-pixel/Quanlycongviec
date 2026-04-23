-- =====================================================
-- 75_crm_deal_san_xuat_stage.sql
-- Đảm bảo stage "Sản xuất" tồn tại trong CRM deal pipeline.
-- NOTE: Stage này đã có sẵn trong DB ở order_index=7.
--       File này chỉ để tham chiếu / chạy trên DB mới.
-- =====================================================

-- Thêm stage "Sản xuất" nếu chưa có (dùng tên chính xác "Sản xuất")
INSERT INTO crm_pipeline_stages (name, color, icon, order_index, pipeline_type, is_won, is_lost, is_active)
SELECT 'Sản xuất', '#0EA5E9', '🏭', 6, 'deal', false, false, true
WHERE NOT EXISTS (
  SELECT 1 FROM crm_pipeline_stages
  WHERE pipeline_type = 'deal'
    AND name ILIKE '%Sản xuất%'
    AND is_active = true
);
