-- Migration 93: Đảm bảo FK production_pipeline_stages.crm_target_stage_id → crm_pipeline_stages
-- để PostgREST nhận quan hệ embed `crm_target_stage:crm_pipeline_stages(...)` (tránh lỗi schema cache).
-- Sau khi chạy: Supabase Dashboard → Settings → API → "Reload schema" (nếu vẫn báo relationship).

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS crm_target_stage_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_pipeline_stages'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'production_pipeline_stages' AND c.conname = 'fk_sx_pipe_crm_target'
  ) THEN
    ALTER TABLE production_pipeline_stages
      ADD CONSTRAINT fk_sx_pipe_crm_target
      FOREIGN KEY (crm_target_stage_id)
      REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;
