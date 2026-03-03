-- Migration 21: Nhóm quy trình thuộc Khối
DO $$ BEGIN
  ALTER TABLE workflow_stage_groups ADD COLUMN division_unit_id UUID REFERENCES ecosystem_units(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_stage_groups_division ON workflow_stage_groups(division_unit_id);
