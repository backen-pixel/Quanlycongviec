-- Thêm các cột pipeline sản xuất: Lên kế hoạch, Kiểm tra QC, Đóng gói, Vận chuyển & lắp đặt

-- 1. Workflow stages mới
INSERT INTO workflow_stages (name, slug, color, icon, order_index)
SELECT 'Lên kế hoạch & vật tư', 'planning', '#8B5CF6', '📋', 4
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'planning');

INSERT INTO workflow_stages (name, slug, color, icon, order_index)
SELECT 'Kiểm tra QC', 'quality-check', '#0EA5E9', '🔍', 6
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'quality-check');

INSERT INTO workflow_stages (name, slug, color, icon, order_index)
SELECT 'Đóng gói & xuất kho', 'packaging', '#10B981', '📦', 7
WHERE NOT EXISTS (SELECT 1 FROM workflow_stages WHERE slug = 'packaging');

-- 2. Production pipeline stages
INSERT INTO production_pipeline_stages (name, color, icon, order_index, workflow_stage_id, is_active)
SELECT 'Lên kế hoạch & vật tư', '#8B5CF6', '📋', 5,
  (SELECT id FROM workflow_stages WHERE slug = 'planning' LIMIT 1), true
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'planning' LIMIT 1)
);

INSERT INTO production_pipeline_stages (name, color, icon, order_index, workflow_stage_id, is_active)
SELECT 'Kiểm tra QC', '#0EA5E9', '🔍', 15,
  (SELECT id FROM workflow_stages WHERE slug = 'quality-check' LIMIT 1), true
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'quality-check' LIMIT 1)
);

INSERT INTO production_pipeline_stages (name, color, icon, order_index, workflow_stage_id, is_active)
SELECT 'Đóng gói & xuất kho', '#10B981', '📦', 20,
  (SELECT id FROM workflow_stages WHERE slug = 'packaging' LIMIT 1), true
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'packaging' LIMIT 1)
);

INSERT INTO production_pipeline_stages (name, color, icon, order_index, workflow_stage_id, is_active)
SELECT 'Vận chuyển & lắp đặt', '#06B6D4', '🚚', 25,
  (SELECT id FROM workflow_stages WHERE slug = 'shipping' LIMIT 1), true
WHERE NOT EXISTS (
  SELECT 1 FROM production_pipeline_stages p
  WHERE p.workflow_stage_id = (SELECT id FROM workflow_stages WHERE slug = 'shipping' LIMIT 1)
);
