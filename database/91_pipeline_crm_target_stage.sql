-- Migration 91: Thêm crm_target_stage_id cho production_pipeline_stages và logistics_pipeline_stages
-- Cho phép admin cấu hình trực tiếp: khi project đến cột pipeline này
-- thì CRM deal tự động chuyển sang cột CRM được chỉ định.

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS crm_target_stage_id UUID;

ALTER TABLE logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS crm_target_stage_id UUID;

-- FK (graceful — bỏ qua nếu constraint đã tồn tại)
DO $$
BEGIN
  ALTER TABLE production_pipeline_stages
    ADD CONSTRAINT fk_sx_pipe_crm_target
    FOREIGN KEY (crm_target_stage_id)
    REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE logistics_pipeline_stages
    ADD CONSTRAINT fk_vc_pipe_crm_target
    FOREIGN KEY (crm_target_stage_id)
    REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;
