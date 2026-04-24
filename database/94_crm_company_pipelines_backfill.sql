-- Migration 94: Mỗi công ty có pipeline CRM riêng (copy từ Pipeline Chung) + backfill lead/deal.pipeline_id + stage_id
-- Giả định:
-- - crm_pipelines, crm_pipeline_stages.pipeline_id, crm_leads.pipeline_id đã có (database/21_crm_pipelines.sql)
-- - crm_leads.company_id đã có (database/23_crm_company_filter.sql)
--
-- Chiến lược:
-- - Giữ lại "Pipeline Chung" (ID cố định) làm legacy.
-- - Với mỗi company có lead/deal nhưng chưa có pipeline: tạo pipeline mặc định + copy stages từ Pipeline Chung.
-- - Backfill crm_leads.pipeline_id theo company; map stage_id sang stage mới theo (pipeline_type, order_index).

DO $mig$
DECLARE
  v_common_pipeline UUID := '00000000-0000-0000-0000-000000000001';
  c RECORD;
  v_new_pipeline UUID;
BEGIN
  IF to_regclass('public.crm_pipelines') IS NULL THEN
    RAISE EXCEPTION 'crm_pipelines missing. Run database/21_crm_pipelines.sql first.';
  END IF;

  -- Ensure common pipeline exists
  INSERT INTO crm_pipelines (id, name, description, is_default, is_active)
  VALUES (v_common_pipeline, 'Pipeline Chung', 'Pipeline mặc định cho lead/deal cũ', true, true)
  ON CONFLICT DO NOTHING;

  -- Ensure all stages belong to a pipeline (fallback legacy)
  UPDATE crm_pipeline_stages
  SET pipeline_id = v_common_pipeline
  WHERE pipeline_id IS NULL;

  -- Ensure all leads/deals have pipeline_id at least common
  UPDATE crm_leads
  SET pipeline_id = v_common_pipeline
  WHERE pipeline_id IS NULL;

  FOR c IN
    SELECT DISTINCT l.company_id
    FROM crm_leads l
    WHERE l.company_id IS NOT NULL
  LOOP
    -- Skip if company already has at least one active pipeline
    IF EXISTS (
      SELECT 1 FROM crm_pipelines p
      WHERE p.company_id = c.company_id AND p.is_active = true
    ) THEN
      CONTINUE;
    END IF;

    -- Create default pipeline for this company
    INSERT INTO crm_pipelines (name, company_id, description, is_default, is_active)
    VALUES ('CRM Pipeline', c.company_id, 'Pipeline mặc định theo công ty (tạo tự động)', true, true)
    RETURNING id INTO v_new_pipeline;

    -- Copy stages from common pipeline (both lead + deal)
    INSERT INTO crm_pipeline_stages (name, color, icon, order_index, is_active, is_won, is_lost, pipeline_type, pipeline_id, send_zalo_on_enter, sync_role)
    SELECT
      s.name, s.color, s.icon, s.order_index, s.is_active, s.is_won, s.is_lost, s.pipeline_type, v_new_pipeline,
      COALESCE(s.send_zalo_on_enter, false),
      s.sync_role
    FROM crm_pipeline_stages s
    WHERE s.pipeline_id = v_common_pipeline;

    -- Backfill leads/deals into this company pipeline when they are still on common pipeline
    UPDATE crm_leads l
    SET pipeline_id = v_new_pipeline
    WHERE l.company_id = c.company_id
      AND l.pipeline_id = v_common_pipeline;

    -- Map stage_id by (pipeline_type, order_index) from common → new pipeline
    UPDATE crm_leads l
    SET stage_id = s_new.id
    FROM crm_pipeline_stages s_old
    JOIN crm_pipeline_stages s_new
      ON s_new.pipeline_id = v_new_pipeline
     AND s_new.pipeline_type = s_old.pipeline_type
     AND s_new.order_index = s_old.order_index
    WHERE l.company_id = c.company_id
      AND l.pipeline_id = v_new_pipeline
      AND l.stage_id = s_old.id
      AND s_old.pipeline_id = v_common_pipeline;
  END LOOP;
END
$mig$;

-- Index hỗ trợ query theo pipeline + company
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_company_active ON crm_pipelines(company_id, is_active);
