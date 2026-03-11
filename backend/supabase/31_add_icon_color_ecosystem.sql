-- Migration 31: Add icon and color to ecosystem_units
-- Để hiển thị icon/color cho Khối trên Dashboard

-- Thêm cột icon và color
ALTER TABLE ecosystem_units ADD COLUMN IF NOT EXISTS icon VARCHAR(20);
ALTER TABLE ecosystem_units ADD COLUMN IF NOT EXISTS color VARCHAR(20);

-- Comment
COMMENT ON COLUMN ecosystem_units.icon IS 'Emoji icon for display (e.g. 💼, 🏭, 🚛, 🔧)';
COMMENT ON COLUMN ecosystem_units.color IS 'Hex color code (e.g. #3B82F6)';

-- Update 4 Khối với icon và color mặc định
UPDATE ecosystem_units 
SET 
  icon = CASE 
    WHEN code = 'KD' THEN '💼'
    WHEN code = 'SX' THEN '🏭'
    WHEN code = 'VC' THEN '🚛'
    WHEN code = 'LD' THEN '🔧'
    ELSE icon
  END,
  color = CASE 
    WHEN code = 'KD' THEN '#3B82F6'
    WHEN code = 'SX' THEN '#F59E0B'
    WHEN code = 'VC' THEN '#10B981'
    WHEN code = 'LD' THEN '#EF4444'
    ELSE color
  END
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
  AND code IN ('KD', 'SX', 'VC', 'LD');

-- Verify
SELECT code, name, icon, color 
FROM ecosystem_units 
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
ORDER BY code;
