-- Lead FB Phúc Đạt Kitchen / Nhà thầu nhôm kính Phúc Đạt bị gắn stage TIẾP NHẬN (Vạn Phú Thành)
-- khi page chưa có default_stage_id. Chuyển về Mới. + CRM Pipeline Phúc Đạt.

UPDATE crm_leads l
SET stage_id = '2907475f-6289-495e-8aea-5ba0ae0cd2b8',
    pipeline_id = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373',
    updated_at = NOW()
WHERE l.id IN (
  SELECT DISTINCT l2.id
  FROM crm_leads l2
  JOIN facebook_contacts fc ON fc.lead_id = l2.id
  JOIN facebook_pages fp ON fp.page_id = fc.page_id
  JOIN crm_pipeline_stages s ON s.id = l2.stage_id
  WHERE fp.page_name IN ('Phúc Đạt Kitchen', 'Nhà thầu nhôm kính Phúc Đạt')
    AND l2.company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND l2.type = 'lead'
    AND s.pipeline_id <> '6017bdcd-5683-4f81-9f84-4a5e7bc8d373'
);
