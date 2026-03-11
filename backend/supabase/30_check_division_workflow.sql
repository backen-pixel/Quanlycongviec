-- ═══════════════════════════════════════════════════════════════
-- KIỂM TRA DỮ LIỆU KHỐI & LUỒNG CÔNG VIỆC
-- ═══════════════════════════════════════════════════════════════

-- 1. KIỂM TRA 4 KHỐI ĐÃ TẠO
SELECT '📊 DANH SÁCH KHỐI (ecosystem_units):' AS status;
SELECT 
  id,
  name,
  code,
  short_name,
  icon,
  description
FROM ecosystem_units
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
ORDER BY code;

-- 2. KIỂM TRA LUỒNG CÔNG VIỆC (workflow_flows)
SELECT '🔄 DANH SÁCH LUỒNG:' AS status;
SELECT 
  id,
  name,
  description,
  is_default,
  is_active,
  created_at
FROM workflow_flows
ORDER BY created_at DESC
LIMIT 10;

-- 3. KIỂM TRA CÁC BƯỚC TRONG LUỒNG (workflow_flow_steps)
SELECT '📋 CÁC BƯỚC TRONG LUỒNG:' AS status;
SELECT 
  wf.name AS flow_name,
  wfs.order_index,
  d.code AS division_code,
  d.name AS division_name,
  c.name AS company_name,
  wfs.setup_days,
  wfs.setup_hours
FROM workflow_flow_steps wfs
JOIN workflow_flows wf ON wfs.flow_id = wf.id
JOIN ecosystem_units d ON wfs.division_unit_id = d.id
LEFT JOIN ecosystem_units c ON wfs.company_unit_id = c.id
ORDER BY wf.name, wfs.order_index
LIMIT 20;

-- 4. KIỂM TRA DỰ ÁN SỬ DỤNG LUỒNG
SELECT '📁 DỰ ÁN & LUỒNG:' AS status;
SELECT 
  p.id,
  p.name AS project_name,
  p.code AS project_code,
  p.status AS project_status,
  p.customer_name,
  wf.name AS flow_name,
  p.created_at
FROM projects p
LEFT JOIN workflow_flows wf ON p.flow_id = wf.id
ORDER BY p.created_at DESC
LIMIT 10;

-- 5. ĐẾM DỰ ÁN & TASKS THEO KHỐI
SELECT '📊 DỰ ÁN & TASKS THEO KHỐI:' AS status;
SELECT 
  d.code AS division_code,
  d.name AS division_name,
  COUNT(DISTINCT p.id) AS total_projects,
  COUNT(DISTINCT t.id) AS total_tasks,
  SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_tasks,
  SUM(CASE WHEN t.status = 'in-progress' THEN 1 ELSE 0 END) AS in_progress_tasks,
  SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending_tasks
FROM ecosystem_units d
JOIN workflow_flow_steps wfs ON wfs.division_unit_id = d.id
JOIN workflow_flows wf ON wfs.flow_id = wf.id
LEFT JOIN projects p ON p.flow_id = wf.id
LEFT JOIN tasks t ON t.project_id = p.id
WHERE d.level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
GROUP BY d.id, d.code, d.name
ORDER BY d.code;

