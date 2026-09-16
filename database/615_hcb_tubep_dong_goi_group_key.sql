-- 615: HCB Tủ bếp — cột lớn Đóng gói
-- «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG» tương ứng Vệ sinh đóng gói ở Cửa / Cánh kính.
-- Chỉ gán group_key; không bật is_packaging_done (tránh tự mở VC).

UPDATE production_pipeline_stages pps
SET group_key = 'dong_goi'
WHERE pps.id IN (
  SELECT pps2.id
  FROM production_pipeline_stages pps2
  JOIN companies c ON c.id = pps2.company_id
  JOIN workshop_project_types wt ON wt.id = pps2.workshop_type_id
  WHERE (c.short_name = 'HCB' OR c.name ILIKE '%Hucabi%')
    AND wt.name = 'Tủ bếp'
    AND lower(trim(pps2.name)) = 'đơn hàng đã chuẩn bị xong'
    AND coalesce(pps2.group_key, '') IS DISTINCT FROM 'dong_goi'
);

-- HOÀN TÁC:
-- UPDATE production_pipeline_stages pps
-- SET group_key = 'hoan_thien'
-- WHERE pps.id IN (
--   SELECT pps2.id
--   FROM production_pipeline_stages pps2
--   JOIN companies c ON c.id = pps2.company_id
--   JOIN workshop_project_types wt ON wt.id = pps2.workshop_type_id
--   WHERE (c.short_name = 'HCB' OR c.name ILIKE '%Hucabi%')
--     AND wt.name = 'Tủ bếp'
--     AND lower(trim(pps2.name)) = 'đơn hàng đã chuẩn bị xong'
-- );
