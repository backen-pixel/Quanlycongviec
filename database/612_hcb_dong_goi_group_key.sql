-- 612: Cột lớn «Đóng gói» — tách «Vệ sinh đóng gói» khỏi Hoàn thiện (HCB Cửa + Cánh kính)
-- group_key = dong_goi (nhãn FE: Đóng gói). is_packaging_done = true để trigger VC khi vào cột.

UPDATE production_pipeline_stages pps
SET group_key = 'dong_goi',
    is_packaging_done = true
WHERE pps.id IN (
  SELECT pps2.id
  FROM production_pipeline_stages pps2
  JOIN companies c ON c.id = pps2.company_id
  JOIN workshop_project_types wt ON wt.id = pps2.workshop_type_id
  WHERE c.short_name = 'HCB'
    AND wt.name IN ('Cửa', 'Cánh kính')
    AND lower(trim(pps2.name)) = 'vệ sinh đóng gói'
);

-- HOÀN TÁC:
-- UPDATE production_pipeline_stages pps
-- SET group_key = 'hoan_thien'
-- WHERE pps.id IN (
--   SELECT pps2.id
--   FROM production_pipeline_stages pps2
--   JOIN companies c ON c.id = pps2.company_id
--   JOIN workshop_project_types wt ON wt.id = pps2.workshop_type_id
--   WHERE c.short_name = 'HCB'
--     AND wt.name IN ('Cửa', 'Cánh kính')
--     AND lower(trim(pps2.name)) = 'vệ sinh đóng gói'
-- );
