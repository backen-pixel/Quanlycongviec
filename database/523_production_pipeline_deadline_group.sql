-- Nhóm deadline cột pipeline SX: gắn với kế hoạch tính từ ngày lắp
-- (kế hoạch / hoàn thiện thùng / hoàn thiện / đóng hàng).

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS deadline_group TEXT;

COMMENT ON COLUMN production_pipeline_stages.deadline_group IS
  'Nhóm deadline theo kế hoạch lắp: planning | cabinet | finishing | packing (NULL = chưa gán).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_pipeline_stages_deadline_group_chk'
  ) THEN
    ALTER TABLE production_pipeline_stages
      ADD CONSTRAINT production_pipeline_stages_deadline_group_chk
      CHECK (
        deadline_group IS NULL
        OR deadline_group IN ('planning', 'cabinet', 'finishing', 'packing')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_deadline_group
  ON production_pipeline_stages (company_id, deadline_group)
  WHERE deadline_group IS NOT NULL;
