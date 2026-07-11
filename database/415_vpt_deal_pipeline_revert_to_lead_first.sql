-- 415_vpt_deal_pipeline_revert_to_lead_first.sql
-- Vạn Phú Thành: đưa cột «Chuyển về lead» lên đầu pipeline Deal CRM.
-- Idempotent.

BEGIN;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN id = 'f609f6f9-a4f8-4a2d-adbb-e76043d7fc02' THEN 0 ELSE 1 END,
        order_index
    ) AS new_order
  FROM crm_pipeline_stages
  WHERE pipeline_id = '78e6251c-aea1-46bc-a19f-a401f1de7f34'
    AND pipeline_type = 'deal'
)
UPDATE crm_pipeline_stages s
SET order_index = o.new_order
FROM ordered o
WHERE s.id = o.id;

COMMIT;
