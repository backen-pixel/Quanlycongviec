-- 579: Ensure Logistics pipelines have a real Customer Care/Warranty handoff.
--
-- The stage is inserted immediately before each active completed column for
-- global and company-scoped pipelines that do not already expose
-- crm_sync_type=customer_care. Existing columns are retained and only their
-- order_index at/after the completed column is shifted by one.

BEGIN;

DO $$
DECLARE
  final_stage RECORD;
  customer_care_workflow_stage_id UUID;
BEGIN
  SELECT id INTO customer_care_workflow_stage_id
  FROM workflow_stages
  WHERE slug = 'customer-care'
  ORDER BY order_index NULLS LAST, created_at NULLS LAST
  LIMIT 1;

  FOR final_stage IN
    SELECT DISTINCT ON (s.company_id)
      s.company_id,
      s.order_index
    FROM logistics_pipeline_stages s
    WHERE s.is_active = true
      AND (
        lower(coalesce(s.bucket_slug, '')) IN ('completed', 'done', 'install_completed')
        OR lower(s.name) IN ('hoàn thành', 'hoàn thiện')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM logistics_pipeline_stages care
        WHERE care.company_id IS NOT DISTINCT FROM s.company_id
          AND care.is_active = true
          AND (
            care.crm_sync_type = 'customer_care'
            OR lower(coalesce(care.bucket_slug, '')) IN ('customer_care', 'customer-care', 'warranty')
          )
      )
    ORDER BY s.company_id, s.order_index DESC
  LOOP
    UPDATE logistics_pipeline_stages
    SET order_index = order_index + 1
    WHERE company_id IS NOT DISTINCT FROM final_stage.company_id
      AND order_index >= final_stage.order_index;

    INSERT INTO logistics_pipeline_stages (
      company_id,
      name,
      color,
      icon,
      order_index,
      is_active,
      progress_percent,
      workflow_stage_id,
      bucket_slug,
      crm_sync_type
    ) VALUES (
      final_stage.company_id,
      'Bảo hành / CSKH',
      '#0f766e',
      '❤️',
      final_stage.order_index,
      true,
      95,
      customer_care_workflow_stage_id,
      'customer_care',
      'customer_care'
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_logistics_pipeline_customer_care_scope
  ON logistics_pipeline_stages (company_id, crm_sync_type, is_active)
  WHERE crm_sync_type = 'customer_care';

COMMIT;
