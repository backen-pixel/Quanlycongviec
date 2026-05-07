-- Migration 140: Gán công ty VC/Lắp đặt cho dự án khi bàn giao từ SX
-- Mục tiêu: cho phép 1 dự án SX bàn giao sang pipeline VC của công ty khác (logistics company).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS logistics_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_logistics_company_id ON projects(logistics_company_id);

SELECT 'Migration 140 done' AS result;

