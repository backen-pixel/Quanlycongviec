-- Fix: lead FB Phúc Đạt bị gắn stage Pipeline Chung thay vì CRM Pipeline công ty.
-- 1) Set default_stage_id = Mới. (Phúc Đạt) cho page FB còn null / trỏ Pipeline Chung
-- 2) Chuyển lead Phúc Đạt đang nằm trên Pipeline Chung sang stage tương ứng của Phúc Đạt

UPDATE facebook_pages
SET default_stage_id = '2907475f-6289-495e-8aea-5ba0ae0cd2b8',
    updated_at = NOW()
WHERE default_company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND (
    default_stage_id IS NULL
    OR default_stage_id = '7df9bd47-de19-44b3-833d-0bfbf6236fb5'
  );

WITH chung AS (
  SELECT s.id, s.name
  FROM crm_pipeline_stages s
  WHERE s.pipeline_id = '00000000-0000-0000-0000-000000000001'
    AND s.pipeline_type = 'lead'
),
phuc AS (
  SELECT s.id, s.name, s.order_index
  FROM crm_pipeline_stages s
  WHERE s.pipeline_id = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373'
    AND s.pipeline_type = 'lead'
    AND s.is_active = true
),
map AS (
  SELECT
    c.id AS old_stage_id,
    COALESCE(
      (SELECT p.id FROM phuc p WHERE REPLACE(LOWER(p.name), '.', '') = REPLACE(LOWER(c.name), '.', '') LIMIT 1),
      (SELECT p.id FROM phuc p WHERE c.name ILIKE 'Mới%' AND p.name ILIKE 'Mới%' LIMIT 1),
      (SELECT p.id FROM phuc p WHERE c.name ILIKE 'Mất%' AND p.name ILIKE 'Mất%' LIMIT 1),
      (SELECT p.id FROM phuc p WHERE c.name ILIKE 'Hot%' AND p.name ILIKE 'Hot%' LIMIT 1),
      (SELECT p.id FROM phuc p ORDER BY p.order_index LIMIT 1)
    ) AS new_stage_id
  FROM chung c
)
UPDATE crm_leads l
SET stage_id = m.new_stage_id,
    pipeline_id = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373',
    updated_at = NOW()
FROM map m
WHERE l.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND l.type = 'lead'
  AND l.stage_id = m.old_stage_id;
