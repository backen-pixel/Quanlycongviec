-- Migration: Add source_process_id to company_template_sets
-- Tracks which company_process was used as base for this template

ALTER TABLE company_template_sets
ADD COLUMN IF NOT EXISTS source_process_id UUID REFERENCES company_processes(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_template_sets_source_process 
ON company_template_sets(source_process_id);

-- Comment
COMMENT ON COLUMN company_template_sets.source_process_id IS 'Quy trình nội bộ được dùng làm gốc để tạo template này';