-- 6. CHI TIẾT DỰ ÁN CỦA TỪNG KHỐI
SELECT '🔍 CHI TIẾT - DỰ ÁN CỦA KHỐI KINH DOANH (KD):' AS status;
SELECT DISTINCT
  p.id,
  p.name AS project_name,
  p.code AS project_code,
  p.status,
  p.customer_name,
  wf.name AS flow_name,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total_tasks,
  (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') AS completed_tasks
FROM workflow_flow_steps wfs
JOIN workflow_flows wf ON wfs.flow_id = wf.id
JOIN projects p ON p.flow_id = wf.id
WHERE wfs.division_unit_id = (
  SELECT id FROM ecosystem_units 
  WHERE code = 'KD' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
)
ORDER BY p.created_at DESC
LIMIT 10;

-- 7. TASKS CỦA KHỐI SẢN XUẤT (SX)
SELECT '📝 TASKS CỦA KHỐI SẢN XUẤT (SX):' AS status;
SELECT 
  t.id,
  t.title,
  t.status,
  t.priority,
  p.name AS project_name,
  u.full_name AS assignee
FROM workflow_flow_steps wfs
JOIN projects p ON p.flow_id = wfs.flow_id
JOIN tasks t ON t.project_id = p.id
LEFT JOIN users u ON t.assigned_to = u.id
WHERE wfs.division_unit_id = (
  SELECT id FROM ecosystem_units 
  WHERE code = 'SX' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
)
ORDER BY t.created_at DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════════════
-- PHÂN TÍCH & THỐNG KÊ
-- ═══════════════════════════════════════════════════════════════

-- 8. KIỂM TRA LUỒNG CÓ ĐỦ 4 KHỐI KHÔNG
SELECT '🔍 LUỒNG CÓ ĐỦ 4 KHỐI:' AS status;
SELECT 
  wf.name AS flow_name,
  COUNT(DISTINCT wfs.division_unit_id) AS num_divisions,
  STRING_AGG(DISTINCT d.code, ' → ' ORDER BY wfs.order_index) AS division_sequence
FROM workflow_flows wf
LEFT JOIN workflow_flow_steps wfs ON wfs.flow_id = wf.id
LEFT JOIN ecosystem_units d ON wfs.division_unit_id = d.id
GROUP BY wf.id, wf.name
ORDER BY wf.created_at DESC;

-- 9. DỰ ÁN KHÔNG CÓ LUỒNG (cần gán)
SELECT '⚠️  DỰ ÁN CHƯA CÓ LUỒNG:' AS status;
SELECT 
  p.id,
  p.name,
  p.code,
  p.status,
  p.customer_name,
  p.created_at
FROM projects p
WHERE p.flow_id IS NULL
ORDER BY p.created_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════
-- GÁN DỮ LIỆU MẪU (NẾU CẦN)
-- ═══════════════════════════════════════════════════════════════

-- NẾU CHƯA CÓ LUỒNG, TẠO LUỒNG MẪU VỚI 4 KHỐI
/*
DO $$
DECLARE
  flow_id UUID;
  kd_id UUID;
  sx_id UUID;
  vc_id UUID;
  ld_id UUID;
BEGIN
  -- Lấy ID 4 Khối
  SELECT id INTO kd_id FROM ecosystem_units WHERE code = 'KD' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
  SELECT id INTO sx_id FROM ecosystem_units WHERE code = 'SX' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
  SELECT id INTO vc_id FROM ecosystem_units WHERE code = 'VC' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
  SELECT id INTO ld_id FROM ecosystem_units WHERE code = 'LD' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');

  -- Tạo luồng mẫu
  INSERT INTO workflow_flows (name, description, is_default, is_active, color, icon)
  VALUES ('Luồng Tủ Bếp Chuẩn', 'Kinh doanh → Sản xuất → Vận chuyển → Lắp đặt & CSKH', true, true, '#6366F1', '🔄')
  RETURNING id INTO flow_id;

  -- Thêm 4 bước
  INSERT INTO workflow_flow_steps (flow_id, division_unit_id, order_index, setup_days, description)
  VALUES 
    (flow_id, kd_id, 1, 3, 'Tư vấn, thiết kế, báo giá, hợp đồng'),
    (flow_id, sx_id, 2, 7, 'Lên KH, vật tư, sản xuất, hoàn thiện'),
    (flow_id, vc_id, 3, 1, 'Vận chuyển đến công trình'),
    (flow_id, ld_id, 4, 2, 'Lắp đặt, nghiệm thu, CSKH');

  RAISE NOTICE '✅ Đã tạo luồng mẫu với ID: %', flow_id;
  
  -- Gán luồng cho các dự án chưa có luồng
  UPDATE projects 
  SET flow_id = flow_id
  WHERE flow_id IS NULL;
  
  RAISE NOTICE '✅ Đã gán luồng cho các dự án';
END $$;
*/
