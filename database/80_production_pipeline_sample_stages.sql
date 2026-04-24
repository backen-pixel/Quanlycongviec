-- Cột mẫu bổ sung cho pipeline xưởng (5 cột: từ nhận bản vẽ → nghiệm thu nội bộ)
-- Chạy trong Supabase SQL Editor. An toàn: mỗi bước chỉ insert khi chưa có slug tương ứng.
-- Cần có bảng production_pipeline_stages: database/53_production_pipeline_stages.sql
--
-- Tạo cột cờ bàn giao VC (cùng ý nghĩa với database/78 — chạy 80 đứng một mình cũng được)
ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_handover_to_logistics BOOLEAN DEFAULT false;

-- 1) Workflow stages
INSERT INTO workflow_stages (name, slug, color, icon, order_index, is_active)
SELECT 'Nhận bản vẽ & tối ưu', 'sx-sample-drawing', '#6366F1', '📐', 50, true
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'sx-sample-drawing');

INSERT INTO workflow_stages (name, slug, color, icon, order_index, is_active)
SELECT 'Cắt gia công (CNC)', 'sx-sample-cnc', '#D97706', '✂️', 51, true
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'sx-sample-cnc');

INSERT INTO workflow_stages (name, slug, color, icon, order_index, is_active)
SELECT 'Lắp ráp tại xưởng', 'sx-sample-assembly', '#0D9488', '🔩', 52, true
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'sx-sample-assembly');

INSERT INTO workflow_stages (name, slug, color, icon, order_index, is_active)
SELECT 'Sơn & hoàn thiện bề mặt', 'sx-sample-finishing', '#DB2777', '🎨', 53, true
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'sx-sample-finishing');

INSERT INTO workflow_stages (name, slug, color, icon, order_index, is_active)
SELECT 'Nghiệm thu nội bộ', 'sx-sample-internal-qa', '#4F46E5', '✅', 54, true
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'sx-sample-internal-qa');

-- 2) Production pipeline stages (order_index nối tiếp max hiện có)
INSERT INTO production_pipeline_stages (name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, is_handover_to_logistics)
SELECT 'Nhận bản vẽ & tối ưu', '#6366F1', '📐',
  (SELECT COALESCE(MAX(order_index), 0) + 1 FROM production_pipeline_stages),
  true, (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-drawing' LIMIT 1), NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-drawing' LIMIT 1)
);

INSERT INTO production_pipeline_stages (name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, is_handover_to_logistics)
SELECT 'Cắt gia công (CNC)', '#D97706', '✂️',
  (SELECT COALESCE(MAX(order_index), 0) + 1 FROM production_pipeline_stages),
  true, (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-cnc' LIMIT 1), NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-cnc' LIMIT 1)
);

INSERT INTO production_pipeline_stages (name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, is_handover_to_logistics)
SELECT 'Lắp ráp tại xưởng', '#0D9488', '🔩',
  (SELECT COALESCE(MAX(order_index), 0) + 1 FROM production_pipeline_stages),
  true, (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-assembly' LIMIT 1), NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-assembly' LIMIT 1)
);

INSERT INTO production_pipeline_stages (name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, is_handover_to_logistics)
SELECT 'Sơn & hoàn thiện bề mặt', '#DB2777', '🎨',
  (SELECT COALESCE(MAX(order_index), 0) + 1 FROM production_pipeline_stages),
  true, (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-finishing' LIMIT 1), NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-finishing' LIMIT 1)
);

INSERT INTO production_pipeline_stages (name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug, is_handover_to_logistics)
SELECT 'Nghiệm thu nội bộ', '#4F46E5', '✅',
  (SELECT COALESCE(MAX(order_index), 0) + 1 FROM production_pipeline_stages),
  true, (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-internal-qa' LIMIT 1), NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'sx-sample-internal-qa' LIMIT 1)
);

SELECT 'Migration 80: sample production pipeline stages — done' AS result;
