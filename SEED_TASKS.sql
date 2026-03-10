-- Create sample tasks for testing dashboard workload widget
-- Run this AFTER running SEED_ECOSYSTEM.sql

-- 1. Get company IDs
DO $$
DECLARE
  factory1_id UUID;
  factory2_id UUID;
  sales_hn_id UUID;
  sales_hcm_id UUID;
  logistics_id UUID;
  installation_id UUID;
  admin_user_id UUID;
  test_project_id UUID;
BEGIN
  -- Get company IDs
  SELECT id INTO factory1_id FROM ecosystem_units WHERE slug = 'factory-1';
  SELECT id INTO factory2_id FROM ecosystem_units WHERE slug = 'factory-2';
  SELECT id INTO sales_hn_id FROM ecosystem_units WHERE slug = 'sales-hn';
  SELECT id INTO sales_hcm_id FROM ecosystem_units WHERE slug = 'sales-hcm';
  SELECT id INTO logistics_id FROM ecosystem_units WHERE slug = 'logistics';
  SELECT id INTO installation_id FROM ecosystem_units WHERE slug = 'installation';

  -- Get admin user (or first user)
  SELECT id INTO admin_user_id FROM users ORDER BY created_at LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found. Please create a user first.';
  END IF;

  -- Create a test project
  INSERT INTO projects (code, name, status, created_by_id)
  VALUES ('TEST-001', 'Dự án Test Dashboard', 'producing', admin_user_id)
  RETURNING id INTO test_project_id;

  -- Create departments for each company (if not exist)
  -- Factory 1 departments
  INSERT INTO departments (name, company_id) 
  SELECT 'Phòng Sản xuất', factory1_id
  WHERE NOT EXISTS (SELECT 1 FROM departments WHERE company_id = factory1_id)
  LIMIT 1;

  INSERT INTO departments (name, company_id)
  SELECT 'Phòng Kinh doanh', sales_hn_id
  WHERE NOT EXISTS (SELECT 1 FROM departments WHERE company_id = sales_hn_id)
  LIMIT 1;

  -- Create sample tasks assigned to users in each company
  -- Note: This assumes users have department_id set
  -- You may need to manually assign users to departments first

  -- Create 60 tasks for Factory 1
  INSERT INTO tasks (title, status, priority, assignee_id, project_id, created_by_id)
  SELECT 
    'Task ' || generate_series || ' - Xưởng 1',
    (ARRAY['pending', 'in_progress', 'review'])[1 + (generate_series % 3)],
    (ARRAY['low', 'medium', 'high'])[1 + (generate_series % 3)],
    admin_user_id,
    test_project_id,
    admin_user_id
  FROM generate_series(1, 60);

  RAISE NOTICE 'Created 60 sample tasks';
  RAISE NOTICE 'Test project ID: %', test_project_id;
  RAISE NOTICE 'Admin user ID: %', admin_user_id;
  RAISE NOTICE 'Please manually:';
  RAISE NOTICE '1. Assign users to departments (UPDATE users SET department_id = ...)';
  RAISE NOTICE '2. Link departments to companies (departments.company_id)';
  RAISE NOTICE '3. Then dashboard will show task distribution';
END $$;

-- 2. Quick check: Show user → department → company mapping
SELECT 
  u.full_name,
  d.name as department,
  c.name as company,
  div.name as division
FROM users u
LEFT JOIN departments d ON u.department_id = d.id
LEFT JOIN ecosystem_units c ON d.company_id = c.id
LEFT JOIN ecosystem_units div ON c.parent_id = div.id
ORDER BY u.full_name;

-- 3. Show task count per department/company
SELECT 
  c.name as company,
  div.name as division,
  COUNT(t.id) as task_count
FROM tasks t
JOIN users u ON t.assignee_id = u.id
JOIN departments d ON u.department_id = d.id
JOIN ecosystem_units c ON d.company_id = c.id
JOIN ecosystem_units div ON c.parent_id = div.id
WHERE t.status != 'done'
GROUP BY c.id, c.name, div.name, div.id
ORDER BY div.name, c.name;
