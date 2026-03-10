-- Quick check and seed for ecosystem data
-- Run this in Supabase SQL Editor

-- 1. Check if ecosystem_levels exists and has data
SELECT COUNT(*) as levels_count FROM ecosystem_levels;

-- 2. Check if any ecosystem_units (Khối) exist
SELECT COUNT(*) as units_count FROM ecosystem_units WHERE level_id = (
  SELECT id FROM ecosystem_levels WHERE slug = 'division' LIMIT 1
);

-- 3. If no Khối exists, create sample data
-- Get level IDs first
DO $$
DECLARE
  group_level_id UUID;
  division_level_id UUID;
  subsidiary_level_id UUID;
  group_unit_id UUID;
  division_sx_id UUID;
  division_kd_id UUID;
  division_ht_id UUID;
BEGIN
  -- Get level IDs
  SELECT id INTO group_level_id FROM ecosystem_levels WHERE slug = 'group';
  SELECT id INTO division_level_id FROM ecosystem_levels WHERE slug = 'division';
  SELECT id INTO subsidiary_level_id FROM ecosystem_levels WHERE slug = 'subsidiary';

  -- Check if Tập đoàn exists
  SELECT id INTO group_unit_id FROM ecosystem_units WHERE level_id = group_level_id LIMIT 1;
  
  -- If not, create Tập đoàn
  IF group_unit_id IS NULL THEN
    INSERT INTO ecosystem_units (name, short_name, slug, level_id, parent_id, color, icon, description)
    VALUES ('Tập đoàn TuBep Pro', 'TBP', 'tubep-group', group_level_id, NULL, '#1E40AF', '🏛️', 'Tập đoàn sản xuất tủ bếp')
    RETURNING id INTO group_unit_id;
    RAISE NOTICE 'Created Tập đoàn: %', group_unit_id;
  END IF;

  -- Create 3 Khối (Divisions)
  INSERT INTO ecosystem_units (name, short_name, slug, level_id, parent_id, color, icon, description)
  VALUES 
    ('Khối Sản xuất', 'SX', 'production-division', division_level_id, group_unit_id, '#F59E0B', '🏭', 'Khối sản xuất tủ bếp'),
    ('Khối Kinh doanh', 'KD', 'business-division', division_level_id, group_unit_id, '#3B82F6', '💼', 'Khối tư vấn và bán hàng'),
    ('Khối Hỗ trợ', 'HT', 'support-division', division_level_id, group_unit_id, '#10B981', '🛠️', 'Khối hỗ trợ và vận hành')
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO division_sx_id;

  -- Get division IDs
  SELECT id INTO division_sx_id FROM ecosystem_units WHERE slug = 'production-division';
  SELECT id INTO division_kd_id FROM ecosystem_units WHERE slug = 'business-division';
  SELECT id INTO division_ht_id FROM ecosystem_units WHERE slug = 'support-division';

  -- Create companies under each division
  INSERT INTO ecosystem_units (name, short_name, slug, level_id, parent_id, color, icon, description)
  VALUES 
    -- Sản xuất companies
    ('Công ty Xưởng 1', 'X1', 'factory-1', subsidiary_level_id, division_sx_id, '#F59E0B', '🏭', 'Xưởng sản xuất chính'),
    ('Công ty Xưởng 2', 'X2', 'factory-2', subsidiary_level_id, division_sx_id, '#F59E0B', '🏭', 'Xưởng sản xuất phụ'),
    -- Kinh doanh companies
    ('Công ty Bán hàng HN', 'HN', 'sales-hn', subsidiary_level_id, division_kd_id, '#3B82F6', '💼', 'Chi nhánh Hà Nội'),
    ('Công ty Bán hàng HCM', 'HCM', 'sales-hcm', subsidiary_level_id, division_kd_id, '#3B82F6', '💼', 'Chi nhánh TP.HCM'),
    -- Hỗ trợ companies
    ('Công ty Vận chuyển', 'VC', 'logistics', subsidiary_level_id, division_ht_id, '#10B981', '🚛', 'Đội ngũ vận chuyển'),
    ('Công ty Lắp đặt', 'LD', 'installation', subsidiary_level_id, division_ht_id, '#10B981', '🔧', 'Đội ngũ lắp đặt')
  ON CONFLICT (slug) DO NOTHING;

  RAISE NOTICE 'Ecosystem seed data created successfully!';
END $$;

-- 4. Verify the result
SELECT 
  eu.name as division_name,
  COUNT(DISTINCT c.id) as company_count
FROM ecosystem_units eu
LEFT JOIN ecosystem_units c ON c.parent_id = eu.id
WHERE eu.level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
GROUP BY eu.id, eu.name
ORDER BY eu.name;

-- 5. Show all ecosystem structure
SELECT 
  l.name as level_name,
  eu.name as unit_name,
  eu.short_name,
  p.name as parent_name
FROM ecosystem_units eu
JOIN ecosystem_levels l ON eu.level_id = l.id
LEFT JOIN ecosystem_units p ON eu.parent_id = p.id
ORDER BY l.depth, eu.name;
