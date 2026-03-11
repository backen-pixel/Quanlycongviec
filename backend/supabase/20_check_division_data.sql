-- ═══════════════════════════════════════════════════════════════
-- KIỂM TRA DỮ LIỆU KHỐI & GÁN DỰ ÁN MẪU
-- ═══════════════════════════════════════════════════════════════

-- 1. KIỂM TRA 4 KHỐI ĐÃ TẠO
SELECT '📊 DANH SÁCH 4 KHỐI:' AS status;
SELECT 
  id,
  name,
  code,
  icon,
  description
FROM ecosystem_units
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
ORDER BY code;

-- 2. KIỂM TRA CÁC DỰ ÁN HIỆN TẠI
SELECT '📁 DANH SÁCH DỰ ÁN:' AS status;
SELECT 
  id,
  name,
  code,
  status,
  customer_name,
  created_at
FROM projects
ORDER BY created_at DESC
LIMIT 10;

-- 3. KIỂM TRA GÁN DỰ ÁN CHO KHỐI (project_company_assignments)
SELECT '🔗 DỰ ÁN ĐÃ GÁN CHO KHỐI:' AS status;
SELECT 
  pca.id,
  p.name AS project_name,
  p.code AS project_code,
  d.name AS division_name,
  d.code AS division_code,
  c.name AS company_name,
  pca.assigned_at
FROM project_company_assignments pca
JOIN projects p ON pca.project_id = p.id
JOIN ecosystem_units d ON pca.division_unit_id = d.id
LEFT JOIN ecosystem_units c ON pca.company_unit_id = c.id
ORDER BY pca.assigned_at DESC
LIMIT 10;

-- 4. ĐẾM TASKS THEO KHỐI
SELECT '📝 TASKS THEO KHỐI:' AS status;
SELECT 
  d.code AS division_code,
  d.name AS division_name,
  COUNT(DISTINCT pca.project_id) AS total_projects,
  COUNT(t.id) AS total_tasks,
  SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_tasks,
  SUM(CASE WHEN t.status = 'in-progress' THEN 1 ELSE 0 END) AS in_progress_tasks,
  SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending_tasks
FROM ecosystem_units d
JOIN project_company_assignments pca ON pca.division_unit_id = d.id
JOIN projects p ON pca.project_id = p.id
LEFT JOIN tasks t ON t.project_id = p.id
WHERE d.level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
GROUP BY d.id, d.code, d.name
ORDER BY d.code;

-- ═══════════════════════════════════════════════════════════════
-- NẾU CHƯA CÓ DỮ LIỆU, GÁN MẪU DỰ ÁN CHO CÁC KHỐI
-- ═══════════════════════════════════════════════════════════════

-- Uncomment để tạo dữ liệu mẫu:

/*
DO $$
DECLARE
  division_kd_id UUID;
  division_sx_id UUID;
  division_vc_id UUID;
  division_ld_id UUID;
  
  project1_id UUID;
  project2_id UUID;
  project3_id UUID;
BEGIN
  -- Lấy ID các Khối
  SELECT id INTO division_kd_id FROM ecosystem_units WHERE code = 'KD' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
  SELECT id INTO division_sx_id FROM ecosystem_units WHERE code = 'SX' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
  SELECT id INTO division_vc_id FROM ecosystem_units WHERE code = 'VC' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');
  SELECT id INTO division_ld_id FROM ecosystem_units WHERE code = 'LD' AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division');

  -- Lấy ID các dự án hiện có (top 3)
  SELECT id INTO project1_id FROM projects ORDER BY created_at DESC LIMIT 1 OFFSET 0;
  SELECT id INTO project2_id FROM projects ORDER BY created_at DESC LIMIT 1 OFFSET 1;
  SELECT id INTO project3_id FROM projects ORDER BY created_at DESC LIMIT 1 OFFSET 2;

  -- Gán dự án cho Khối Kinh doanh
  IF project1_id IS NOT NULL THEN
    INSERT INTO project_company_assignments (project_id, division_unit_id, company_unit_id, assigned_at)
    VALUES (project1_id, division_kd_id, NULL, NOW())
    ON CONFLICT DO NOTHING;
  END IF;

  -- Gán dự án cho Khối Sản xuất
  IF project2_id IS NOT NULL THEN
    INSERT INTO project_company_assignments (project_id, division_unit_id, company_unit_id, assigned_at)
    VALUES (project2_id, division_sx_id, NULL, NOW())
    ON CONFLICT DO NOTHING;
  END IF;

  -- Gán dự án cho Khối Vận chuyển
  IF project3_id IS NOT NULL THEN
    INSERT INTO project_company_assignments (project_id, division_unit_id, company_unit_id, assigned_at)
    VALUES (project3_id, division_vc_id, NULL, NOW())
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE '✅ Đã gán % dự án mẫu cho các Khối', 
    (SELECT COUNT(*) FROM (VALUES (project1_id), (project2_id), (project3_id)) AS t(id) WHERE t.id IS NOT NULL);
END $$;
*/

-- ═══════════════════════════════════════════════════════════════
-- TEST API ENDPOINTS (giả lập)
-- ═══════════════════════════════════════════════════════════════

SELECT '🧪 TEST: Dự án của Khối Kinh doanh' AS test;
SELECT 
  pca.project_id,
  p.name AS project_name,
  p.status,
  COUNT(t.id) AS total_tasks
FROM project_company_assignments pca
JOIN projects p ON pca.project_id = p.id
LEFT JOIN tasks t ON t.project_id = p.id
WHERE pca.division_unit_id = (
  SELECT id FROM ecosystem_units WHERE code = 'KD' 
  AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
)
GROUP BY pca.project_id, p.name, p.status;

SELECT '🧪 TEST: Task summary của Khối Sản xuất' AS test;
SELECT 
  COUNT(*) AS total_tasks,
  SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done,
  SUM(CASE WHEN t.status = 'in-progress' THEN 1 ELSE 0 END) AS in_progress,
  SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending
FROM project_company_assignments pca
JOIN tasks t ON t.project_id = pca.project_id
WHERE pca.division_unit_id = (
  SELECT id FROM ecosystem_units WHERE code = 'SX' 
  AND level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
);
