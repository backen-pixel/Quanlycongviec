-- Pipeline Kanban riêng cho module Sản xuất (SX), tương tự crm_pipeline_stages.
-- Chạy migration này để bật cài đặt /sx/pipeline-settings.

CREATE TABLE IF NOT EXISTS production_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0f766e',
  icon TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  workflow_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
  bucket_slug TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS production_pipeline_stages_bucket_slug_uq
  ON production_pipeline_stages (bucket_slug)
  WHERE bucket_slug IS NOT NULL;

COMMENT ON TABLE production_pipeline_stages IS 'Cột Kanban SX: gắn workflow_stages hoặc bucket logic (deal CRM thắng chờ vào xưởng)';
COMMENT ON COLUMN production_pipeline_stages.workflow_stage_id IS 'Khớp project.current_stage_id — dùng khi kéo thả sang cột này';
COMMENT ON COLUMN production_pipeline_stages.bucket_slug IS 'won_pending: dự án có deal thắng nhưng chưa ở giai đoạn xưởng đã cấu hình';

ALTER TABLE production_pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON production_pipeline_stages;
CREATE POLICY "service_all" ON production_pipeline_stages FOR ALL USING (true);

-- Cột chờ + 3 giai đoạn xưởng mặc định (nếu chưa có dữ liệu)
INSERT INTO production_pipeline_stages (name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug)
SELECT 'Chờ vào xưởng (deal thắng)', '#64748b', '⏳', 0, true, NULL, 'won_pending'
WHERE NOT EXISTS (SELECT 1 FROM production_pipeline_stages WHERE bucket_slug = 'won_pending');

INSERT INTO production_pipeline_stages (name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug)
SELECT ws.name, COALESCE(NULLIF(TRIM(ws.color), ''), '#0f766e'), ws.icon,
  CASE ws.slug
    WHEN 'production' THEN 10
    WHEN 'delivery' THEN 20
    WHEN 'customer-care' THEN 30
    ELSE 40
  END,
  true, ws.id, NULL
FROM workflow_stages ws
WHERE ws.slug IN ('production', 'delivery', 'customer-care')
  AND NOT EXISTS (
    SELECT 1 FROM production_pipeline_stages p
    WHERE p.workflow_stage_id = ws.id
  );
